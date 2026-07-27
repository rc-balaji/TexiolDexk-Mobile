(()=>{
'use strict';
const te=new TextEncoder(),td=new TextDecoder();
function normalizeId(value){const d=String(value||'').replace(/\D/g,'');return d.length===12?d:''}
function formatId(value){const d=normalizeId(value);return d?`${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,9)} ${d.slice(9)}`:''}
function uuid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function packet(meta,bytes){const m=te.encode(JSON.stringify(meta));const out=new Uint8Array(4+m.length+bytes.byteLength);new DataView(out.buffer).setUint32(0,m.length);out.set(m,4);out.set(new Uint8Array(bytes),4+m.length);return out.buffer}
function unpack(buffer){const view=new DataView(buffer);const n=view.getUint32(0);if(n<2||n>65536||4+n>buffer.byteLength)throw new Error('Invalid Dexk frame packet');const meta=JSON.parse(td.decode(new Uint8Array(buffer,4,n)));return{meta,bytes:buffer.slice(4+n)}}
function localSignalling(base='http://127.0.0.1:45910'){
 let seq=0,closed=false,handlers=new Set();
 const send=async message=>{const r=await fetch(base+'/api/cloud/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message),cache:'no-store'});if(!r.ok)throw new Error((await r.text()).trim()||r.statusText)};
 const status=async()=>{const r=await fetch(base+'/api/cloud/status',{cache:'no-store'});if(!r.ok)throw new Error((await r.text()).trim()||r.statusText);return r.json()};
 const loop=async()=>{while(!closed){try{const r=await fetch(`${base}/api/cloud/events?after=${seq}`,{cache:'no-store'});if(!r.ok)throw new Error(await r.text());const j=await r.json();for(const e of j.events||[]){seq=Math.max(seq,Number(e.seq)||0);for(const h of handlers)try{h(e.payload)}catch{}}}catch{await sleep(900)}}};
 loop();
 return{send,status,onMessage(fn){handlers.add(fn);return()=>handlers.delete(fn)},close(){closed=true}};
}
function peer(stunUrls=[]){return new RTCPeerConnection({iceServers:stunUrls?.length?[{urls:stunUrls}]:[]})}
window.DexkCloud={normalizeId,formatId,uuid,sleep,packet,unpack,localSignalling,peer};
})();
