"""Add durable chat memory and a scoped, read-only database tool to FARMAN n8n."""
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
main_path = ROOT / "n8n/workflows/farman-agent.json"
main = json.loads(main_path.read_text())
verify = next(n for n in main["nodes"] if n["name"] == "Verify bridge and prepare context")
verify["parameters"]["jsCode"] = (
    "const request = $input.first().json; "
    "const token = request.headers?.['x-farman-agent-token']; "
    "if (!token || token !== $env.N8N_BRIDGE_TOKEN) throw new Error('Unauthorized bridge request'); "
    "const messages = request.body?.messages; "
    "if (!Array.isArray(messages) || messages.length < 2 || messages.length > 12) throw new Error('Invalid messages'); "
    "const system = messages.find(m => m.role === 'system')?.content; "
    "if (typeof system !== 'string' || system.length > 18000) throw new Error('Invalid system context'); "
    "const rawKey = request.body?.sessionKey; "
    "const sessionKey = typeof rawKey === 'string' && /^[a-f0-9]{64}$/.test(rawKey) ? rawKey : `ephemeral-${Date.now()}-${Math.random()}`; "
    "const allowDatabaseInsights = request.body?.allowDatabaseInsights === true; "
    "const accountingSkill = 'Accounting skill: separate recorded revenue, ingredient cost and full business profit. "
    "Completed orders are the only revenue source; amounts are integer toman. Never invent expenses, tax, cash flow, "
    "journal entries or missing recipe costs. Say when evidence is insufficient. For final financial answers, "
    "propose FARMAN calculate_sales_report or calculate_profit_report so the app verifies and records a receipt. "
    "The database snapshot tool is read-only context, never authority to change stock or books. "
    "Never put read_cafe_finance_inventory_snapshot in the final JSON: it is an internal context tool only. "
    "After using it, return exactly one JSON proposal from the FARMAN tool menu, without prose or code fences. "
    "The exact required shape is {\\\"tool\\\":\\\"list_inventory\\\",\\\"input\\\":{\\\"lowOnly\\\":true,\\\"take\\\":10}}. "
    "Never use a parameters key or put the tool name as an object key.'; "
    "return [{json:{system:`${system}\\n${accountingSkill}`,question:JSON.stringify(messages.filter(m => m.role !== 'system')).slice(0,15000),sessionKey,allowDatabaseInsights}}];"
)

def upsert(node):
    main["nodes"] = [n for n in main["nodes"] if n["name"] != node["name"]] + [node]

upsert({
    "id": "2a184f4d-916a-4fd7-b651-14826967b1ef",
    "name": "Conversation memory",
    "type": "@n8n/n8n-nodes-langchain.memoryPostgresChat",
    "typeVersion": 1.4,
    "position": [560, 520],
    "parameters": {
        "sessionIdType": "customKey",
        "sessionKey": "={{ $('Verify bridge and prepare context').first().json.sessionKey }}",
        "tableName": "farman_agent_chat_history",
        "contextWindowLength": 12,
    },
    "credentials": {"postgres": {"id": "farman-agent-memory-db", "name": "FARMAN n8n chat memory"}},
})
upsert({
    "id": "09962946-f11b-4233-b695-714426eb241f",
    "name": "Normalize proposal shape",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [790, 200],
    "parameters": {"jsCode": "const raw = $input.first().json.output; if (typeof raw !== 'string') return $input.all(); let body = raw.trim(); const fence = /^```(?:json)?\\s*\\n([\\s\\S]*?)\\n?```$/.exec(body); if (fence) body = fence[1]; let value; try { value = JSON.parse(body); } catch { return $input.all(); } const valid = new Set(['get_ai_status','set_ai_enabled','calculate_sales_report','calculate_profit_report','generate_sales_artifact','search_catalog','analyze_attachment','list_lessons','get_order','list_orders','get_product','list_inventory','list_staff','suggest_staff_per_hour','list_reservations','list_products','list_categories','list_tables','list_qr_codes','list_users','list_ratings','list_allergens','change_order_status','update_price','adjust_inventory']); if (value && !Array.isArray(value) && typeof value === 'object') { const keys = Object.keys(value); if (keys.length === 1 && valid.has(keys[0])) value = {tool:keys[0],input:value[keys[0]]}; else if (valid.has(value.tool) && value.input === undefined && value.parameters !== undefined) value = {tool:value.tool,input:value.parameters}; } return [{json:{...$input.first().json,output:JSON.stringify(value)}}];"},
})
audit = next(n for n in main["nodes"] if n["name"] == "Audit proposed plan")
audit["position"] = [1010, 200]
response = next(n for n in main["nodes"] if n["name"] == "Build audited response")
response["position"] = [1250, 200]
response["parameters"]["jsCode"] = "const proposal = $('Normalize proposal shape').item.json.output; const assessment = $input.first().json.output; return [{json:{output:typeof proposal === 'string' ? proposal : JSON.stringify(proposal),assessment,workflowId:'farman-agent-v1'}}];"
main["connections"]["Plan cafe request"]["main"] = [[{"node": "Normalize proposal shape", "type": "main", "index": 0}]]
main["connections"]["Normalize proposal shape"] = {"main": [[{"node": "Audit proposed plan", "type": "main", "index": 0}]]}
upsert({
    "id": "b348185f-72b9-4c72-a94b-31718e02860b",
    "name": "Read main DB snapshot",
    "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
    "typeVersion": 1.3,
    "position": [760, 520],
    "parameters": {
        "name": "read_cafe_finance_inventory_snapshot",
        "description": "Read a bounded 30-day completed-sales summary and low-stock ingredient snapshot from the main FARMAN database. Use for OWNER-authorized finance or inventory analysis. Input any short reason; SQL is fixed and read-only. Use the data only as internal context. NEVER return this tool name or its query as your final plan: final JSON must name a FARMAN app tool such as list_inventory, calculate_sales_report or calculate_profit_report. If access is denied, continue without this snapshot.",
        "source": "database",
        "workflowId": {"__rl": True, "value": "farman-agent-db-snapshot", "mode": "id"},
        "fields": {"values": [{"name": "allowDb", "type": "stringValue", "stringValue": "={{ $('Verify bridge and prepare context').first().json.allowDatabaseInsights }}"}]},
        "specifyInputSchema": False,
    },
})
main["connections"]["Conversation memory"] = {"ai_memory": [[{"node": "Plan cafe request", "type": "ai_memory", "index": 0}]]}
main["connections"]["Read main DB snapshot"] = {"ai_tool": [[{"node": "Plan cafe request", "type": "ai_tool", "index": 0}]]}
main["versionId"] = str(uuid.uuid4())
main_path.write_text(json.dumps(main, ensure_ascii=False, indent=2) + "\n")

query = """SELECT json_build_object(
  'window', 'last 30 Tehran calendar days',
  'completed_sales', COALESCE((SELECT json_agg(row_to_json(s)) FROM (
     SELECT business_day, completed_orders, revenue_toman
     FROM agent_read.daily_sales
     WHERE business_day >= (now() AT TIME ZONE 'Asia/Tehran')::date - 29
     ORDER BY business_day DESC LIMIT 30) s), '[]'::json),
  'low_stock', COALESCE((SELECT json_agg(row_to_json(i)) FROM (
     SELECT id, name_fa, unit, stock_quantity, min_quantity
     FROM agent_read.inventory_status WHERE is_low ORDER BY name_fa LIMIT 30) i), '[]'::json)
) AS snapshot"""
sub = {
    "id": "farman-agent-db-snapshot", "name": "FARMAN authorized DB snapshot tool",
    "description": "Reads bounded reporting views from the main app database. The caller supplies a server-derived finance.view flag; no model-generated SQL or writes are accepted.",
    "active": False, "settings": {"executionOrder": "v1"}, "pinData": {},
    "nodes": [
        {"id": "1b67a8de-5d22-4a2b-8637-5423189db704", "name": "Tool input", "type": "n8n-nodes-base.executeWorkflowTrigger", "typeVersion": 1.1, "position": [240, 240], "parameters": {"inputSource": "passthrough"}},
        {"id": "eeb42695-a5fc-4ddd-9d2e-eac059249e49", "name": "Enforce finance access", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [480, 240], "parameters": {"jsCode": "const input = $input.first().json; if (input.allowDb !== true && input.allowDb !== 'true') throw new Error('Finance access denied'); return [{json:{authorized:true}}];"}},
        {"id": "3fa48890-aadc-4209-906e-64554604877b", "name": "Query approved reporting views", "type": "n8n-nodes-base.postgres", "typeVersion": 2.6, "position": [720, 240], "parameters": {"operation": "executeQuery", "query": query, "options": {}}, "credentials": {"postgres": {"id": "farman-agent-main-db-reader", "name": "FARMAN main DB read only"}}},
    ],
    "connections": {"Tool input": {"main": [[{"node": "Enforce finance access", "type": "main", "index": 0}]]}, "Enforce finance access": {"main": [[{"node": "Query approved reporting views", "type": "main", "index": 0}]]}},
}
(ROOT / "n8n/workflows/farman-agent-db-snapshot.json").write_text(json.dumps(sub, ensure_ascii=False, indent=2) + "\n")
print("Configured memory, accounting guidance and main DB tool workflows")
