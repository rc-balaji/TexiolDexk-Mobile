(()=>{
'use strict';
const C=window.DexkCloud;
if(!C)return;

const params=new URLSearchParams(location.search);
const targetId=C.normalizeId(params.get('internetTarget')||params.get('targetId'));
if(!targetId)return;

let signal=null,pc=null,control=null,frames=null;
let sessionId='',requestId='',connectInfo=null,closed=false,peerStarting=false,rpcSeq=0;
let pendingConnect=null;
const pendingRPC=new Map(),pendingICE=[];
const candidateCounts={local:{host:0,srflx:0,prflx:0,relay:0,unknown:0},remote:{host:0,srflx:0,prflx:0,relay:0,unknown:0}};

function nativeSignalling(){
 let ws=null,connected=false,config=null,startPromise=null;
 const handlers=new Set(),callbacks=new Map(),probeCallbacks=new Map();
 window.DexkCloudNative=window.DexkCloudNative||{};
 window.DexkCloudNative.complete=(id,payload,error)=>{
  const callback=callbacks.get(id);if(!callback)return;callbacks.delete(id);
  if(error){callback.reject(new Error(error));return;}
  try{callback.resolve(JSON.parse(payload));}catch(parseError){callback.reject(parseError);}
 };
 window.DexkCloudNative.probeComplete=(id,payload,error)=>{
  const callback=probeCallbacks.get(id);if(!callback)return;probeCallbacks.delete(id);
  if(error){callback.reject(new Error(error));return;}
  try{callback.resolve(JSON.parse(payload));}catch(parseError){callback.reject(parseError);}
 };
 const initialize=()=>new Promise((resolve,reject)=>{const id=C.uuid();callbacks.set(id,{resolve,reject});try{window.DexkNative.cloudInitialize(id);}catch(error){callbacks.delete(id);reject(error);}});
 const probeLan=candidates=>new Promise((resolve,reject)=>{
  if(!window.DexkNative?.probeLanCandidates){resolve({url:''});return;}
  const id=C.uuid();probeCallbacks.set(id,{resolve,reject});
  const timeout=setTimeout(()=>{if(probeCallbacks.delete(id))resolve({url:''});},5000);
  const entry=probeCallbacks.get(id);probeCallbacks.set(id,{resolve:value=>{clearTimeout(timeout);entry.resolve(value);},reject:error=>{clearTimeout(timeout);entry.reject(error);}});
  try{window.DexkNative.probeLanCandidates(id,JSON.stringify(candidates||[]));}catch(error){clearTimeout(timeout);probeCallbacks.delete(id);reject(error);}
 });
 const start=async()=>{
  config=await initialize();
  const base=config.serverUrl.replace(/^http/,'ws');
  const endpoint=new URL('/v2/ws',base);
  endpoint.searchParams.set('access_token',config.accessToken);
  endpoint.searchParams.set('device_name',config.deviceName||'Android controller');
  endpoint.searchParams.set('platform','android');
  endpoint.searchParams.set('client_version','2.1.0');
  ws=new WebSocket(endpoint);
  ws.onopen=()=>{connected=true;};ws.onclose=()=>{connected=false;};ws.onerror=()=>{connected=false;};
  ws.onmessage=event=>{try{const message=JSON.parse(event.data);for(const handler of handlers)handler(message);}catch{}};
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('Signalling connection timed out')),12000);
   const poll=()=>{if(connected){clearTimeout(timeout);resolve();return;}if(ws?.readyState===WebSocket.CLOSED){clearTimeout(timeout);reject(new Error('Signalling connection failed'));return;}setTimeout(poll,80);};poll();
  });
  return config;
 };
 return{
  async ready(){if(config&&connected)return config;if(!startPromise)startPromise=start().finally(()=>{startPromise=null;});return startPromise;},
  async send(message){await this.ready();if(!connected||ws?.readyState!==WebSocket.OPEN)throw new Error('Internet signalling is offline');ws.send(JSON.stringify(message));},
  async status(){await this.ready();return{serverUrl:config.serverUrl,deviceId:config.deviceId,formattedDeviceId:C.formatId(config.deviceId),connected,platform:'android',clientVersion:'2.1.0',stunUrls:config.stunUrls||[],iceServers:config.iceServers||[]};},
  probeLan,onMessage(handler){handlers.add(handler);return()=>handlers.delete(handler);},close(){try{ws?.close();}catch{}}
 };
}
function createSignal(){return window.DexkNative?.cloudInitialize?nativeSignalling():C.localSignalling();}
signal=createSignal();
function send(type,payload={},rid=requestId){return signal.send({type,targetDeviceId:targetId,sessionId,requestId:rid,payload});}
function diag(stage,detail={}){try{return send('diag.event',{role:'controller',stage,rtc:C.rtcState(pc),candidateCounts,channels:{control:control?.readyState||'none',frames:frames?.readyState||'none'},...detail});}catch{return Promise.resolve();}}

async function connect(options){
 if(pendingConnect)return pendingConnect.promise;
 closed=false;peerStarting=false;sessionId=C.uuid();requestId=C.uuid();pendingICE.splice(0);
 for(const side of ['local','remote'])for(const key of Object.keys(candidateCounts[side]))candidateCounts[side][key]=0;
 let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
 pendingConnect={promise,resolve,reject,options:{pin:String(options?.pin||''),name:String(options?.name||'Controller'),quality:String(options?.quality||'balanced'),clientType:String(options?.clientType||'internet')}};
 try{
  const status=await signal.status();
  const iceServers=status.iceServers?.length?status.iceServers:(status.stunUrls||['stun:stun.cloudflare.com:3478']);
  await signal.send({type:'session.request',targetDeviceId:targetId,sessionId,requestId,payload:{controllerName:pendingConnect.options.name,quality:pendingConnect.options.quality,clientType:pendingConnect.options.clientType,requestedMode:'view-and-control',iceServers,stunUrls:status.stunUrls||[]}});
 }catch(error){const pending=pendingConnect;pendingConnect=null;pending.reject(error);}
 const timer=setTimeout(()=>{if(!pendingConnect)return;const pending=pendingConnect;pendingConnect=null;pending.reject(new Error('Host did not respond in time'));close('Host response timeout');},60000);
 promise.finally(()=>clearTimeout(timer));return promise;
}

async function tryLanFallback(payload){
 if(!signal.probeLan||!Array.isArray(payload.lanCandidates)||!payload.lanCandidates.length||!pendingConnect)return false;
 await diag('lan-probe-start',{candidateCount:payload.lanCandidates.length});
 let result={url:''};try{result=await signal.probeLan(payload.lanCandidates);}catch(error){await diag('lan-probe-error',{message:String(error.message||error).slice(0,160)});}
 if(!result?.url)return false;
 await diag('lan-fallback-selected');
 try{await send('session.cancel',{reason:'Controller selected direct LAN route'});}catch{}
 const opts=pendingConnect.options;
 const url=new URL(result.url);
 url.searchParams.set('client','mobile');url.searchParams.set('name',opts.name);url.searchParams.set('pairPin',opts.pin);url.searchParams.set('autoPair','1');url.searchParams.set('internetFallback','1');
 location.replace(url.toString());
 return true;
}

async function createAndSendOffer(iceRestart=false){
 const offer=await pc.createOffer(iceRestart?{iceRestart:true}:undefined);
 await pc.setLocalDescription(offer);
 await send('signal.offer',{description:pc.localDescription,iceRestart});
 await diag(iceRestart?'offer-restart-sent':'offer-sent');
}

async function startPeer(payload){
 if(peerStarting||pc)return;peerStarting=true;
 if(await tryLanFallback(payload))return;
 const status=await signal.status();
 const iceServers=payload.iceServers?.length?payload.iceServers:(payload.stunUrls?.length?payload.stunUrls:(status.iceServers?.length?status.iceServers:status.stunUrls));
 pc=C.peer(iceServers);
 control=pc.createDataChannel('control',{ordered:true});
 frames=pc.createDataChannel('frames',{ordered:false,maxRetransmits:0});frames.binaryType='arraybuffer';
 control.onmessage=event=>handleControl(event.data);
 frames.onmessage=event=>{try{const packet=C.unpack(event.data);window.DexkInternetOnFrame?.(packet.meta,packet.bytes);}catch{}};
 pc.onicecandidate=event=>{
  if(event.candidate){const kind=C.candidateKind(event.candidate);candidateCounts.local[kind]=(candidateCounts.local[kind]||0)+1;send('signal.ice',{candidate:event.candidate}).catch(()=>{});}
  else send('signal.ice',{candidate:null,end:true}).catch(()=>{});
 };
 pc.onicecandidateerror=event=>diag('ice-candidate-error',{errorCode:event.errorCode||0,errorText:String(event.errorText||'').slice(0,140)});
 pc.oniceconnectionstatechange=()=>diag('ice-state');
 pc.onconnectionstatechange=()=>{diag('connection-state');if(['failed','closed'].includes(pc.connectionState)&&!closed){window.DexkInternetOnClose?.('Internet P2P connection '+pc.connectionState);}};
 await createAndSendOffer(false);
 try{await waitOpen(control,18000);}catch(firstError){
  if(closed)throw firstError;
  await diag('control-timeout-first',{message:firstError.message});
  try{pc.restartIce?.();await createAndSendOffer(true);await waitOpen(control,15000);}catch(retryError){
   const state=C.rtcState(pc);throw new Error(`Control channel timeout (ICE ${state.iceConnectionState}, connection ${state.connectionState}). Same-LAN fallback was not reachable and direct WebRTC failed.`);
  }
 }
 if(pendingICE.length)await flushICE();
 if(!pendingConnect)throw new Error('Connection request is no longer active');
 await diag('control-open');
 control.send(JSON.stringify({kind:'auth',...pendingConnect.options}));
 waitOpen(frames,20000).then(()=>diag('frames-open')).catch(()=>diag('frames-late'));
}
function waitOpen(channel,timeoutMs){if(channel.readyState==='open')return Promise.resolve();return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(`${channel.label} channel timed out`)),timeoutMs);channel.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});channel.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error(`${channel.label} channel failed`));},{once:true});channel.addEventListener('close',()=>{clearTimeout(timeout);reject(new Error(`${channel.label} channel closed`));},{once:true});});}
async function flushICE(){for(const candidate of pendingICE.splice(0)){try{await pc.addIceCandidate(candidate);}catch(error){await diag('remote-ice-rejected',{message:String(error.message||error).slice(0,120)});}}}

function handleControl(raw){
 let message;try{message=JSON.parse(raw);}catch{return;}
 if(message.kind==='auth.result'){
  if(!pendingConnect)return;const pending=pendingConnect;pendingConnect=null;
  if(message.allowed){connectInfo=message.connectInfo||{};diag('authenticated');pending.resolve(connectInfo);}else{pending.reject(new Error(message.reason||'Host declined the request'));close('Host declined');}return;
 }
 if(message.kind==='rpc.result'){const pending=pendingRPC.get(message.id);if(!pending)return;pendingRPC.delete(message.id);if(message.status>=200&&message.status<300)pending.resolve(message.data);else pending.reject(new Error(message.error||'Remote request failed'));}
}
function rpc(action,payload={}){if(!control||control.readyState!=='open')return Promise.reject(new Error('Remote control channel is not open'));const id=`r${++rpcSeq}-${Date.now()}`;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pendingRPC.delete(id);reject(new Error('Remote request timed out'));},12000);pendingRPC.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});control.send(JSON.stringify({kind:'rpc',id,action,payload}));});}
async function request(path,options={}){let action,payload={};if(options.body&&typeof options.body==='string'){try{payload=JSON.parse(options.body);}catch{}}if(path.startsWith('/api/remote/status'))action='status';else if(path.startsWith('/api/remote/mode'))action='mode';else if(path.startsWith('/api/remote/input'))action='input';else if(path.startsWith('/api/remote/clipboard'))action=(options.method||'GET').toUpperCase()==='POST'?'clipboard.set':'clipboard.get';else if(path.startsWith('/api/remote/disconnect'))action='disconnect';else throw new Error('Unsupported internet request');const data=await rpc(action,payload);return new Response(JSON.stringify(data??{}),{status:200,headers:{'Content-Type':'application/json'}});}

async function onMessage(message){
 if(!message)return;
 if(message.type==='server.delivery'&&message.requestId===requestId&&!message.online&&pendingConnect){const pending=pendingConnect;pendingConnect=null;pending.reject(new Error('The Windows host is offline on the signalling server'));close('Target offline',false);return;}
 if(message.sessionId!==sessionId)return;
 try{
  switch(message.type){
   case 'session.response':if(!pendingConnect)return;if(!message.payload?.allowed){const pending=pendingConnect;pendingConnect=null;pending.reject(new Error(message.payload?.reason||'Host is unavailable'));return;}await startPeer(message.payload||{});break;
   case 'signal.answer':if(pc&&message.payload?.description){await pc.setRemoteDescription(message.payload.description);await flushICE();await diag('answer-applied');}break;
   case 'signal.ice':if('candidate' in (message.payload||{})){const candidate=message.payload.candidate||null;if(candidate){const kind=C.candidateKind(candidate);candidateCounts.remote[kind]=(candidateCounts.remote[kind]||0)+1;}if(pc?.remoteDescription)await pc.addIceCandidate(candidate);else pendingICE.push(candidate);}break;
   case 'session.close':window.DexkInternetOnClose?.(message.payload?.reason||'Host ended session');close('Host ended session',false);break;
  }
 }catch(error){await diag('controller-error',{message:String(error.message||error).slice(0,200)});if(pendingConnect){const pending=pendingConnect;pendingConnect=null;pending.reject(error);}close(error.message||'Internet session failed');}
}
function close(reason='Controller disconnected',notify=true){
 if(closed)return;closed=true;const pending=pendingConnect;pendingConnect=null;if(pending)pending.reject(new Error(reason||'Connection closed'));for(const item of pendingRPC.values())item.reject(new Error('Connection closed'));pendingRPC.clear();
 try{if(control?.readyState==='open')control.send(JSON.stringify({kind:'rpc',id:C.uuid(),action:'disconnect',payload:{}}));}catch{}
 if(notify)try{send('session.close',{reason});}catch{}
 try{control?.close();}catch{}try{frames?.close();}catch{}try{pc?.close();}catch{}
}
window.addEventListener('beforeunload',()=>{close('Page closed');signal?.close?.();});
signal.onMessage(onMessage);
window.DexkInternetTransport={enabled:true,targetId,connect,request,close,get sessionId(){return sessionId;}};
})();
