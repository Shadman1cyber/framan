const Module = require('module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent) {
  if (request === '@langchain/core/utils/uuid') console.error('UUID_CALLER=' + (parent && parent.filename));
  return resolve.apply(this, arguments);
};
