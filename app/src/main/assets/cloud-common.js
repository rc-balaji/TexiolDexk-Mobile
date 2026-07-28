(()=>{
'use strict';
const te=new TextEncoder(),td=new TextDecoder();
const FRAME_MAGIC=0x44584632; // "DXF2"
const FRAME_VERSION=2;
const FRAME_HEADER_BYTES=24;
const FRAME_CHUNK_BYTES=12*1024;
const FRAME_MAX_BYTES=8*1024*1024;
function normalizeId(value){const d=String(value||'').replace(/\D/g,'');return d.length===12?d:''}
function formatId(value){const d=normalizeId(value);return d?`${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,9)} ${d.slice(9)}`:''}
function uuid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function packet(meta,bytes){const m=te.encode(JSON.stringify(meta));const source=asUint8Array(bytes);const out=new Uint8Array(4+m.length+source.byteLength);new DataView(out.buffer).setUint32(0,m.length);out.set(m,4);out.set(source,4+m.length);return out.buffer}
function unpack(buffer){const view=new DataView(buffer);const n=view.getUint32(0);if(n<2||n>65536||4+n>buffer.byteLength)throw new Error('Invalid Dexk frame packet');const meta=JSON.parse(td.decode(new Uint8Array(buffer,4,n)));return{meta,bytes:buffer.slice(4+n)}}
function asUint8Array(value){if(value instanceof Uint8Array)return value;if(value instanceof ArrayBuffer)return new Uint8Array(value);if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);throw new Error('Expected binary frame data')}

function arrayBufferToBase64(value){const bytes=asUint8Array(value);let binary='';const step=0x8000;for(let i=0;i<bytes.length;i+=step){binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+step)));}return btoa(binary)}
function base64ToArrayBuffer(value){const binary=atob(String(value||''));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes.buffer}
async function toArrayBuffer(value){if(value instanceof ArrayBuffer)return value;if(ArrayBuffer.isView(value))return value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);if(typeof Blob!=='undefined'&&value instanceof Blob)return value.arrayBuffer();throw new Error('Unsupported RTC frame message type')}
function frameChunks(meta,bytes,chunkBytes=FRAME_CHUNK_BYTES){
 const source=asUint8Array(bytes);if(source.byteLength<1||source.byteLength>FRAME_MAX_BYTES)throw new Error(`Frame size ${source.byteLength} is outside the supported range`);
 const safeChunk=Math.max(4096,Math.min(48*1024,Number(chunkBytes)||FRAME_CHUNK_BYTES));const count=Math.ceil(source.byteLength/safeChunk);if(count>65535)throw new Error('Frame requires too many chunks');
 const seq=(Number(meta?.seq)||0)>>>0,width=Math.max(1,Math.min(65535,Number(meta?.width)||1)),height=Math.max(1,Math.min(65535,Number(meta?.height)||1));const out=[];
 for(let index=0;index<count;index++){
  const start=index*safeChunk,end=Math.min(source.byteLength,start+safeChunk),payload=source.subarray(start,end),message=new Uint8Array(FRAME_HEADER_BYTES+payload.byteLength),view=new DataView(message.buffer);
  view.setUint32(0,FRAME_MAGIC);view.setUint8(4,FRAME_VERSION);view.setUint8(5,(index===0?1:0)|(index===count-1?2:0));view.setUint16(6,FRAME_HEADER_BYTES);view.setUint32(8,seq);view.setUint16(12,index);view.setUint16(14,count);view.setUint16(16,width);view.setUint16(18,height);view.setUint32(20,source.byteLength);message.set(payload,FRAME_HEADER_BYTES);out.push(message.buffer);
 }
 return out;
}
function createFrameAssembler(options={}){
 const timeoutMs=Math.max(750,Number(options.timeoutMs)||3500),maxPending=Math.max(1,Number(options.maxPending)||3),pending=new Map();let lastCompleted=0;
 const drop=(seq,reason)=>{const item=pending.get(seq);if(!item)return;clearTimeout(item.timer);pending.delete(seq);try{options.onDrop?.({seq,reason,received:item.received,count:item.count,totalBytes:item.totalBytes})}catch{}};
 const trim=()=>{if(pending.size<=maxPending)return;const oldest=[...pending.entries()].sort((a,b)=>a[1].createdAt-b[1].createdAt)[0];if(oldest)drop(oldest[0],'superseded')};
 const push=buffer=>{
  if(!(buffer instanceof ArrayBuffer))throw new Error('Frame assembler requires ArrayBuffer input');
  if(buffer.byteLength<4)throw new Error('RTC frame message is too small');
  const view=new DataView(buffer),magic=view.getUint32(0);
  if(magic!==FRAME_MAGIC){const legacy=unpack(buffer);try{options.onFrame?.(legacy.meta,legacy.bytes,{legacy:true,chunks:1})}catch{}return{complete:true,...legacy,legacy:true};}
  if(buffer.byteLength<FRAME_HEADER_BYTES)throw new Error('RTC frame chunk header is incomplete');
  const version=view.getUint8(4),headerBytes=view.getUint16(6),seq=view.getUint32(8),index=view.getUint16(12),count=view.getUint16(14),width=view.getUint16(16),height=view.getUint16(18),totalBytes=view.getUint32(20);
  if(version!==FRAME_VERSION||headerBytes!==FRAME_HEADER_BYTES)throw new Error('Unsupported Dexk frame chunk version');
  if(!count||index>=count||!totalBytes||totalBytes>FRAME_MAX_BYTES)throw new Error('Invalid Dexk frame chunk metadata');
  if(lastCompleted&&seq<=lastCompleted)return{complete:false,duplicate:true};
  let item=pending.get(seq);
  if(!item){
   item={seq,count,width,height,totalBytes,chunks:new Array(count),received:0,bytesReceived:0,createdAt:Date.now(),timer:0};
   item.timer=setTimeout(()=>drop(seq,'timeout'),timeoutMs);pending.set(seq,item);trim();
  }
  if(item.count!==count||item.totalBytes!==totalBytes||item.width!==width||item.height!==height){drop(seq,'metadata-mismatch');throw new Error('Frame chunk metadata changed mid-frame');}
  if(!item.chunks[index]){const payload=new Uint8Array(buffer.slice(headerBytes));item.chunks[index]=payload;item.received++;item.bytesReceived+=payload.byteLength;}
  if(item.received!==item.count)return{complete:false,seq,index,count};
  clearTimeout(item.timer);pending.delete(seq);
  if(item.bytesReceived!==item.totalBytes){try{options.onDrop?.({seq,reason:'size-mismatch',received:item.received,count:item.count,totalBytes:item.totalBytes,bytesReceived:item.bytesReceived})}catch{}throw new Error('Reassembled frame size does not match metadata');}
  const joined=new Uint8Array(item.totalBytes);let offset=0;for(const chunk of item.chunks){if(!chunk)throw new Error('Frame chunk is missing');joined.set(chunk,offset);offset+=chunk.byteLength;}
  lastCompleted=seq;const meta={seq,width,height,time:Date.now()};try{options.onFrame?.(meta,joined.buffer,{legacy:false,chunks:count})}catch{}return{complete:true,meta,bytes:joined.buffer,chunks:count};
 };
 const close=()=>{for(const seq of [...pending.keys()])drop(seq,'assembler-closed')};
 return{push,close,get pendingCount(){return pending.size},get lastCompleted(){return lastCompleted}};
}
function localSignalling(base='http://127.0.0.1:45910'){
 let seq=0,closed=false,started=false,handlers=new Set();
 const send=async message=>{const r=await fetch(base+'/api/cloud/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message),cache:'no-store'});if(!r.ok)throw new Error((await r.text()).trim()||r.statusText)};
 const status=async()=>{const r=await fetch(base+'/api/cloud/status',{cache:'no-store'});if(!r.ok)throw new Error((await r.text()).trim()||r.statusText);return r.json()};
 const probeLan=async candidates=>{const r=await fetch(base+'/api/cloud/probe-lan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidates:Array.isArray(candidates)?candidates:[]}),cache:'no-store'});if(!r.ok)throw new Error((await r.text()).trim()||r.statusText);return r.json()};
 const loop=async()=>{while(!closed){try{const r=await fetch(`${base}/api/cloud/events?after=${seq}`,{cache:'no-store'});if(!r.ok)throw new Error(await r.text());const j=await r.json();for(const e of j.events||[]){seq=Math.max(seq,Number(e.seq)||0);for(const h of [...handlers])try{h(e.payload)}catch{}}}catch{await sleep(700)}}};
 return{send,status,probeLan,onMessage(fn){handlers.add(fn);if(!started){started=true;queueMicrotask(loop);}return()=>handlers.delete(fn)},close(){closed=true}};
}
function normalizeIceServers(value){
 const fallback=[{urls:['stun:stun.cloudflare.com:3478']}];if(!Array.isArray(value)||!value.length)return fallback;if(value.every(v=>typeof v==='string'))return [{urls:value.filter(Boolean)}];const out=[];
 for(const item of value){if(!item||typeof item!=='object')continue;const raw=item.urls,urls=(Array.isArray(raw)?raw:[raw]).filter(v=>typeof v==='string'&&/^(stun|stuns|turn|turns):/i.test(v));if(!urls.length)continue;const server={urls};if(typeof item.username==='string')server.username=item.username;if(typeof item.credential==='string')server.credential=item.credential;out.push(server)}return out.length?out:fallback;
}
function peer(iceServers=[]){return new RTCPeerConnection({iceServers:normalizeIceServers(iceServers),iceCandidatePoolSize:4,bundlePolicy:'max-bundle'})}
function candidateKind(candidate){const text=String(candidate?.candidate||candidate||'');const match=text.match(/\btyp\s+(host|srflx|prflx|relay)\b/i);return match?match[1].toLowerCase():'unknown'}
function rtcState(pc){return{connectionState:pc?.connectionState||'none',iceConnectionState:pc?.iceConnectionState||'none',iceGatheringState:pc?.iceGatheringState||'none',signalingState:pc?.signalingState||'none'}}
window.DexkCloud={normalizeId,formatId,uuid,sleep,packet,unpack,toArrayBuffer,arrayBufferToBase64,base64ToArrayBuffer,frameChunks,createFrameAssembler,localSignalling,normalizeIceServers,peer,candidateKind,rtcState,FRAME_CHUNK_BYTES};
})();
