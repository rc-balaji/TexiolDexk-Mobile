import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../app/src/main/assets/cloud-common.js', import.meta.url), 'utf8');
let fetchCalls = 0;
let signal;
let received = null;
const fetch = async (url) => {
  fetchCalls += 1;
  return {
    ok: true,
    async json() {
      return { events: [{ seq: 1, payload: { type: 'session.response', sessionId: 'race-test', payload: { allowed: true } } }] };
    },
    async text() { return ''; }
  };
};
const context = {
  window: {}, crypto: webcrypto, fetch,
  TextEncoder, TextDecoder, Uint8Array, DataView, ArrayBuffer, Blob,
  URL, URLSearchParams, Response,
  setTimeout, clearTimeout, queueMicrotask, console
};
vm.runInNewContext(source, context, { filename: 'cloud-common.js' });
signal = context.window.DexkCloud.localSignalling('http://127.0.0.1:45910');
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(fetchCalls, 0, 'event polling started before any message handler was installed');
signal.onMessage(message => { received = message; signal.close(); });
for (let i = 0; i < 50 && !received; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(received?.type, 'session.response');
assert.equal(received?.sessionId, 'race-test');
console.log('Mobile handler-first signalling validation passed');
