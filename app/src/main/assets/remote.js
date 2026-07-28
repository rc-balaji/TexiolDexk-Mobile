const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const params=new URLSearchParams(location.search);
const isMobile=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)||params.get('client')==='mobile';
const clientType=params.get('client')||(isMobile?'mobile':'desktop');
const internetTransport=window.DexkInternetTransport?.enabled?window.DexkInternetTransport:null;
const internetMode=!!internetTransport;
let token='',sessionId='',seq=0,connected=false;
let permissions={control:false,clipboard:false,files:false,pointerOverlay:true};
let controlOwner={active:false};
let sessionMode='pointer';
let inputMode=isMobile?'touchpad':'touchscreen';
let frameW=1,frameH=1,frameCounter=0,frameWindow=performance.now();
let fitScale=1,viewScale=1,panX=0,panY=0,hasFrame=false;
let pendingMove=null,moveBusy=false,lastTap=null,pendingScroll={wheel:0,hwheel:0},scrollBusy=false,pointerRemainder={x:0,y:0};
let floatingPadVisible=true;
let pendingInternetFrame=null,firstFrameTimer=0,firstFrameRendered=false;

function nativeCall(name,...args){try{return window.DexkNative?.[name]?.(...args)}catch{return undefined}}
const INPUT_PREF_KEY='texiol.dexk.controller.preferences.v1';
const FLOATING_POS_KEY='texiol.dexk.floating.position.v1';
const defaultControllerPreferences={pointerSpeed:1.8,pointerAcceleration:'adaptive',tapToClick:true,longPressRightClick:true,verticalScrollSpeed:16,verticalScrollDirection:'natural',horizontalScrollSpeed:16,horizontalScrollDirection:'natural',floatingPadSize:100,floatingPadOpacity:92,touchDrag:true,accent:'violet',density:'comfortable'};
function normalizeControllerPreferences(input={}){const p={...defaultControllerPreferences,...input};p.pointerSpeed=clamp(Number(p.pointerSpeed)||1.8,.5,4);p.pointerAcceleration=['off','adaptive','fast'].includes(p.pointerAcceleration)?p.pointerAcceleration:'adaptive';p.verticalScrollSpeed=clamp(Number(p.verticalScrollSpeed)||16,2,40);p.horizontalScrollSpeed=clamp(Number(p.horizontalScrollSpeed)||16,2,40);p.verticalScrollDirection=['natural','standard'].includes(p.verticalScrollDirection)?p.verticalScrollDirection:'natural';p.horizontalScrollDirection=['natural','standard'].includes(p.horizontalScrollDirection)?p.horizontalScrollDirection:'natural';p.floatingPadSize=clamp(Number(p.floatingPadSize)||100,75,150);p.floatingPadOpacity=clamp(Number(p.floatingPadOpacity)||92,45,100);p.accent=['violet','blue','teal','rose','amber'].includes(p.accent)?p.accent:'violet';p.density=['comfortable','compact'].includes(p.density)?p.density:'comfortable';p.tapToClick=!!p.tapToClick;p.longPressRightClick=!!p.longPressRightClick;p.touchDrag=!!p.touchDrag;return p}
function loadControllerPreferences(){let raw=nativeCall('loadControllerPreferences');if(!raw){try{raw=localStorage.getItem(INPUT_PREF_KEY)}catch{}}try{return normalizeControllerPreferences(JSON.parse(raw||'{}'))}catch{return {...defaultControllerPreferences}}}
let controllerPreferences=loadControllerPreferences();
function persistControllerPreferences(){controllerPreferences=normalizeControllerPreferences(controllerPreferences);const raw=JSON.stringify(controllerPreferences);try{localStorage.setItem(INPUT_PREF_KEY,raw)}catch{}nativeCall('saveControllerPreferences',raw);applyControllerPreferences()}
function applyControllerPreferences(){document.documentElement.dataset.accent=controllerPreferences.accent;document.documentElement.dataset.density=controllerPreferences.density;document.documentElement.style.setProperty('--floating-pad-scale',String(controllerPreferences.floatingPadSize/100));document.documentElement.style.setProperty('--floating-pad-opacity',String(controllerPreferences.floatingPadOpacity/100));}
function pointerDelta(dx,dy){let factor=1;const magnitude=Math.hypot(dx,dy);if(controllerPreferences.pointerAcceleration==='fast')factor=1.65;else if(controllerPreferences.pointerAcceleration==='adaptive')factor=magnitude>14?1.65:magnitude>6?1.3:1;const scale=controllerPreferences.pointerSpeed*factor;const fx=dx*scale+pointerRemainder.x,fy=dy*scale+pointerRemainder.y;const ox=Math.trunc(fx),oy=Math.trunc(fy);pointerRemainder.x=fx-ox;pointerRemainder.y=fy-oy;return{dx:ox,dy:oy}}
function scrollAmount(type,delta){if(type==='wheel'){const sign=controllerPreferences.verticalScrollDirection==='natural'?-1:1;return Math.round(delta*controllerPreferences.verticalScrollSpeed*sign)}const sign=controllerPreferences.horizontalScrollDirection==='natural'?1:-1;return Math.round(delta*controllerPreferences.horizontalScrollSpeed*sign)}
applyControllerPreferences();
function haptic(ms=18){nativeCall('haptic',ms);try{navigator.vibrate?.(ms)}catch{}}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function showGesture(message){const el=$('#gestureToast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),1250)}
function setStatus(text,online=false){$('#remoteStatus').textContent=text;$('#sessionTitle').classList.toggle('online',online)}
async function req(path,opts={}){const started=performance.now();if(internetMode){const r=await internetTransport.request(path,opts);const elapsed=Math.round(performance.now()-started);if($('#latency'))$('#latency').textContent=`${elapsed} ms`;return r}const headers={...(opts.headers||{})};if(token)headers['X-Session-Token']=token;if(opts.body&&!headers['Content-Type']&&!(opts.body instanceof FormData))headers['Content-Type']='application/json';const r=await fetch(path,{cache:'no-store',...opts,headers});const elapsed=Math.round(performance.now()-started);if($('#latency'))$('#latency').textContent=`${elapsed} ms`;if(!r.ok)throw new Error((await r.text()).trim()||r.statusText);return r}

function prefill(){
  if(params.get('name'))$('#name').value=params.get('name');
  else if(clientType==='desktop')$('#name').value='Windows desktop';
  else if(isMobile)$('#name').value='Android phone';
  if(params.get('quality'))$('#quality').value=params.get('quality');
  if(params.get('pairPin'))$('#remotePin').value=params.get('pairPin');
}
prefill();

async function connectSession(){
  const btn=$('#connectBtn');btn.disabled=true;$('#connectError').textContent='';setStatus('Waiting for host approval…');
  try{
    let j;if(internetMode){j=await internetTransport.connect({pin:$('#remotePin').value.trim(),name:$('#name').value.trim(),quality:$('#quality').value,clientType});token='internet';sessionId=j.sessionId||'internet'}else{const r=await req('/api/remote/connect',{method:'POST',body:JSON.stringify({pin:$('#remotePin').value.trim(),name:$('#name').value.trim(),quality:$('#quality').value,clientType})});j=await r.json();token=j.token;sessionId=j.sessionId}permissions=j.permissions;sessionMode=j.mode||'pointer';connected=true;
    $('#connectMain').classList.add('hidden');$('#sessionUI').classList.remove('hidden');$('#topDisconnect').classList.remove('hidden');
    setStatus(internetMode?(j.transport==='relay'?'Connected · Showcase Relay':'Connected · Internet P2P'):'Connected',true);document.body.classList.add('session-active');nativeCall('sessionState','active');
    setInputMode(inputMode,false);setSessionModeUI(sessionMode);updateTools();fitCanvas();installInternetFrameHooks();frameLoop();statusLoop();
    if(internetMode){internetTransport.flushQueuedFrame?.();clearTimeout(firstFrameTimer);firstFrameTimer=setTimeout(()=>{if(connected&&!hasFrame){const message=(j.transport==='relay'?'Relay connected, but the first screen frame has not arrived.':'Connected, but the first screen frame has not arrived.')+' Check the host Frame diagnostics in /monitor.';$('#viewerPlaceholder').querySelector('p')?.replaceChildren(document.createTextNode(message));internetTransport.report?.('first-frame-timeout',{message});}},9000);}
  }catch(e){setStatus('Not connected');$('#connectError').textContent=e.message}
  finally{btn.disabled=false}
}
$('#connectBtn').onclick=connectSession;
if(params.get('autoPair')==='1'&&params.get('pairPin'))setTimeout(connectSession,350);

function ownsControl(){return !controlOwner?.active||controlOwner.sessionId===sessionId}
function updateTools(){
  const canControl=!!permissions.control&&ownsControl();
  $$('[data-session-mode="control"],[data-mobile-session-mode="control"]').forEach(x=>{x.disabled=!canControl;x.title=!permissions.control?'Host disabled control':(!ownsControl()?`Control is in use by ${controlOwner.name||'another participant'}`:'Use the shared Windows cursor')});
  $$('#leftClick,#rightClick,#keyboardBtn,#mobileKeyboard,#sheetKeyboard,[data-key]').forEach(x=>x.disabled=sessionMode!=='control'||!canControl);
  if($('#clipBtn'))$('#clipBtn').disabled=!permissions.clipboard;if($('#fileInput'))$('#fileInput').disabled=!permissions.files;if($('#sheetFileInput'))$('#sheetFileInput').disabled=!permissions.files;
  if((!permissions.control||!ownsControl())&&sessionMode==='control')setSessionModeUI('pointer');
}
function setSessionModeUI(mode){
  sessionMode=mode;
  $$('[data-session-mode],[data-mobile-session-mode]').forEach(x=>x.classList.toggle('active',(x.dataset.sessionMode||x.dataset.mobileSessionMode)===mode));
  const notice=$('#modeNotice');
  notice.innerHTML=mode==='pointer'?'<strong>Guide Pointer</strong> · independent overlay; clicks create guidance pulses only':'<strong>Control</strong> · you own the one native Windows cursor; the coloured arrow is hidden';
  updateTools();
}
async function setSessionMode(mode,notify=true){
  if(mode==='control'&&!permissions.control){showGesture('Host has disabled control');return}
  if(mode==='control'&&!ownsControl()){showGesture(`Control is in use by ${controlOwner.name||'another participant'}`);return}
  try{await req('/api/remote/mode',{method:'POST',body:JSON.stringify({mode})});setSessionModeUI(mode);haptic();if(notify)showGesture(mode==='pointer'?'Independent guide pointer enabled':'Shared Windows cursor control enabled')}
  catch(e){showGesture(e.message)}
}
function normalizeInputMode(mode){return mode==='direct'?'touchscreen':mode==='trackpad'?'touchpad':mode}
function setInputMode(mode,notify=true){
  mode=normalizeInputMode(mode);inputMode=mode;
  const shell=$('#sessionUI');shell.classList.toggle('input-touchpad',mode==='touchpad');shell.classList.toggle('input-touchscreen',mode==='touchscreen');
  $$('[data-input-mode],[data-mobile-input-mode]').forEach(x=>x.classList.toggle('active',normalizeInputMode(x.dataset.inputMode||x.dataset.mobileInputMode)===mode));
  if(mode==='touchscreen'){setFloatingPad(floatingPadVisible,false);setTimeout(fitCanvas,60)}else{$('#floatingPad')?.classList.add('hidden-pad');setTimeout(fitCanvas,60)}
  if(notify){showGesture(mode==='touchscreen'?'Touchscreen mode: touch the remote screen':'Touchpad mode: drag in the precision pad');haptic()}
}
function setFloatingPad(show,notify=true){floatingPadVisible=show;const pad=$('#floatingPad');if(!pad)return;pad.classList.toggle('hidden-pad',!show||inputMode!=='touchscreen');if(notify)showGesture(show?'Floating touchpad shown':'Floating touchpad hidden')}
function installFloatingPadDrag(){
  const pad=$('#floatingPad'),head=pad?.querySelector('.floating-pad-head');if(!pad||!head)return;let drag=null,raf=0,next=null;
  try{const saved=JSON.parse(localStorage.getItem(FLOATING_POS_KEY)||'null');if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){pad.style.left=`${saved.x}px`;pad.style.top=`${saved.y}px`;pad.style.right='auto';pad.style.bottom='auto'}}catch{}
  const apply=()=>{raf=0;if(!next)return;const parent=pad.offsetParent||$('#viewerStage'),pr=parent.getBoundingClientRect(),visual=pad.getBoundingClientRect(),w=visual.width,h=visual.height;const x=clamp(next.clientX-pr.left-drag.dx,8,Math.max(8,pr.width-w-8)),y=clamp(next.clientY-pr.top-drag.dy,62,Math.max(62,pr.height-h-74));pad.style.left=`${x}px`;pad.style.top=`${y}px`;pad.style.right='auto';pad.style.bottom='auto';next=null};
  head.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;const r=pad.getBoundingClientRect();drag={id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};head.setPointerCapture?.(e.pointerId);e.preventDefault()});
  head.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;next=e;if(!raf)raf=requestAnimationFrame(apply)});
  const stop=e=>{if(!drag||e&&e.pointerId!==drag.id)return;if(next)apply();const x=parseFloat(pad.style.left),y=parseFloat(pad.style.top);if(Number.isFinite(x)&&Number.isFinite(y))try{localStorage.setItem(FLOATING_POS_KEY,JSON.stringify({x,y}))}catch{}drag=null};head.addEventListener('pointerup',stop);head.addEventListener('pointercancel',stop);
  $('#pinFloatingPad').onclick=()=>{pad.style.left='';pad.style.top='';pad.style.right='';pad.style.bottom='';try{localStorage.removeItem(FLOATING_POS_KEY)}catch{}showGesture('Floating pad reset')};
}
installFloatingPadDrag();

async function statusLoop(){
  while(connected){
    try{
      const r=await req('/api/remote/status');const j=await r.json();permissions=j.permissions||permissions;controlOwner=j.controlOwner||{active:false};
      renderParticipants(j.participants||[]);if(j.session?.mode&&j.session.mode!==sessionMode)setSessionModeUI(j.session.mode);
      if(!internetMode)$('#remoteFps').textContent=`${j.captureFps||0} FPS`;updateTools();if(!j.active)throw new Error('Host stopped receiving');
    }catch(e){if(connected){endSession(e.message);break}}
    await sleep(1200)
  }
}
function renderParticipants(items){
  const bar=$('#participantBar');const visible=items.filter(x=>x.visible);
  bar.innerHTML=visible.map(x=>`<div class="participant-chip ${x.sharedSystemCursor?'shared':''}"><i style="background:${escapeHtml(x.color)}">${escapeHtml((x.label||'R')[0].toUpperCase())}</i><span>${escapeHtml(x.label)} · ${x.sharedSystemCursor?'shared cursor':'guide pointer'}</span></div>`).join('');
}

function installInternetFrameHooks(){
  if(!internetMode)return;
  window.DexkInternetOnFrame=(meta,bytes)=>{if(!connected){pendingInternetFrame={meta,bytes};return;}drawInternetFrame(meta,bytes)};
  window.DexkInternetOnClose=message=>{if(connected)endSession(message||'Internet session closed')};
  if(pendingInternetFrame&&connected){const item=pendingInternetFrame;pendingInternetFrame=null;drawInternetFrame(item.meta,item.bytes)}
}
async function drawInternetFrame(meta,bytes){
  if(!connected){pendingInternetFrame={meta,bytes};return}
  const canvas=$('#screen'),ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
  try{
    seq=Number(meta?.seq||seq);frameW=Number(meta?.width||1);frameH=Number(meta?.height||1);
    const bmp=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'})),first=!hasFrame;
    if(canvas.width!==bmp.width||canvas.height!==bmp.height){canvas.width=bmp.width;canvas.height=bmp.height;frameW=bmp.width;frameH=bmp.height}
    ctx.drawImage(bmp,0,0);bmp.close();hasFrame=true;firstFrameRendered=true;clearTimeout(firstFrameTimer);$('#viewerPlaceholder').classList.add('hidden');
    frameCounter++;const now=performance.now();if(now-frameWindow>=1000){$('#remoteFps').textContent=`${frameCounter} FPS`;frameCounter=0;frameWindow=now}
    if(first){fitCanvas();internetTransport?.report?.('first-frame-rendered',{seq,width:frameW,height:frameH,bytes:Number(bytes?.byteLength||0)})}
  }catch(error){internetTransport?.report?.('frame-decode-error',{message:String(error.message||error).slice(0,180),seq:Number(meta?.seq||0),bytes:Number(bytes?.byteLength||0)});showGesture('A screen frame could not be decoded')}
}
async function frameLoop(){
  if(internetMode){installInternetFrameHooks();internetTransport.flushQueuedFrame?.();while(connected)await sleep(1000);return}
  const canvas=$('#screen'),ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
  while(connected){
    try{
      const r=await req(`/api/remote/frame?after=${seq}`);if(r.status===204)continue;
      seq=Number(r.headers.get('X-Frame-Seq')||seq);frameW=Number(r.headers.get('X-Frame-Width')||1);frameH=Number(r.headers.get('X-Frame-Height')||1);
      const bmp=await createImageBitmap(await r.blob()),first=!hasFrame;
      if(canvas.width!==bmp.width||canvas.height!==bmp.height){canvas.width=bmp.width;canvas.height=bmp.height;frameW=bmp.width;frameH=bmp.height}
      ctx.drawImage(bmp,0,0);bmp.close();hasFrame=true;$('#viewerPlaceholder').classList.add('hidden');
      frameCounter++;const now=performance.now();if(now-frameWindow>=1000){$('#remoteFps').textContent=`${frameCounter} FPS`;frameCounter=0;frameWindow=now}if(first)fitCanvas();
    }catch(e){if(connected)await sleep(260)}
  }
}

function stageRect(){return $('#viewerStage').getBoundingClientRect()}
function applyCanvasTransform(){const c=$('#screen');c.style.transform=`translate(${panX}px,${panY}px) scale(${viewScale})`}
function fitCanvas(){if(!hasFrame)return;const r=stageRect();fitScale=Math.min(r.width/frameW,r.height/frameH);viewScale=fitScale;panX=(r.width-frameW*viewScale)/2;panY=(r.height-frameH*viewScale)/2;applyCanvasTransform()}
function zoomAt(factor,cx=null,cy=null){if(!hasFrame)return;const r=stageRect();cx??=r.width/2;cy??=r.height/2;const old=viewScale,newScale=clamp(old*factor,fitScale*.7,Math.max(fitScale*5,2.5));const localX=(cx-panX)/old,localY=(cy-panY)/old;viewScale=newScale;panX=cx-localX*newScale;panY=cy-localY*newScale;applyCanvasTransform()}
$('#zoomIn').onclick=()=>zoomAt(1.2);$('#zoomOut').onclick=()=>zoomAt(1/1.2);$('#fitScreen').onclick=fitCanvas;window.addEventListener('resize',()=>{if(viewScale<=fitScale*1.05)fitCanvas()});
function canvasPoint(clientX,clientY,allowOutside=false){const r=$('#screen').getBoundingClientRect();if(!allowOutside&&(clientX<r.left||clientX>r.right||clientY<r.top||clientY>r.bottom))return null;return{x:clamp((clientX-r.left)/r.width,0,1),y:clamp((clientY-r.top)/r.height,0,1)}}

function rawSend(evt){if(!connected)return Promise.resolve();return req('/api/remote/input',{method:'POST',body:JSON.stringify(evt)}).catch(e=>{if(!/switch to Control/.test(e.message))showGesture(e.message)})}
function queueMove(evt){if(evt.type==='move_rel'&&pendingMove?.type==='move_rel'){pendingMove.dx=clamp(pendingMove.dx+evt.dx,-5000,5000);pendingMove.dy=clamp(pendingMove.dy+evt.dy,-5000,5000)}else pendingMove=evt;if(moveBusy)return;moveBusy=true;(async()=>{while(pendingMove&&connected){const current=pendingMove;pendingMove=null;await rawSend(current)}moveBusy=false})()}
function queueScroll(type,delta){pendingScroll[type]=clamp((pendingScroll[type]||0)+delta,-2400,2400);if(scrollBusy)return;scrollBusy=true;(async()=>{while(connected&&(pendingScroll.wheel||pendingScroll.hwheel)){for(const t of ['wheel','hwheel']){const value=pendingScroll[t];if(!value)continue;pendingScroll[t]=0;await rawSend({type:t,delta:value})}}scrollBusy=false})()}
async function flushMove(){while(moveBusy||pendingMove)await sleep(5)}
async function button(buttonName,down){await flushMove();return rawSend({type:'button',button:buttonName,down})}
async function click(buttonName='left',count=1){
  if(sessionMode==='pointer'){await rawSend({type:'pulse'});haptic();showGesture('Guide pointer highlighted');return}
  for(let i=0;i<count;i++){await button(buttonName,true);await sleep(28);await button(buttonName,false);if(i+1<count)await sleep(55)}haptic()
}
function sendKey(key){if(sessionMode!=='control')return showGesture('Switch to Control mode for keyboard input');rawSend({type:'key',key:Number(key),down:true}).then(()=>rawSend({type:'key',key:Number(key),down:false}));haptic()}
async function sendCombo(keys){if(sessionMode!=='control')return showGesture('Switch to Control mode first');for(const key of keys)await rawSend({type:'key',key,down:true});for(const key of [...keys].reverse())await rawSend({type:'key',key,down:false});haptic(24)}

function bindRelativePad(element,{tap=true}={}){
  if(!element)return;
  const points=new Map();let gesture=null,longTimer=null,longFired=false;
  const reset=()=>{clearTimeout(longTimer);points.clear();gesture=null;longFired=false};
  element.addEventListener('contextmenu',e=>e.preventDefault());
  element.addEventListener('pointerdown',e=>{
    if(!connected)return;element.setPointerCapture?.(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(points.size===1){gesture={count:1,start:{x:e.clientX,y:e.clientY},last:{x:e.clientX,y:e.clientY},started:performance.now(),moved:false,dragging:false};longFired=false;longTimer=setTimeout(async()=>{if(!gesture||gesture.moved||points.size!==1)return;if(!controllerPreferences.longPressRightClick)return;longFired=true;await click('right');showGesture(sessionMode==='pointer'?'Guide pointer highlighted':'Right click')},650)}
    else{clearTimeout(longTimer);const values=[...points.values()];gesture={count:points.size,startMid:midpoint(values[0],values[1]),lastMid:midpoint(values[0],values[1]),started:performance.now(),totalX:0,totalY:0}}
  });
  element.addEventListener('pointermove',e=>{
    if(!points.has(e.pointerId)||!gesture)return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});const values=[...points.values()];
    if(points.size===1&&gesture.count===1){const cur=values[0],dx=cur.x-gesture.last.x,dy=cur.y-gesture.last.y;if(Math.hypot(cur.x-gesture.start.x,cur.y-gesture.start.y)>8){gesture.moved=true;clearTimeout(longTimer)}if(dx||dy){const moved=pointerDelta(dx,dy);if(moved.dx||moved.dy)queueMove({type:'move_rel',...moved})};gesture.last=cur;return}
    if(points.size===2){const mid=midpoint(values[0],values[1]),dx=mid.x-gesture.lastMid.x,dy=mid.y-gesture.lastMid.y;gesture.totalX+=dx;gesture.totalY+=dy;if(sessionMode==='control'){if(Math.abs(dy)>2)queueScroll('wheel',scrollAmount('wheel',dy));if(Math.abs(dx)>2)queueScroll('hwheel',scrollAmount('hwheel',dx))}gesture.lastMid=mid;return}
    if(points.size>=3){const avg={x:values.reduce((a,v)=>a+v.x,0)/values.length,y:values.reduce((a,v)=>a+v.y,0)/values.length};if(!gesture.lastAvg)gesture.lastAvg=avg;gesture.totalX+=(avg.x-gesture.lastAvg.x);gesture.totalY+=(avg.y-gesture.lastAvg.y);gesture.lastAvg=avg}
  });
  element.addEventListener('pointerup',async e=>{
    if(!points.has(e.pointerId))return;points.delete(e.pointerId);clearTimeout(longTimer);
    if(points.size)return;
    if(gesture?.count===1&&!gesture.moved&&!longFired&&tap&&controllerPreferences.tapToClick&&performance.now()-gesture.started<560){const now={time:performance.now(),x:e.clientX,y:e.clientY};const dbl=lastTap&&now.time-lastTap.time<360&&distance(now,lastTap)<36;lastTap=dbl?null:now;await click('left',dbl?2:1)}
    else if(gesture&&gesture.count>=3){handleThreeFingerGesture(gesture.totalX||0,gesture.totalY||0)}
    reset();
  });
  element.addEventListener('pointercancel',reset);
}
function handleThreeFingerGesture(dx,dy){
  if(Math.max(Math.abs(dx),Math.abs(dy))<55){showGesture('Three-finger gesture cancelled');return}
  if(Math.abs(dy)>Math.abs(dx)){if(dy<0){showGesture('Task view');sendCombo([91,9])}else{showGesture('Show desktop');sendCombo([91,68])}}
  else if(dx>0){showGesture('Next app');sendCombo([18,9])}
  else{showGesture('Previous app');sendCombo([18,16,9])}
}

// Direct touchscreen / desktop interaction on the remote screen.
const stage=$('#viewerStage');new ResizeObserver(()=>{if(hasFrame&&viewScale<=fitScale*1.08)fitCanvas()}).observe(stage);const stagePointers=new Map();let stageGesture=null,stageLongTimer=null,stageLongFired=false;
stage.addEventListener('contextmenu',e=>{e.preventDefault();const p=canvasPoint(e.clientX,e.clientY);if(p){queueMove({type:'move_abs',...p});sessionMode==='pointer'?rawSend({type:'pulse'}):click('right')}});
stage.addEventListener('wheel',e=>{if(!connected)return;e.preventDefault();if(e.ctrlKey){zoomAt(e.deltaY<0?1.12:1/1.12,e.clientX-stageRect().left,e.clientY-stageRect().top);return}if(sessionMode==='control'){if(Math.abs(e.deltaX)>Math.abs(e.deltaY))queueScroll('hwheel',scrollAmount('hwheel',Math.sign(e.deltaX)*7.5));else queueScroll('wheel',scrollAmount('wheel',Math.sign(e.deltaY)*7.5))}},{passive:false});
stage.addEventListener('pointerdown',e=>{
  if(!connected||!hasFrame||inputMode!=='touchscreen')return;if(e.target.closest('.floating-touchpad,.viewport-tools,.participant-bar'))return;
  stage.setPointerCapture?.(e.pointerId);stagePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});clearTimeout(stageLongTimer);stageLongFired=false;
  if(stagePointers.size===1){const norm=canvasPoint(e.clientX,e.clientY);if(!norm)return;stageGesture={count:1,start:{x:e.clientX,y:e.clientY},last:{x:e.clientX,y:e.clientY},normStart:norm,started:performance.now(),moved:false,dragging:false};if(sessionMode==='pointer')queueMove({type:'move_abs',...norm});stageLongTimer=setTimeout(async()=>{if(!stageGesture||stageGesture.moved)return;if(!controllerPreferences.longPressRightClick)return;stageLongFired=true;const p=canvasPoint(stageGesture.last.x,stageGesture.last.y)||stageGesture.normStart;await flushMove();await rawSend({type:'move_abs',...p});await click('right')},650)}
  else{clearTimeout(stageLongTimer);const vals=[...stagePointers.values()];stageGesture={count:stagePointers.size,startDist:distance(vals[0],vals[1]),startScale:viewScale,startPanX:panX,startPanY:panY,startMid:midpoint(vals[0],vals[1]),lastMid:midpoint(vals[0],vals[1]),lastAvgY:(vals[0].y+vals[1].y)/2,totalX:0,totalY:0}}
});
stage.addEventListener('pointermove',e=>{
  if(!stagePointers.has(e.pointerId)||!stageGesture||inputMode!=='touchscreen')return;stagePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const vals=[...stagePointers.values()];
  if(stagePointers.size===1&&stageGesture.count===1){const g=stageGesture,cur=vals[0],total=distance(cur,g.start);if(total>(isMobile?16:5)){g.moved=true;clearTimeout(stageLongTimer)}const norm=canvasPoint(cur.x,cur.y,true);if(!norm)return;if(sessionMode==='control'){if(controllerPreferences.touchDrag&&!g.dragging&&total>(isMobile?24:8)){g.dragging=true;(async()=>{await flushMove();await rawSend({type:'move_abs',...g.normStart});await button('left',true);queueMove({type:'move_abs',...norm})})()}else if(g.dragging)queueMove({type:'move_abs',...norm});else queueMove({type:'move_abs',...norm})}else queueMove({type:'move_abs',...norm});g.last=cur;return}
  if(stagePointers.size===2){const mid=midpoint(vals[0],vals[1]),dist=distance(vals[0],vals[1]),ratio=dist/Math.max(1,stageGesture.startDist);const rect=stageRect();if(Math.abs(ratio-1)>.04){const desired=clamp(stageGesture.startScale*ratio,fitScale*.7,Math.max(fitScale*5,2.5));const localX=(stageGesture.startMid.x-rect.left-stageGesture.startPanX)/stageGesture.startScale;const localY=(stageGesture.startMid.y-rect.top-stageGesture.startPanY)/stageGesture.startScale;viewScale=desired;panX=mid.x-rect.left-localX*desired;panY=mid.y-rect.top-localY*desired;applyCanvasTransform()}else if(sessionMode==='control'){const dx=mid.x-stageGesture.lastMid.x,dy=mid.y-stageGesture.lastMid.y;if(Math.abs(dy)>3)queueScroll('wheel',scrollAmount('wheel',dy));if(Math.abs(dx)>3)queueScroll('hwheel',scrollAmount('hwheel',dx))}stageGesture.lastMid=mid;return}
  if(stagePointers.size>=3){const avg={x:vals.reduce((a,v)=>a+v.x,0)/vals.length,y:vals.reduce((a,v)=>a+v.y,0)/vals.length};if(!stageGesture.lastAvg)stageGesture.lastAvg=avg;stageGesture.totalX+=(avg.x-stageGesture.lastAvg.x);stageGesture.totalY+=(avg.y-stageGesture.lastAvg.y);stageGesture.lastAvg=avg}
});
stage.addEventListener('pointerup',async e=>{
  if(!stagePointers.has(e.pointerId))return;stagePointers.delete(e.pointerId);clearTimeout(stageLongTimer);if(stagePointers.size)return;const g=stageGesture;stageGesture=null;if(!g||stageLongFired)return;
  if(g.count>=3){handleThreeFingerGesture(g.totalX||0,g.totalY||0);return}
  if(g.dragging){await flushMove();await button('left',false);return}
  if(g.count===1&&!g.moved&&controllerPreferences.tapToClick&&performance.now()-g.started<560){const now={time:performance.now(),x:e.clientX,y:e.clientY};const dbl=lastTap&&now.time-lastTap.time<360&&distance(now,lastTap)<36;lastTap=dbl?null:now;const p=canvasPoint(e.clientX,e.clientY)||g.normStart;await flushMove();await rawSend({type:'move_abs',...p});await click('left',dbl?2:1)}
});
stage.addEventListener('pointercancel',()=>{stagePointers.clear();clearTimeout(stageLongTimer);if(stageGesture?.dragging&&sessionMode==='control')button('left',false);stageGesture=null});

bindRelativePad($('#virtualTrackpad'));bindRelativePad($('#floatingPadSurface'));
function bindScrollRail(el,type){if(!el)return;let last=null;el.addEventListener('pointerdown',e=>{last=type==='wheel'?e.clientY:e.clientX;el.setPointerCapture?.(e.pointerId)});el.addEventListener('pointermove',e=>{if(last===null||sessionMode!=='control')return;const cur=type==='wheel'?e.clientY:e.clientX,delta=cur-last;if(Math.abs(delta)>1.5){queueScroll(type,scrollAmount(type,delta));last=cur}});['pointerup','pointercancel'].forEach(n=>el.addEventListener(n,()=>last=null))}
bindScrollRail($('#verticalScroll'),'wheel');bindScrollRail($('#horizontalScroll'),'hwheel');

$$('[data-session-mode]').forEach(b=>b.onclick=()=>setSessionMode(b.dataset.sessionMode));$$('[data-mobile-session-mode]').forEach(b=>b.onclick=()=>setSessionMode(b.dataset.mobileSessionMode));
$$('[data-input-mode]').forEach(b=>b.onclick=()=>setInputMode(b.dataset.inputMode));$$('[data-mobile-input-mode]').forEach(b=>b.onclick=()=>setInputMode(b.dataset.mobileInputMode));
$('#switchToTouchscreen').onclick=()=>setInputMode('touchscreen');
$('#leftClick').onclick=()=>click('left');$('#rightClick').onclick=()=>click('right');$('#sheetLeft').onclick=()=>click('left');$('#sheetRight').onclick=()=>click('right');
$('#floatingLeft').onclick=()=>click('left');$('#floatingRight').onclick=()=>click('right');$('#hideFloatingPad').onclick=()=>setFloatingPad(false);$('#sheetFloatingPad').onclick=()=>{closeMore();setInputMode('touchscreen',false);setFloatingPad(!floatingPadVisible)};
$$('[data-key]').forEach(b=>b.onclick=()=>sendKey(b.dataset.key));

const hiddenInput=$('#hiddenInput');function openKeyboard(){if(sessionMode!=='control')return showGesture('Switch to Control mode first');hiddenInput.value='';hiddenInput.focus({preventScroll:true});nativeCall('showKeyboard');haptic()}
$('#keyboardBtn').onclick=openKeyboard;$('#mobileKeyboard').onclick=openKeyboard;$('#sheetKeyboard').onclick=()=>{closeMore();openKeyboard()};
hiddenInput.addEventListener('input',()=>{if(hiddenInput.value){rawSend({type:'text',text:hiddenInput.value});hiddenInput.value=''}});hiddenInput.addEventListener('keydown',e=>{if([8,9,13,27,32,37,38,39,40,46].includes(e.keyCode)){e.preventDefault();sendKey(e.keyCode)}});
document.addEventListener('keydown',e=>{if(!connected||document.activeElement===hiddenInput||!$('#clipModal').classList.contains('hidden'))return;if(e.key.length===1){if(sessionMode==='control'){rawSend({type:'text',text:e.key});e.preventDefault()}}else if([8,9,13,27,32,37,38,39,40,46].includes(e.keyCode)){sendKey(e.keyCode);e.preventDefault()}});

const prefModal=$('#inputPreferencesModal');
function renderInputPreferences(){const p=controllerPreferences;$('#pointerSpeed').value=p.pointerSpeed;$('#pointerSpeedValue').textContent=`${Number(p.pointerSpeed).toFixed(1)}×`;$('#pointerAcceleration').value=p.pointerAcceleration;$('#tapToClick').checked=p.tapToClick;$('#longPressRightClick').checked=p.longPressRightClick;$('#touchDrag').checked=p.touchDrag;$('#verticalScrollSpeed').value=p.verticalScrollSpeed;$('#verticalScrollValue').textContent=`${p.verticalScrollSpeed}×`;$('#verticalScrollDirection').value=p.verticalScrollDirection;$('#horizontalScrollSpeed').value=p.horizontalScrollSpeed;$('#horizontalScrollValue').textContent=`${p.horizontalScrollSpeed}×`;$('#horizontalScrollDirection').value=p.horizontalScrollDirection;$('#floatingPadSize').value=p.floatingPadSize;$('#floatingPadSizeValue').textContent=`${p.floatingPadSize}%`;$('#floatingPadOpacity').value=p.floatingPadOpacity;$('#floatingPadOpacityValue').textContent=`${p.floatingPadOpacity}%`;$('#controllerAccent').value=p.accent;$('#controllerDensity').value=p.density}
function openInputPreferences(){renderInputPreferences();prefModal.classList.remove('hidden')}
function closeInputPreferences(){prefModal.classList.add('hidden')}
function readInputPreferences(){controllerPreferences=normalizeControllerPreferences({pointerSpeed:Number($('#pointerSpeed').value),pointerAcceleration:$('#pointerAcceleration').value,tapToClick:$('#tapToClick').checked,longPressRightClick:$('#longPressRightClick').checked,touchDrag:$('#touchDrag').checked,verticalScrollSpeed:Number($('#verticalScrollSpeed').value),verticalScrollDirection:$('#verticalScrollDirection').value,horizontalScrollSpeed:Number($('#horizontalScrollSpeed').value),horizontalScrollDirection:$('#horizontalScrollDirection').value,floatingPadSize:Number($('#floatingPadSize').value),floatingPadOpacity:Number($('#floatingPadOpacity').value),accent:$('#controllerAccent').value,density:$('#controllerDensity').value})}
$('#inputPreferencesBtn').onclick=openInputPreferences;$('#sheetPreferences').onclick=()=>{closeMore();openInputPreferences()};$('#closeInputPreferences').onclick=closeInputPreferences;prefModal.onclick=e=>{if(e.target===prefModal)closeInputPreferences()};
['pointerSpeed','verticalScrollSpeed','horizontalScrollSpeed','floatingPadSize','floatingPadOpacity'].forEach(id=>$('#'+id).addEventListener('input',()=>{readInputPreferences();renderInputPreferences();applyControllerPreferences()}));
$('#saveInputPreferences').onclick=()=>{readInputPreferences();persistControllerPreferences();closeInputPreferences();showGesture('Controller preferences saved')};$('#resetInputPreferences').onclick=()=>{controllerPreferences={...defaultControllerPreferences};persistControllerPreferences();renderInputPreferences();showGesture('Defaults restored')};

function openClipboard(){$('#clipModal').classList.remove('hidden')}function closeClipboard(){$('#clipModal').classList.add('hidden')}
$('#clipBtn').onclick=openClipboard;$('#sheetClip').onclick=()=>{closeMore();openClipboard()};$('#clipClose').onclick=closeClipboard;
$('#clipSend').onclick=async()=>{try{await req('/api/remote/clipboard',{method:'POST',body:JSON.stringify({text:$('#clipText').value})});closeClipboard();showGesture('Clipboard sent')}catch(e){showGesture(e.message)}};
$('#clipGet').onclick=async()=>{try{const j=await (await req('/api/remote/clipboard')).json();$('#clipText').value=j.text;showGesture('Clipboard loaded')}catch(e){showGesture(e.message)}};
async function uploadFile(file){if(!file)return;const form=new FormData();form.append('file',file);try{setStatus(`Uploading ${file.name}…`,true);await req('/api/remote/upload',{method:'POST',body:form});setStatus('Connected',true);showGesture('File sent to host')}catch(e){showGesture(e.message)}}
$('#fileInput').onchange=e=>{uploadFile(e.target.files[0]);e.target.value=''};$('#sheetFileInput').onchange=e=>{uploadFile(e.target.files[0]);e.target.value='';closeMore()};
function toggleFullscreen(){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.()}
$('#fullBtn').onclick=toggleFullscreen;$('#sheetFullscreen').onclick=()=>{closeMore();toggleFullscreen()};$('#sheetFit').onclick=()=>{closeMore();fitCanvas()};
const more=$('#moreSheet');function openMore(){more.classList.remove('hidden')}function closeMore(){more.classList.add('hidden')}
$('#mobileMore').onclick=openMore;$('#closeMore').onclick=closeMore;more.onclick=e=>{if(e.target===more)closeMore()};$$('[data-sheet-input]').forEach(b=>b.onclick=()=>{setInputMode(b.dataset.sheetInput);closeMore()});
$('#topDisconnect').onclick=()=>endSession('Disconnected');$('#sheetDisconnect').onclick=()=>{closeMore();endSession('Disconnected')};
async function endSession(message='Disconnected'){if(!connected)return;connected=false;clearTimeout(firstFrameTimer);pendingInternetFrame=null;try{await req('/api/remote/disconnect',{method:'POST'})}catch{}if(internetMode)internetTransport.close();token='';sessionId='';setStatus(message);$('#sessionUI').classList.add('hidden');$('#connectMain').classList.remove('hidden');$('#topDisconnect').classList.add('hidden');$('#viewerPlaceholder').classList.remove('hidden');hasFrame=false;stagePointers.clear();document.body.classList.remove('session-active');nativeCall('sessionState','inactive')}
window.addEventListener('beforeunload',()=>{if(internetMode){internetTransport.close();return}if(token)navigator.sendBeacon(`/api/remote/disconnect?token=${encodeURIComponent(token)}`)});
