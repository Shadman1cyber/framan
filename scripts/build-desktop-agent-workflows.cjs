'use strict';

// The installed desktop database is SQLite. Keep the server/Postgres workflow
// intact and ship a local variant that reads only the app's bounded API.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const source = path.join(root, 'n8n', 'workflows');
const target = path.join(root, 'vendor', 'windows-n8n', 'workflows');
fs.mkdirSync(target, { recursive: true });

const main = JSON.parse(fs.readFileSync(path.join(source, 'farman-agent.json'), 'utf8'));
const memory = main.nodes.find(node => node.name === 'Conversation memory');
memory.type = '@n8n/n8n-nodes-langchain.memoryBufferWindow';
memory.typeVersion = 1.3;
memory.parameters = {
  sessionIdType: 'customKey',
  sessionKey: "={{ $('Verify bridge and prepare context').first().json.sessionKey }}",
  contextWindowLength: 12,
};
delete memory.credentials;

const snapshot = JSON.parse(fs.readFileSync(path.join(source, 'farman-agent-db-snapshot.json'), 'utf8'));
const query = snapshot.nodes.find(node => node.name === 'Query approved reporting views');
query.name = 'Read bounded local snapshot';
query.type = 'n8n-nodes-base.httpRequest';
query.typeVersion = 4.2;
query.parameters = {
  method: 'POST',
  url: "={{ $env.FARMAN_LOCAL_URL + '/api/internal/agent/snapshot' }}",
  sendHeaders: true,
  headerParameters: { parameters: [{ name: 'X-Farman-Agent-Token', value: '={{ $env.N8N_BRIDGE_TOKEN }}' }] },
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({allowDb:true}) }}',
  options: { timeout: 10000 },
};
delete query.credentials;
snapshot.connections['Enforce finance access'].main[0][0].node = query.name;
fs.writeFileSync(path.join(target, 'farman-agent.json'), JSON.stringify(main, null, 2) + '\n');
fs.writeFileSync(path.join(target, 'farman-agent-db-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
console.log('Prepared desktop n8n workflows');
