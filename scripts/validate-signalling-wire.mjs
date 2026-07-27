import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app/src/main/assets/cloud-controller.js', import.meta.url), 'utf8');
const common = fs.readFileSync(new URL('../app/src/main/assets/cloud-common.js', import.meta.url), 'utf8');

if (source.includes('rid=requestId')) {
  throw new Error('Controller still attaches the request ID to every signalling message');
}
if (/requestId\s*:\s*null/.test(source)) {
  throw new Error('Controller serializes a null requestId');
}
if (!source.includes("type:'session.request'") || !source.includes('sessionId,requestId,payload')) {
  throw new Error('Initial session request is missing its correlation IDs');
}
if (!source.includes("message.type==='server.error'")) {
  throw new Error('Controller does not surface signalling validation errors');
}

if (!source.includes("await diag('response-received'") || !source.includes("message.messageType==='signal.offer'")) {
  throw new Error('Mobile controller is missing accepted-response/offer-delivery diagnostics');
}
if (!common.includes('if(!started){started=true;queueMicrotask(loop);}')) {
  throw new Error('Mobile local signalling can poll before its message handler is attached');
}
console.log('Mobile signalling wire validation passed');
