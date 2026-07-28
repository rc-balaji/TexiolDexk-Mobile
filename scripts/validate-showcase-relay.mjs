import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { TextEncoder, TextDecoder } from 'node:util';

const commonPath = process.argv[2];
const controllerPath = process.argv[3];
const hostPath = process.argv[4] || '';
if (!commonPath || !controllerPath) throw new Error('usage: validate-showcase-relay.mjs <cloud-common.js> <cloud-controller.js> [cloud-host.js]');
const context={window:{},TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,Map,Set,Date,Math,JSON,Error,setTimeout,clearTimeout,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')};
vm.createContext(context);vm.runInContext(fs.readFileSync(commonPath,'utf8'),context);
const C=context.window.DexkCloud;assert.ok(C?.arrayBufferToBase64&&C?.base64ToArrayBuffer,'relay base64 helpers missing');
const original=new Uint8Array(920123);for(let i=0;i<original.length;i++)original[i]=(i*31+7)&255;
const chunks=C.frameChunks({seq:77,width:1920,height:1080},original.buffer,32*1024);
let completed=null;const assembler=C.createFrameAssembler({timeoutMs:2000,maxPending:4,onFrame:(meta,bytes)=>{completed={meta,bytes:new Uint8Array(bytes)}}});
for(const chunk of [...chunks].reverse()){const encoded=C.arrayBufferToBase64(chunk),decoded=C.base64ToArrayBuffer(encoded);assert.ok(encoded.length<60000,'relay JSON chunk would approach the 64 KB signalling limit');assembler.push(decoded);}
assert.ok(completed,'relayed frame did not reassemble');assert.equal(completed.meta.seq,77);assert.deepEqual(completed.bytes,original);
const controller=fs.readFileSync(controllerPath,'utf8');for(const token of ["'relay.start'","'relay.ready'","'relay.control'","'relay.frame'",'protocolVersion:6'])assert.ok(controller.includes(token),`controller missing ${token}`);
if(hostPath){const host=fs.readFileSync(hostPath,'utf8');for(const token of ["'relay.ready'","'relay.control'","'relay.frame'",'relayFramePump'])assert.ok(host.includes(token),`host missing ${token}`);}
console.log(`PASS - Showcase Relay reassembled ${original.byteLength} bytes across ${chunks.length} base64 WebSocket messages`);
