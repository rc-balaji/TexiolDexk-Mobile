import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const commonPath = process.argv[2];
if (!commonPath) throw new Error('Usage: node validate-frame-transport.mjs <cloud-common.js>');
const source = fs.readFileSync(commonPath, 'utf8');
const context = {
  window: {}, console, TextEncoder, TextDecoder, DataView, Uint8Array, ArrayBuffer, Blob,
  setTimeout, clearTimeout, crypto: globalThis.crypto
};
vm.createContext(context);
vm.runInContext(source, context, { filename: commonPath });
const C = context.window.DexkCloud;
assert.ok(C?.frameChunks && C?.createFrameAssembler, 'frame transport helpers must be exported');

const original = crypto.randomBytes(620_123);
const meta = { seq: 77, width: 1920, height: 1080, time: Date.now() };
const chunks = C.frameChunks(meta, original);
assert.ok(chunks.length > 40, 'large JPEG-like payload must be chunked');
assert.ok(chunks.every(chunk => chunk.byteLength <= C.FRAME_CHUNK_BYTES + 24), 'each RTC message must stay below the safe chunk limit');

let completed = null;
const assembler = C.createFrameAssembler({
  timeoutMs: 2000,
  onFrame(frameMeta, bytes, transport) { completed = { frameMeta, bytes: new Uint8Array(bytes), transport }; }
});
// Deliver deliberately out of order to exercise the unordered RTCDataChannel path.
for (const chunk of [...chunks].reverse()) assembler.push(chunk);
assert.ok(completed, 'all chunks must reassemble into one frame');
assert.equal(completed.frameMeta.seq, 77);
assert.equal(completed.frameMeta.width, 1920);
assert.equal(completed.frameMeta.height, 1080);
assert.equal(Buffer.compare(Buffer.from(completed.bytes), original), 0, 'reassembled JPEG bytes must be identical');
assert.equal(completed.transport.chunks, chunks.length);

const legacy = C.packet({ seq: 3, width: 10, height: 10 }, original.subarray(0, 4096));
let legacyDone = false;
const legacyAssembler = C.createFrameAssembler({ onFrame(meta2, bytes2, transport) {
  legacyDone = meta2.seq === 3 && bytes2.byteLength === 4096 && transport.legacy === true;
}});
legacyAssembler.push(legacy);
assert.equal(legacyDone, true, 'v2.1.1 single-message frames remain readable');

console.log(`Validated ${original.length} bytes across ${chunks.length} safe RTC chunks.`);
