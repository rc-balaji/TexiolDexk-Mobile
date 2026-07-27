(()=>{
'use strict';
const C=window.DexkCloud;
if(!C)return;

const params=new URLSearchParams(location.search);
const targetId=C.normalizeId(params.get('internetTarget')||params.get('targetId'));
if(!targetId)return;

let signal=null;
let pc=null;
let control=null;
let frames=null;
let sessionId='';
let requestId='';
let connectInfo=null;
let closed=false;
let rpcSeq=0;
let pendingConnect=null;
const pendingRPC=new Map();
const pendingICE=[];

function nativeSignalling(){
  let ws=null;
  let connected=false;
  let config=null;
  let startPromise=null;
  const handlers=new Set();
  const callbacks=new Map();

  window.DexkCloudNative=window.DexkCloudNative||{};
  window.DexkCloudNative.complete=(id,payload,error)=>{
    const callback=callbacks.get(id);
    if(!callback)return;
    callbacks.delete(id);
    if(error){callback.reject(new Error(error));return;}
    try{callback.resolve(JSON.parse(payload));}catch(parseError){callback.reject(parseError);}
  };

  const initialize=()=>new Promise((resolve,reject)=>{
    const id=C.uuid();
    callbacks.set(id,{resolve,reject});
    try{window.DexkNative.cloudInitialize(id);}catch(error){callbacks.delete(id);reject(error);}
  });

  const start=async()=>{
    config=await initialize();
    const base=config.serverUrl.replace(/^http/,'ws');
    const endpoint=new URL('/v2/ws',base);
    endpoint.searchParams.set('access_token',config.accessToken);
    endpoint.searchParams.set('device_name',config.deviceName||'Android controller');
    endpoint.searchParams.set('platform','android');
    ws=new WebSocket(endpoint);
    ws.onopen=()=>{connected=true;};
    ws.onclose=event=>{connected=false;window.DexkLastSignalError=`Signalling closed (${event.code||'unknown'})`;};
    ws.onerror=()=>{connected=false;window.DexkLastSignalError='Unable to open secure signalling socket';};
    ws.onmessage=event=>{
      try{
        const message=JSON.parse(event.data);
        for(const handler of handlers)handler(message);
      }catch{}
    };
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error(window.DexkLastSignalError||'Signalling connection timed out')),12000);
      const poll=()=>{
        if(connected){clearTimeout(timeout);resolve();return;}
        if(ws?.readyState===WebSocket.CLOSED){clearTimeout(timeout);reject(new Error(window.DexkLastSignalError||'Signalling connection failed'));return;}
        setTimeout(poll,80);
      };
      poll();
    });
    return config;
  };

  return{
    async ready(){
      if(config&&connected)return config;
      if(!startPromise)startPromise=start().finally(()=>{startPromise=null;});
      return startPromise;
    },
    async send(message){
      await this.ready();
      if(!connected||ws?.readyState!==WebSocket.OPEN)throw new Error('Internet signalling is offline');
      ws.send(JSON.stringify(message));
    },
    async status(){
      await this.ready();
      return{
        serverUrl:config.serverUrl,
        deviceId:config.deviceId,
        formattedDeviceId:C.formatId(config.deviceId),
        connected,
        platform:'android',
        clientVersion:'2.0.0',
        stunUrls:config.stunUrls||[]
      };
    },
    onMessage(handler){handlers.add(handler);return()=>handlers.delete(handler);},
    close(){try{ws?.close();}catch{}}
  };
}

function createSignal(){
  return window.DexkNative?.cloudInitialize?nativeSignalling():C.localSignalling();
}

signal=createSignal();

function send(type,payload={},rid=requestId){
  return signal.send({type,targetDeviceId:targetId,sessionId,requestId:rid,payload});
}

async function connect(options){
  if(pendingConnect)return pendingConnect.promise;
  closed=false;
  sessionId=C.uuid();
  requestId=C.uuid();
  let resolve;
  let reject;
  const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
  pendingConnect={promise,resolve,reject,options:{
    pin:String(options?.pin||''),
    name:String(options?.name||'Controller'),
    quality:String(options?.quality||'balanced'),
    clientType:String(options?.clientType||'internet')
  }};

  try{
    const status=await signal.status();
    await signal.send({
      type:'session.request',
      targetDeviceId:targetId,
      sessionId,
      requestId,
      payload:{
        controllerName:pendingConnect.options.name,
        quality:pendingConnect.options.quality,
        clientType:pendingConnect.options.clientType,
        requestedMode:'view-and-control',
        stunUrls:status.stunUrls||['stun:stun.cloudflare.com:3478']
      }
    });
  }catch(error){
    const pending=pendingConnect;
    pendingConnect=null;
    pending.reject(error);
  }

  const timer=setTimeout(()=>{
    if(!pendingConnect)return;
    const pending=pendingConnect;
    pendingConnect=null;
    pending.reject(new Error('Host did not respond in time'));
    close();
  },60000);
  promise.finally(()=>clearTimeout(timer));
  return promise;
}

async function startPeer(payload){
  const status=await signal.status();
  pc=C.peer(payload.stunUrls||status.stunUrls||['stun:stun.cloudflare.com:3478']);
  control=pc.createDataChannel('control',{ordered:true});
  frames=pc.createDataChannel('frames',{ordered:false,maxRetransmits:0});
  frames.binaryType='arraybuffer';
  control.onmessage=event=>handleControl(event.data);
  frames.onmessage=event=>{
    try{
      const packet=C.unpack(event.data);
      window.DexkInternetOnFrame?.(packet.meta,packet.bytes);
    }catch{}
  };
  pc.onicecandidate=event=>{if(event.candidate)send('signal.ice',{candidate:event.candidate});};
  pc.onconnectionstatechange=()=>{
    if(['failed','closed','disconnected'].includes(pc.connectionState)&&!closed){
      window.DexkInternetOnClose?.('Internet P2P connection '+pc.connectionState);
    }
  };

  const offer=await pc.createOffer();
  await pc.setLocalDescription(offer);
  await send('signal.offer',{description:pc.localDescription});
  await Promise.all([waitOpen(control,25000),waitOpen(frames,25000)]);
  if(pendingICE.length){
    for(const candidate of pendingICE.splice(0)){
      try{await pc.addIceCandidate(candidate);}catch{}
    }
  }

  if(!pendingConnect)throw new Error('Connection request is no longer active');
  control.send(JSON.stringify({kind:'auth',...pendingConnect.options}));
}

function waitOpen(channel,timeoutMs){
  if(channel.readyState==='open')return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`${channel.label} channel timed out`)),timeoutMs);
    channel.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
    channel.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error(`${channel.label} channel failed`));},{once:true});
  });
}

function handleControl(raw){
  let message;
  try{message=JSON.parse(raw);}catch{return;}

  if(message.kind==='auth.result'){
    if(!pendingConnect)return;
    const pending=pendingConnect;
    pendingConnect=null;
    if(message.allowed){
      connectInfo=message.connectInfo||{};
      pending.resolve(connectInfo);
    }else{
      pending.reject(new Error(message.reason||'Host declined the request'));
      close();
    }
    return;
  }

  if(message.kind==='rpc.result'){
    const pending=pendingRPC.get(message.id);
    if(!pending)return;
    pendingRPC.delete(message.id);
    if(message.status>=200&&message.status<300)pending.resolve(message.data);
    else pending.reject(new Error(message.error||'Remote request failed'));
  }
}

function rpc(action,payload={}){
  if(!control||control.readyState!=='open')return Promise.reject(new Error('Remote control channel is not open'));
  const id=`r${++rpcSeq}-${Date.now()}`;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{
      pendingRPC.delete(id);
      reject(new Error('Remote request timed out'));
    },12000);
    pendingRPC.set(id,{
      resolve:value=>{clearTimeout(timeout);resolve(value);},
      reject:error=>{clearTimeout(timeout);reject(error);}
    });
    control.send(JSON.stringify({kind:'rpc',id,action,payload}));
  });
}

async function request(path,options={}){
  let action;
  let payload={};
  if(options.body&&typeof options.body==='string'){
    try{payload=JSON.parse(options.body);}catch{}
  }
  if(path.startsWith('/api/remote/status'))action='status';
  else if(path.startsWith('/api/remote/mode'))action='mode';
  else if(path.startsWith('/api/remote/input'))action='input';
  else if(path.startsWith('/api/remote/clipboard'))action=(options.method||'GET').toUpperCase()==='POST'?'clipboard.set':'clipboard.get';
  else if(path.startsWith('/api/remote/disconnect'))action='disconnect';
  else throw new Error('Unsupported internet request');
  const data=await rpc(action,payload);
  return new Response(JSON.stringify(data??{}),{status:200,headers:{'Content-Type':'application/json'}});
}

async function onMessage(message){
  if(!message||message.sessionId!==sessionId)return;
  try{
    switch(message.type){
      case 'session.response':
        if(!pendingConnect)return;
        if(!message.payload?.allowed){
          const pending=pendingConnect;
          pendingConnect=null;
          pending.reject(new Error(message.payload?.reason||'Host is unavailable'));
          return;
        }
        await startPeer(message.payload||{});
        break;
      case 'signal.answer':
        if(pc&&message.payload?.description){
          await pc.setRemoteDescription(message.payload.description);
          for(const candidate of pendingICE.splice(0)){
            try{await pc.addIceCandidate(candidate);}catch{}
          }
        }
        break;
      case 'signal.ice':
        if(message.payload?.candidate){
          if(pc?.remoteDescription)await pc.addIceCandidate(message.payload.candidate);
          else pendingICE.push(message.payload.candidate);
        }
        break;
      case 'session.close':
        window.DexkInternetOnClose?.(message.payload?.reason||'Host ended session');
        close();
        break;
    }
  }catch(error){
    if(pendingConnect){
      const pending=pendingConnect;
      pendingConnect=null;
      pending.reject(error);
    }
    close();
  }
}

function close(){
  if(closed)return;
  closed=true;
  const pending=pendingConnect;
  pendingConnect=null;
  if(pending)pending.reject(new Error('Connection closed'));
  for(const item of pendingRPC.values())item.reject(new Error('Connection closed'));
  pendingRPC.clear();
  try{if(control?.readyState==='open')control.send(JSON.stringify({kind:'rpc',id:C.uuid(),action:'disconnect',payload:{}}));}catch{}
  try{send('session.close',{reason:'Controller disconnected'});}catch{}
  try{control?.close();}catch{}
  try{frames?.close();}catch{}
  try{pc?.close();}catch{}
}

window.addEventListener('beforeunload',()=>signal?.close?.());
signal.onMessage(onMessage);
window.DexkInternetTransport={enabled:true,targetId,connect,request,close,get sessionId(){return sessionId;}};
})();
