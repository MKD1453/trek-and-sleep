
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

let map,routeLayer,userMarker,userPosition=null,route=[],routeCum=[],routeEle=[],allPois=[],filter='all';
let gpsWatchId=null,lastGpsAccuracy=null,lastGpsTimestamp=null,gpsFixAccepted=false;
let liveWarnings=[],weatherSnapshot=null,weatherForecast=null,fireDanger=null;
let regionalFireRisk=null;
let routeStageForecast=[];let startTimeAdvice=null;
let tourPlan=loadTourPlan();
let mapPlan=loadMapPlan();let mapPlanMode=null;let mapPlanLayers=[];
let liveStageState=null;
let liveNavState={activeStageIndex:0,reachedStops:{},completed:false};
let navigationSession=loadNavigationSession();
let routeTrackingState={offRoute:false,distanceToRouteM:null,alongKm:null,lastUpdate:null};
let navigationModeState={mode:'idle',distanceToStartKm:null,lastStableAt:0,lastGpsAt:0};
let userRouteMarker=null;
let routeHazards=[],hazardLayers=[];
let hikingSpeedKmh=Number(localStorage.getItem('trek_sleep_speed')||4.0);
let routeGeoContext={names:[],state:'',county:'',city:'',resolved:false,error:false};
const NAV_PREFS={offRouteWarnM:80,importantWithinKm:8,waterWarnKm:5,sleepWarnKm:12};
let clusterLayer=null;

const TYPE={
 drinking_water:{icon:'💧',label:'Trinkwasser',base:10},
 water_source:{icon:'🌊',label:'Quelle / Wasser',base:5},
 shelter:{icon:'🏠',label:'Schutzhütte',base:6},
 camp:{icon:'⛺',label:'Schlafplatz',base:9},
 parking:{icon:'🅿',label:'Parkplatz',base:3},
 emergency:{icon:'✚',label:'Rettungspunkt',base:12},
 legal:{icon:'⚖',label:'Rechtsinfo',base:8}
};

const OVERPASS_ENDPOINTS=[
 'https://overpass-api.de/api/interpreter',
 'https://overpass.kumi.systems/api/interpreter',
 'https://overpass.nchc.org.tw/api/interpreter'
];

const LEGAL_DEMO=[
 {
  id:'legal-pfaelzerwald',type:'legal',name:'Pfälzerwald – Übernachtungsregeln',lat:49.18,lon:7.82,
  legal:{
   status:'Quellen geprüft · regionale Grundregel',
   region:'Biosphärenreservat Pfälzerwald',
   state:'Rheinland-Pfalz',
   tent:'Nur ausgewiesene Plätze',
   hammock:'Nicht separat freigegeben',
   bivouac:'Außerhalb zugelassener Plätze nicht freigegeben',
   fire:'Grundsätzlich verboten; Ausnahmen nur ausgewiesen/zulässig',
   stove:'Vor Ort / Waldbrandlage prüfen',
   fishing:'Separate Erlaubnis erforderlich',
   checked:'22.08.2026',
   source:'Landesforsten Rheinland-Pfalz + Biosphärenreservat Pfälzerwald'
  }
 }
];

function init(){

 v33RestoreRecording?.();
 if(!window.v32EngineTimer)window.v32EngineTimer=setInterval(()=>{try{v32UpdateEngine();v32InjectHud()}catch(e){}},2000);

 if(!window.v31AssistTimer)window.v31AssistTimer=setInterval(()=>{try{v31CheckAlerts();v30UpdateNavHintBar?.()}catch(e){}},5000);
 if(!window.v24NavRefresh){
   window.v24NavRefresh=setInterval(()=>{
     try{
       if(mapPlanMetrics().valid && !$('#modal')?.classList.contains('hidden')) return;
       updateLiveNavigationState();
       renderMapTourStatus();
     }catch(e){}
   },5000);
 }

 setTimeout(()=>{
   if(map && !map._v21PlanClickBound){
     map._v21PlanClickBound=true;
     map.on('click',e=>{
       if(!mapPlanMode)return;
       addPlanPoint(mapPlanMode,e.latlng.lat,e.latlng.lng);
       mapPlanMode=null;
       $('#mapPlanBtn').textContent='📍 Punkte planen';
       $('#mapPlanBtn').classList.remove('active');
       openMapPlanner();
     });
     drawMapPlan();
   }
 },0);

 map=L.map('map',{zoomControl:true}).setView([49.18,7.83],13);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
   maxZoom:19,attribution:'© OpenStreetMap contributors'
 }).addTo(map);

 clusterLayer=L.markerClusterGroup({
   showCoverageOnHover:false,
   maxClusterRadius:45,
   iconCreateFunction:c=>L.divIcon({
     html:`<div class="clusterCount">${c.getChildCount()}</div>`,
     className:'',iconSize:[38,38]
   })
 });
 map.addLayer(clusterLayer);

 const restored=restoreRoute();
 if(!restored){
   setRoute(
     [[49.205,7.865],[49.197,7.846],[49.188,7.835],[49.177,7.824],[49.166,7.81],[49.155,7.796]],
     'Demo-Route Pfälzerwald',false
   );
 }
 bind();
}


/* ===== V3.6.0: Navigationsassistenz ===== */
const V31_ASSIST_KEY='trek_sleep_v31_assist';
let v31Assist=loadV31Assist();
let v31LastAlert={turn:null,stop:null,offRoute:0};
let v31AudioCtx=null;

function loadV31Assist(){
 try{
   return {...{sound:true,vibration:true,turnWarnM:120,stopWarnM:80,offRouteWarnM:70},...JSON.parse(localStorage.getItem(V31_ASSIST_KEY)||'{}')};
 }catch(e){
   return {sound:true,vibration:true,turnWarnM:120,stopWarnM:80,offRouteWarnM:70};
 }
}
function saveV31Assist(){
 localStorage.setItem(V31_ASSIST_KEY,JSON.stringify(v31Assist));
}
function v31Vibrate(pattern){
 if(!v31Assist.vibration)return;
 try{if(navigator.vibrate)navigator.vibrate(pattern)}catch(e){}
}
function v31Beep(freq=720,duration=.14){
 if(!v31Assist.sound)return;
 try{
   if(!v31AudioCtx)v31AudioCtx=new (window.AudioContext||window.webkitAudioContext)();
   const o=v31AudioCtx.createOscillator(),g=v31AudioCtx.createGain();
   o.frequency.value=freq;o.type='sine';
   g.gain.setValueAtTime(.0001,v31AudioCtx.currentTime);
   g.gain.exponentialRampToValueAtTime(.12,v31AudioCtx.currentTime+.01);
   g.gain.exponentialRampToValueAtTime(.0001,v31AudioCtx.currentTime+duration);
   o.connect(g);g.connect(v31AudioCtx.destination);o.start();o.stop(v31AudioCtx.currentTime+duration+.02);
 }catch(e){}
}
function v31Notify(kind){
 if(kind==='turn'){v31Vibrate([90,50,90]);v31Beep(820,.12)}
 if(kind==='stop'){v31Vibrate([150,70,150]);v31Beep(620,.18)}
 if(kind==='offroute'){v31Vibrate([250,100,250]);v31Beep(430,.22)}
}
function v31NextPlannedPoint(){
 const pts=orderedPlanPoints?.()||[];
 const along=v30CurrentAlong?.()??0;
 return pts.find(p=>Number(p.alongKm)>along+.02)||null;
}
function v31OffRouteInfo(){
 if(!navigationSession?.active || !navLiveMode?.())return null;
 const u=normalizeCoord?.(userPosition);
 if(!u)return null;
 const near=nearestRouteTracking?.(u.lat,u.lon);
 if(!near || !Number.isFinite(Number(near.distanceM)))return null;
 return {
   distanceM:Number(near.distanceM),
   alongKm:Number(near.alongKm)||0,
   routeIndex:near.idx
 };
}
function v31RecoveryDirection(){
 const u=normalizeCoord?.(userPosition);
 const off=v31OffRouteInfo();
 if(!u || !off || !route?.length)return null;
 const p=route[Math.max(0,Math.min(route.length-1,off.routeIndex||0))];
 if(!p)return null;
 const b=v30Bearing([u.lat,u.lon],p);
 return {bearing:b,point:p};
}
function v31BearingLabel(b){
 if(!Number.isFinite(b))return '';
 const dirs=['N','NO','O','SO','S','SW','W','NW'];
 return dirs[Math.round(b/45)%8];
}
function v31AssistStatusHtml(){
 if(!navigationSession?.active || !navLiveMode?.())return '';
 const off=v31OffRouteInfo();
 const nextTurn=v30NextTrailHints?.(1)?.[0]||null;
 const along=v30CurrentAlong?.()??0;
 const turnDist=nextTurn?Math.max(0,(nextTurn.alongKm-along)*1000):null;
 const nextPoint=v31NextPlannedPoint();
 const stopDist=nextPoint?Math.max(0,(Number(nextPoint.alongKm)-along)*1000):null;

 let level='ok',title='Auf Route',badge='LIVE',hint='Navigation läuft normal.';
 if(off && off.distanceM>=v31Assist.offRouteWarnM){
   level=off.distanceM>=150?'danger':'warn';
   title='Route verlassen';
   badge=`${Math.round(off.distanceM)} m`;
   const r=v31RecoveryDirection();
   hint=`Zur GPX-Linie zurückkehren${r?` · ungefähr Richtung ${v31BearingLabel(r.bearing)}`:''}.`;
 }

 return `<div class="navAssistCard ${level==='ok'?'':level}">
   <div class="navAssistHead">
     <div><b>🔔 ${title}</b><small>${nextTurn?`${nextTurn.icon} ${nextTurn.label} in ${v30FormatDistKm(turnDist/1000)}`:'Keine nahe Abzweigung'}</small></div>
     <span class="navAssistBadge">${badge}</span>
   </div>
   <div class="navAssistGrid">
     <div><b>${turnDist==null?'—':Math.round(turnDist)+' m'}</b><small>bis nächster Richtungswechsel</small></div>
     <div><b>${stopDist==null?'—':Math.round(stopDist)+' m'}</b><small>bis nächster Planpunkt</small></div>
   </div>
   <div class="navAssistHint">${hint}</div>
 </div>`;
}
function v31CheckAlerts(){
 if(!navigationSession?.active || !navLiveMode?.())return;

 const along=v30CurrentAlong?.()??0;
 const turn=v30NextTrailHints?.(1)?.[0];
 if(turn){
   const d=Math.max(0,(turn.alongKm-along)*1000);
   if(d<=v31Assist.turnWarnM && v31LastAlert.turn!==turn.idx){
     v31LastAlert.turn=turn.idx;v31Notify('turn');
   }
 }

 const point=v31NextPlannedPoint();
 if(point){
   const d=Math.max(0,(Number(point.alongKm)-along)*1000);
   const key=point.created||`${point.type}-${point.alongKm}`;
   if(d<=v31Assist.stopWarnM && v31LastAlert.stop!==key){
     v31LastAlert.stop=key;v31Notify('stop');
   }
 }

 const off=v31OffRouteInfo();
 if(off && off.distanceM>=v31Assist.offRouteWarnM){
   if(Date.now()-v31LastAlert.offRoute>30000){
     v31LastAlert.offRoute=Date.now();v31Notify('offroute');
   }
 }
}
function openNavAssistSettings(){
 $('#modalBody').innerHTML=`
 <span class="tag">🔔 Navigationsassistenz · V3.6.0</span><h2>Hinweise unterwegs</h2>
 <div class="navAssistSettings">
   <div class="navAssistSetting"><div><b>Ton</b><small>Kurzer Signalton vor Abzweigungen, Stopps und bei Routenabweichung.</small></div><input id="v31Sound" type="checkbox" ${v31Assist.sound?'checked':''}></div>
   <div class="navAssistSetting"><div><b>Vibration</b><small>Vibrationsmuster auf unterstützten Geräten.</small></div><input id="v31Vib" type="checkbox" ${v31Assist.vibration?'checked':''}></div>
   <div class="navAssistSetting"><div><b>Abbiegewarnung</b><small>Entfernung vor einer markanten Richtungsänderung.</small></div><select id="v31Turn">${[60,100,120,150,200].map(v=>`<option value="${v}" ${v31Assist.turnWarnM===v?'selected':''}>${v} m</option>`).join('')}</select></div>
   <div class="navAssistSetting"><div><b>Stoppwarnung</b><small>Entfernung vor einem geplanten Zwischenstopp/Ziel.</small></div><select id="v31Stop">${[40,60,80,100,150].map(v=>`<option value="${v}" ${v31Assist.stopWarnM===v?'selected':''}>${v} m</option>`).join('')}</select></div>
   <div class="navAssistSetting"><div><b>Route verlassen</b><small>Ab dieser Entfernung zur GPX-Linie warnen.</small></div><select id="v31Off">${[40,60,70,100,150].map(v=>`<option value="${v}" ${v31Assist.offRouteWarnM===v?'selected':''}>${v} m</option>`).join('')}</select></div>
 </div>
 <button id="v31SaveAssist" class="primary wide">Einstellungen speichern</button>
 <button id="v31TestAssist" class="toolBtn wide">Ton/Vibration testen</button>`;
 $('#modal').classList.remove('hidden');

 $('#v31SaveAssist').onclick=()=>{
   v31Assist={
     sound:$('#v31Sound').checked,
     vibration:$('#v31Vib').checked,
     turnWarnM:Number($('#v31Turn').value),
     stopWarnM:Number($('#v31Stop').value),
     offRouteWarnM:Number($('#v31Off').value)
   };
   saveV31Assist();$('#modal').classList.add('hidden');
 };
 $('#v31TestAssist').onclick=()=>v31Notify('turn');
}
function v31LiveStripHtml(){
 if(!navigationSession?.active || !navLiveMode?.())return '';
 const along=v30CurrentAlong?.()??0;
 const total=routeCum?.at(-1)||0;
 const pct=total>0?Math.max(0,Math.min(100,along/total*100)):0;
 const turn=v30NextTrailHints?.(1)?.[0];
 const dist=turn?Math.max(0,turn.alongKm-along):null;
 return `<div class="liveNavStrip">
   <div class="liveNavStripTop">
     <div><b>${turn?`${turn.icon} ${turn.label}`:'🧭 Route folgen'}</b><small>${turn?`in ${v30FormatDistKm(dist)}`:'keine nahe Abzweigung'}</small></div>
     <strong>${Math.max(0,total-along).toFixed(1)} km</strong>
   </div>
   <div class="liveNavStripProgress"><span style="width:${pct.toFixed(0)}%"></span></div>
 </div>`;
}


/* ===== V3.6.0: GPS-gesteuerte Live-Navigation ===== */
const V32_KEY='trek_sleep_v32_live';
let v32Settings=loadV32Settings();
let v32State={
 activeTurnId:null,
 lastAlong:0,
 lastGpsAt:0,
 lastSpokenTurn:null,
 lastPassedTurn:null,
 passedTurns:new Set(),
 switchLockUntilKm:0
};

function loadV32Settings(){
 try{
   return {...{voice:false,autoAdvance:true,previewNext:true,reannounce:false},...JSON.parse(localStorage.getItem(V32_KEY)||'{}')};
 }catch(e){
   return {voice:false,autoAdvance:true,previewNext:true,reannounce:false};
 }
}
function saveV32Settings(){
 localStorage.setItem(V32_KEY,JSON.stringify(v32Settings));
}
function v32Speak(text){
 if(!v32Settings.voice || !('speechSynthesis' in window))return;
 try{
   speechSynthesis.cancel();
   const u=new SpeechSynthesisUtterance(text);
   u.lang='de-DE';u.rate=.95;u.pitch=1;
   speechSynthesis.speak(u);
 }catch(e){}
}
function v32GpsTracking(){
 if(!navigationSession?.active || !navLiveMode?.())return null;
 const u=normalizeCoord?.(userPosition);
 if(!u)return null;
 const near=nearestRouteTracking?.(u.lat,u.lon);
 if(!near || !Number.isFinite(Number(near.alongKm)))return null;
 return {user:u,near,alongKm:Number(near.alongKm),distanceM:Number(near.distanceM)||0};
}
function v32UpcomingTurns(limit=3){
 if(!v30TrailHints?.length)v30BuildTrailHints?.();
 const track=v32GpsTracking();
 const along=track?track.alongKm:(v30CurrentAlong?.()||0);

 // V3.6.0: once a turn is completed, never select it again.
 return (v30TrailHints||[])
   .filter(h=>!v32State.passedTurns?.has?.(h.idx))
   .filter(h=>h.alongKm>=along-.01)
   .slice(0,limit);
}
function v32TurnDistanceM(turn,along){
 return Math.max(0,(Number(turn.alongKm)-Number(along))*1000);
}
function v32PassedTurn(turn,along){
 // A turn becomes final only after we have moved clearly beyond it.
 // This prevents long/soft bends from oscillating around 0 m.
 return Number(along) >= Number(turn.alongKm)+.055;
}
function v32VoiceText(turn,distM){
 const d=Math.max(0,Math.round(distM/10)*10);
 const dir=turn?.label||'der Route folgen';
 if(d<=25)return `${dir}.`;
 return `In ${d} Metern ${dir.toLowerCase()}.`;
}
function v32UpdateEngine(){
 try{v33AddTrackPoint?.()}catch(e){}
 const track=v32GpsTracking();
 if(!track)return;

 v32State.lastGpsAt=Date.now();
 v32State.lastAlong=track.alongKm;

 if(!v32State.passedTurns || typeof v32State.passedTurns.has!=='function'){
   v32State.passedTurns=new Set();
 }

 // Finalize any hints clearly behind the current position.
 for(const h of (v30TrailHints||[])){
   if(track.alongKm >= Number(h.alongKm)+.055){
     v32State.passedTurns.add(h.idx);
   }
 }

 let turns=v32UpcomingTurns(3);
 let current=turns[0]||null;

 if(current){
   const id=current.idx;
   const d=v32TurnDistanceM(current,track.alongKm);

   if(v32State.activeTurnId!==id){
     v32State.activeTurnId=id;
   }

   // Once passed, permanently finalize the instruction and immediately
   // re-evaluate the next one on this same GPS update.
   if(v32PassedTurn(current,track.alongKm)){
     v32State.passedTurns.add(id);
     v32State.lastPassedTurn=id;
     v32State.activeTurnId=null;
     v32State.switchLockUntilKm=track.alongKm+.02;
     turns=v32UpcomingTurns(3);
     current=turns[0]||null;
   }

   if(current){
     const currentId=current.idx;
     const currentDist=v32TurnDistanceM(current,track.alongKm);

     if(currentDist<=v31Assist.turnWarnM && v32State.lastSpokenTurn!==currentId){
       v32State.lastSpokenTurn=currentId;
       v32Speak(v32VoiceText(current,currentDist));
     }
   }
 }

 v31CheckAlerts?.();
 v30UpdateNavHintBar?.();
}
function v32RecoveryText(track){
 if(!track || track.distanceM < v31Assist.offRouteWarnM)return null;
 const rec=v31RecoveryDirection?.();
 return {
   icon:'↗',
   label:'Zur Route zurück',
   distanceM:track.distanceM,
   detail:rec?`Richtung ${v31BearingLabel(rec.bearing)}`:'nächsten GPX-Abschnitt ansteuern'
 };
}
function v32LiveHudHtml(){
 const track=v32GpsTracking();
 if(!track)return '';

 const total=routeCum?.at(-1)||0;
 const pct=total>0?Math.max(0,Math.min(100,track.alongKm/total*100)):0;
 const remain=Math.max(0,total-track.alongKm);
 const rec=v32RecoveryText(track);
 const turns=v32UpcomingTurns(3);
 const current=turns[0]||null,next=turns[1]||null;

 let icon='↑',label='Route folgen',distanceText='—',detail='Keine nahe Abzweigung';
 let cls='';

 if(rec){
   cls='offroute';icon=rec.icon;label=rec.label;distanceText=`${Math.round(rec.distanceM)} m`;detail=rec.detail;
 }else if(current){
   icon=current.icon;label=current.label;
   const d=v32TurnDistanceM(current,track.alongKm);
   distanceText=d<1000?`${Math.round(d)} m`:`${(d/1000).toFixed(1)} km`;
   detail=`bei km ${current.alongKm.toFixed(1)}`;
 }

 const gpsAge=Math.max(0,Math.round((Date.now()-v32State.lastGpsAt)/1000));

 return `<div class="v32Hud ${cls}">
   <div class="v32HudTop">
     <div class="v32TurnIcon">${icon}</div>
     <div><b class="mainText">${escapeHtml(label)}</b><small>${escapeHtml(detail)}</small></div>
     <div class="v32Distance">${distanceText}</div>
   </div>
   ${v32Settings.previewNext && next && !rec?`<div class="v32Next"><div><small>Danach</small><strong>${next.icon} ${escapeHtml(next.label)}</strong></div><b>${v30FormatDistKm(Math.max(0,next.alongKm-track.alongKm))}</b></div>`:''}
   <div class="v32LiveGrid">
     <div><b>${track.alongKm.toFixed(1)} km</b><small>geschafft</small></div>
     <div><b>${remain.toFixed(1)} km</b><small>bis Ziel</small></div>
     <div><b>±${Math.round(userPosition?.accuracy||0)} m</b><small>GPS</small></div>
   </div>
   <div class="v32Progress"><span style="width:${pct.toFixed(0)}%"></span></div>
 </div>`;
}
function v32TimelineHtml(){
 const track=v32GpsTracking();
 if(!track)return '<div class="card"><b>Noch keine Live-GPS-Zuordnung.</b><p>Die Übersicht wird aktiv, sobald die Tour läuft.</p></div>';
 const turns=v32UpcomingTurns(6);
 if(!turns.length)return '<div class="card"><b>Keine weiteren Richtungswechsel.</b><p>Der restliche Abschnitt verläuft ohne markante GPX-Knickpunkte.</p></div>';
 return `<div class="v32Timeline">${turns.map((t,i)=>{
   const d=v32TurnDistanceM(t,track.alongKm);
   return `<div class="v32TimelineItem"><div class="v32TimelineIcon">${t.icon}</div><div><b>${i===0?'Jetzt: ':''}${escapeHtml(t.label)}</b><small>GPX km ${t.alongKm.toFixed(1)}</small></div><strong>${d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km'}</strong></div>`;
 }).join('')}</div>`;
}
function openLiveNavCenter(){
 const live=!!(navigationSession?.active && navLiveMode?.());
 $('#modalBody').innerHTML=`
 <span class="tag">🧭 Live-Navigation · V3.6.0</span><h2>GPS-Navigation</h2>
 ${live?v32LiveHudHtml():`<div class="card"><b>Vor-Tour-Modus</b><p>Die GPS-gesteuerte Navigation wird erst am Tourstart aktiviert.</p></div>`}
 ${live?v32TimelineHtml():''}
 <div class="v32Panel">
   <div class="v32Setting"><div><b>Sprachansagen</b><small>Deutsche Ansage vor dem nächsten Richtungswechsel.</small></div><input id="v32Voice" type="checkbox" ${v32Settings.voice?'checked':''}></div>
   <div class="v32Setting"><div><b>Nächsten Hinweis zeigen</b><small>Blendet unter dem aktuellen Manöver bereits den folgenden Hinweis ein.</small></div><input id="v32Preview" type="checkbox" ${v32Settings.previewNext?'checked':''}></div>
 </div>
 <button id="v32Save" class="primary wide">Live-Einstellungen speichern</button>
 ${live?'<button id="v32VoiceTest" class="toolBtn wide">Sprachansage testen</button>':''}`;
 $('#modal').classList.remove('hidden');

 $('#v32Save').onclick=()=>{
   v32Settings.voice=$('#v32Voice').checked;
   v32Settings.previewNext=$('#v32Preview').checked;
   saveV32Settings();
   openLiveNavCenter();
 };
 if($('#v32VoiceTest'))$('#v32VoiceTest').onclick=()=>{
   const old=v32Settings.voice;v32Settings.voice=true;v32Speak('In 50 Metern rechts abbiegen.');v32Settings.voice=old;
 };
}
function v32InjectHud(){
 const host=$('#mapTourStatusHost');
 if(!host)return;
 const existing=host.querySelector('.v32Hud');
 const live=!!(navigationSession?.active && navLiveMode?.());
 if(!live){
   if(existing)existing.remove();
   return;
 }
 const html=v32LiveHudHtml();
 if(!html)return;
 if(existing)existing.outerHTML=html;
 else host.insertAdjacentHTML('afterbegin',html);
}


/* ===== V3.6.0: Navigations-Simulator ===== */
let v321Sim={
 active:false,
 running:false,
 speedKmh:4,
 alongKm:0,
 offRouteM:0,
 timer:null,
 lastTs:0,
 lastPassedTurnKm:-1
};

function v321RoutePointAt(alongKm){
 if(!route?.length||!routeCum?.length)return null;
 const target=Math.max(0,Math.min(routeCum.at(-1)||0,Number(alongKm)||0));
 let i=0;
 while(i<routeCum.length-1 && routeCum[i+1]<target)i++;
 const a=routeCum[i]||0,b=routeCum[Math.min(i+1,routeCum.length-1)]||a;
 const t=b>a?(target-a)/(b-a):0;
 const p1=route[i],p2=route[Math.min(i+1,route.length-1)];
 const lat=p1[0]+(p2[0]-p1[0])*t;
 const lon=p1[1]+(p2[1]-p1[1])*t;
 return {lat,lon,idx:i};
}
function v321OffsetPoint(lat,lon,meters){
 if(!meters)return {lat,lon};
 // simple east/west offset for simulator only
 const dLon=meters/(111320*Math.cos(lat*Math.PI/180));
 return {lat,lon:lon+dLon};
}
function v321ApplySimPosition(){
 const p=v321RoutePointAt(v321Sim.alongKm);
 if(!p)return;
 const o=v321OffsetPoint(p.lat,p.lon,v321Sim.offRouteM);
 userPosition={
   lat:o.lat,lon:o.lon,accuracy:5,heading:null,speed:v321Sim.speedKmh/3.6,
   timestamp:Date.now(),simulated:true
 };
 try{
   if(userMarker)userMarker.setLatLng([o.lat,o.lon]);
   else if(map)L.circleMarker([o.lat,o.lon],{radius:8,color:'#fff',weight:2,fillColor:'#2f8cff',fillOpacity:1}).addTo(map);
 }catch(e){}
 navigationSession.active=true;
 try{if(typeof navigationSession.startedAt==='undefined')navigationSession.startedAt=Date.now()}catch(e){}
 v32State.lastGpsAt=Date.now();
 v32State.lastAlong=v321Sim.alongKm;
 v32UpdateEngine?.();

 // V3.6.0: A simulator run is governed by the GPX end, not by an
 // intermediate navigation/stage state. Some route plans can temporarily
 // mark a stage as finished while passing a generated turn. Keep the
 // navigation session alive until the virtual position reaches the true
 // end of the loaded GPX route.
 const __simTotal=routeCum?.at(-1)||0;
 if(v321Sim.active && v321Sim.alongKm < __simTotal-0.015){
   if(!navigationSession.active){
     navigationSession.active=true;
     saveNavigationSession?.();
     setNavigationButton?.();
   }
   if(typeof liveNavState==='object' && liveNavState){
     liveNavState.completed=false;
     liveNavState.active=true;
   }

   // V3.6.0: every virtual GPS fix must drive the same navigation UI/update
   // path as a real GPS fix. Re-select the next unpassed trail instruction
   // and force the live navigation HUD/status to stay visible.
   if(v30TrailHints?.length){
     const __next=v30TrailHints.find(h=>h.alongKm > v321Sim.alongKm + 0.002)
                  || v30TrailHints[v30TrailHints.length-1];
     if(__next){
       if(typeof liveNavState==='object' && liveNavState){
         liveNavState.nextHint=__next;
         liveNavState.nextHintIndex=v30TrailHints.indexOf(__next);
       }
     }
   }
   try{v32UpdateEngine?.()}catch(e){console.warn('v32 engine',e)}
   try{v32InjectHud?.()}catch(e){console.warn('v32 hud',e)}
   try{renderMapTourStatus?.()}catch(e){console.warn('tour status',e)}
   return;
 }

 v32InjectHud?.();
 renderMapTourStatus?.();
}
function v321Step(deltaKm){
 const total=routeCum?.at(-1)||0;
 v321Sim.alongKm=Math.max(0,Math.min(total,v321Sim.alongKm+deltaKm));
 v321ApplySimPosition();
}
function v321Tick(ts){
 if(!v321Sim.running)return;
 if(!v321Sim.lastTs)v321Sim.lastTs=ts;
 const dt=(ts-v321Sim.lastTs)/1000;
 v321Sim.lastTs=ts;
 const kmPerSec=v321Sim.speedKmh/3600;
 try{
   v321Step(kmPerSec*dt);
 }catch(e){
   console.warn('Simulator navigation update failed, continuing movement',e);
   v321Sim.alongKm=Math.max(0,Math.min(routeCum?.at(-1)||0,v321Sim.alongKm+kmPerSec*dt));
 }

 const __total=routeCum?.at(-1)||0;
 if(v321Sim.alongKm >= __total-0.001){
   v321Sim.alongKm=__total;
   v321ApplySimPosition();
   v321Sim.running=false;
   v321Sim.timer=null;
   return;
 }

 // Passing an instruction must never end the simulator. The next trail hint
 // is selected from the current along-route position on the following frame.
 if(v30TrailHints?.length){
   const passed=[...v30TrailHints].reverse().find(h=>h.alongKm<=v321Sim.alongKm);
   if(passed && passed.alongKm>v321Sim.lastPassedTurnKm){
     v321Sim.lastPassedTurnKm=passed.alongKm;
   }
 }
 v321Sim.timer=requestAnimationFrame(v321Tick);
}
function v321Start(){
 if(!route?.length){alert('Bitte zuerst eine GPX-Route laden.');return}
 if(!v321Sim.active || v321Sim.alongKm<=.001){
   v32State.activeTurnId=null;
   v32State.lastSpokenTurn=null;
   v32State.lastPassedTurn=null;
   v32State.passedTurns=new Set();
   v32State.switchLockUntilKm=0;
 }

 v321Sim.active=true;v321Sim.running=true;v321Sim.lastTs=0;
 v321ApplySimPosition();
 v321Sim.timer=requestAnimationFrame(v321Tick);
 openSimulatorCenter();
}
function v321Pause(){
 v321Sim.running=false;
 if(v321Sim.timer)cancelAnimationFrame(v321Sim.timer);
 v321Sim.timer=null;
 openSimulatorCenter();
}
function v321Reset(){
 v321Pause();
 v321Sim.active=false;v321Sim.alongKm=0;v321Sim.offRouteM=0;v321Sim.lastTs=0;v321Sim.lastPassedTurnKm=-1;
 v32State.activeTurnId=null;v32State.lastSpokenTurn=null;v32State.lastPassedTurn=null;v32State.passedTurns=new Set();v32State.switchLockUntilKm=0;
 try{
   if(userPosition?.simulated)userPosition=null;
 }catch(e){}
 openSimulatorCenter();
}
function v321JumpToNextTurn(){
 if(!v30TrailHints?.length)v30BuildTrailHints?.();
 const next=(v30TrailHints||[]).find(h=>h.alongKm>v321Sim.alongKm+.02);
 if(next){
   v321Sim.alongKm=Math.max(0,next.alongKm-.12);
   v321ApplySimPosition();
 }
 openSimulatorCenter();
}
function v321SetDeviation(m){
 v321Sim.offRouteM=Number(m)||0;
 v321ApplySimPosition();
 openSimulatorCenter();
}
function v321SimStatus(){
 const total=routeCum?.at(-1)||0;
 const turns=v30TrailHints?.length?v30TrailHints:v30BuildTrailHints?.()||[];
 const next=turns.find(h=>h.alongKm>=v321Sim.alongKm-.01);
 const d=next?Math.max(0,(next.alongKm-v321Sim.alongKm)*1000):null;
 return {total,next,d};
}
function openSimulatorCenter(){
 const s=v321SimStatus();
 $('#modalBody').innerHTML=`
 <span class="tag">🧪 Navigations-Simulator · V3.6.0</span><h2>Tour zuhause testen</h2>
 <div class="simCard">
   <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
     <div><h3>${v321Sim.running?'Simulation läuft':v321Sim.active?'Simulation pausiert':'Simulator bereit'}</h3><small>Virtuelle GPS-Position entlang der geladenen GPX-Route.</small></div>
     <span class="simBadge ${v321Sim.offRouteM?'off':''}">${v321Sim.offRouteM?`${v321Sim.offRouteM} m abseits`:'auf Route'}</span>
   </div>
   <div class="simGrid">
     <div class="simMetric"><b>${v321Sim.alongKm.toFixed(2)} km</b><small>virtueller Fortschritt</small></div>
     <div class="simMetric"><b>${Math.max(0,s.total-v321Sim.alongKm).toFixed(2)} km</b><small>bis Ziel</small></div>
     <div class="simMetric"><b>${v321Sim.speedKmh.toFixed(1)} km/h</b><small>Simulationsgeschwindigkeit</small></div>
     <div class="simMetric"><b>${s.next?`${s.next.icon} ${escapeHtml(s.next.label)}`:'Ziel'}</b><small>${s.d==null?'—':Math.round(s.d)+' m'} bis Hinweis</small></div>
   </div>
 </div>

 <div class="simPanel">
   <div class="simCard simRange">
     <b>Geschwindigkeit</b>
     <input id="simSpeed" type="range" min="1" max="8" step="0.5" value="${v321Sim.speedKmh}">
     <small>1–8 km/h</small>
   </div>

   <div class="simControls">
     <button id="simStart" class="primary">${v321Sim.running?'Läuft …':'▶ Simulation starten'}</button>
     <button id="simPause" class="toolBtn">⏸ Pause</button>
     <button id="simBack" class="toolBtn">−100 m</button>
     <button id="simForward" class="toolBtn">+100 m</button>
     <button id="simNextTurn" class="toolBtn">↪ Zum nächsten Hinweis</button>
     <button id="simReset" class="toolBtn warn">↺ Zurücksetzen</button>
   </div>

   <div class="simCard">
     <b>Routenabweichung testen</b>
     <small>Setzt die virtuelle Position absichtlich neben die GPX-Linie.</small>
     <div class="simDeviation" style="margin-top:10px">
       <button class="toolBtn simDev" data-m="0">0 m</button>
       <button class="toolBtn simDev" data-m="50">50 m</button>
       <button class="toolBtn simDev" data-m="100">100 m</button>
       <button class="toolBtn simDev" data-m="200">200 m</button>
     </div>
   </div>

   <div class="simCard">
     <b>Hinweise testen</b>
     <small>Ton, Vibration und Sprache verwenden dieselben Einstellungen wie die echte Navigation.</small>
     <div class="simControls" style="margin-top:10px">
       <button id="simTurnAlert" class="toolBtn">🔔 Abbiegewarnung</button>
       <button id="simOffAlert" class="toolBtn">⚠ Routenwarnung</button>
       <button id="simVoice" class="toolBtn">🗣 Sprachansage</button>
       <button id="simOpenLive" class="toolBtn">🧭 Live-HUD öffnen</button>
     </div>
   </div>
 </div>`;
 $('#modal').classList.remove('hidden');

 $('#simSpeed').oninput=e=>{v321Sim.speedKmh=Number(e.target.value);};
 $('#simStart').onclick=v321Start;
 $('#simPause').onclick=v321Pause;
 $('#simBack').onclick=()=>{v321Step(-.1);openSimulatorCenter()};
 $('#simForward').onclick=()=>{v321Step(.1);openSimulatorCenter()};
 $('#simNextTurn').onclick=v321JumpToNextTurn;
 $('#simReset').onclick=v321Reset;
 document.querySelectorAll('.simDev').forEach(b=>b.onclick=()=>v321SetDeviation(Number(b.dataset.m)));
 $('#simTurnAlert').onclick=()=>v31Notify('turn');
 $('#simOffAlert').onclick=()=>v31Notify('offroute');
 $('#simVoice').onclick=()=>{const old=v32Settings.voice;v32Settings.voice=true;v32Speak('In 50 Metern rechts abbiegen.');v32Settings.voice=old};
 $('#simOpenLive').onclick=openLiveNavCenter;
}


/* ===== V3.6.0: Tour-Aufzeichnung & Live-Statistik ===== */
const V33_TRACK_KEY='trek_sleep_v33_track';
const V33_HISTORY_KEY='trek_sleep_v33_history';

let v33Track={
 recording:false,
 paused:false,
 startedAt:null,
 pausedAt:null,
 pausedMs:0,
 points:[],
 totalKm:0,
 maxOffRouteM:0,
 lastPoint:null,
 source:null
};

function v33LoadHistory(){
 try{return JSON.parse(localStorage.getItem(V33_HISTORY_KEY)||'[]')}catch(e){return []}
}
function v33SaveHistory(list){
 const safe=Array.isArray(list)?list.slice(0,20):[];
 try{
   localStorage.setItem(V33_HISTORY_KEY,JSON.stringify(safe));
   const verify=JSON.parse(localStorage.getItem(V33_HISTORY_KEY)||'[]');
   return Array.isArray(verify) && verify.length>=safe.length;
 }catch(e){
   console.error('Track history save failed',e);
   return false;
 }
}
function v33HaversineKm(a,b){
 if(!a||!b)return 0;
 const R=6371;
 const p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180;
 const dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lon-a.lon)*Math.PI/180;
 const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
 return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
function v33ElapsedMs(){
 if(!v33Track.startedAt)return 0;
 const end=v33Track.recording?Date.now():(v33Track.finishedAt||Date.now());
 const activePause=v33Track.paused&&v33Track.pausedAt?(end-v33Track.pausedAt):0;
 return Math.max(0,end-v33Track.startedAt-v33Track.pausedMs-activePause);
}
function v33FmtDuration(ms){
 const min=Math.floor(ms/60000),h=Math.floor(min/60),m=min%60;
 return h?`${h} Std. ${m} Min.`:`${m} Min.`;
}
function v33AvgKmh(){
 const h=v33ElapsedMs()/3600000;
 return h>0?v33Track.totalKm/h:0;
}
function v33AddTrackPoint(){
 if(!v33Track.recording||v33Track.paused)return;
 const u=normalizeCoord?.(userPosition);
 if(!u)return;
 const now=Date.now();

 // Avoid flooding storage with near-identical GPS fixes.
 if(v33Track.lastPoint){
   const d=v33HaversineKm(v33Track.lastPoint,u)*1000;
   const dt=now-v33Track.lastPoint.t;
   if(d<2 && dt<3000)return;
 }
 const near=nearestRouteTracking?.(u.lat,u.lon);
 const off=near&&Number.isFinite(Number(near.distanceM))?Number(near.distanceM):0;
 v33Track.maxOffRouteM=Math.max(v33Track.maxOffRouteM,off);

 const p={lat:u.lat,lon:u.lon,t:now,accuracy:Number(userPosition?.accuracy)||0,offRouteM:off};
 if(v33Track.lastPoint)v33Track.totalKm+=v33HaversineKm(v33Track.lastPoint,p);
 v33Track.points.push(p);
 v33Track.lastPoint=p;
 v33Track.source=userPosition?.simulated?'Simulator':'GPS';
 try{localStorage.setItem(V33_TRACK_KEY,JSON.stringify(v33Track))}catch(e){}
}
function v33StartRecording(){
 if(v33Track.recording){
   if(v33Track.paused){
     v33Track.paused=false;
     if(v33Track.pausedAt)v33Track.pausedMs+=Date.now()-v33Track.pausedAt;
     v33Track.pausedAt=null;
   }
   openTrackCenter();return;
 }
 v33Track={
   recording:true,paused:false,startedAt:Date.now(),pausedAt:null,pausedMs:0,
   points:[],totalKm:0,maxOffRouteM:0,lastPoint:null,source:userPosition?.simulated?'Simulator':'GPS'
 };
 v33AddTrackPoint();
 openTrackCenter();
}
function v33PauseRecording(){
 if(!v33Track.recording)return;
 if(v33Track.paused){
   v33Track.paused=false;
   if(v33Track.pausedAt)v33Track.pausedMs+=Date.now()-v33Track.pausedAt;
   v33Track.pausedAt=null;
 }else{
   v33Track.paused=true;
   v33Track.pausedAt=Date.now();
 }
 try{localStorage.setItem(V33_TRACK_KEY,JSON.stringify(v33Track))}catch(e){}
 openTrackCenter();
}
function v33FinishRecording(){
 try{
   if(!v33Track.recording && !v33Track.points?.length){
     openTrackCenter();
     return;
   }

   const finishedAt=Date.now();
   if(v33Track.paused && v33Track.pausedAt){
     v33Track.pausedMs+=finishedAt-v33Track.pausedAt;
   }
   v33Track.paused=false;
   v33Track.pausedAt=null;
   v33Track.recording=false;
   v33Track.finishedAt=finishedAt;

   const points=Array.isArray(v33Track.points)
     ? v33Track.points.map(p=>({
         lat:Number(p.lat), lon:Number(p.lon), t:Number(p.t),
         accuracy:Number(p.accuracy)||0, offRouteM:Number(p.offRouteM)||0
       })).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Number.isFinite(p.t))
     : [];

   const elapsed=v33ElapsedMs();
   const hours=elapsed/3600000;
   const distance=Number(v33Track.totalKm)||0;

   const summary={
     id:'track_'+finishedAt,
     date:new Date(finishedAt).toISOString(),
     name:($('#routeName')?.textContent?.trim()||'Aufgezeichnete Tour'),
     distanceKm:Number(distance.toFixed(2)),
     durationMs:elapsed,
     avgKmh:Number((hours>0?distance/hours:0).toFixed(1)),
     maxOffRouteM:Math.round(Number(v33Track.maxOffRouteM)||0),
     points:points.length,
     source:v33Track.source||'GPS',
     trackPoints:points
   };

   const history=v33LoadHistory();
   history.unshift(summary);

   if(!v33SaveHistory(history)){
     throw new Error('Lokale Historie konnte nicht bestätigt werden.');
   }

   try{localStorage.removeItem(V33_TRACK_KEY)}catch(e){}

   v33Track={
     recording:false, paused:false, startedAt:null, pausedAt:null, pausedMs:0,
     points:[], totalKm:0, maxOffRouteM:0, lastPoint:null, source:null, finishedAt:null
   };

   openTrackCenter();
   setTimeout(()=>{
     const box=document.querySelector('.trackCard');
     if(box){
       const ok=document.createElement('div');
       ok.className='v332SaveOk';
       ok.textContent='✓ Tour gespeichert';
       box.prepend(ok);
       setTimeout(()=>ok.remove(),3500);
     }
   },0);
 }catch(e){
   console.error('V3.6.0 save error',e);
   // Recording data deliberately remains in memory for retry.
   v33Track.recording=false;
   openTrackCenter();
   setTimeout(()=>{
     const box=document.querySelector('.trackCard');
     if(box){
       const err=document.createElement('div');
       err.className='v332SaveError';
       err.textContent='⚠ Speichern fehlgeschlagen – Aufzeichnung bleibt erhalten. Erneut versuchen.';
       box.prepend(err);
     }
   },0);
 }
}
function v33ResetRecording(){
 v33Track={recording:false,paused:false,startedAt:null,pausedAt:null,pausedMs:0,points:[],totalKm:0,maxOffRouteM:0,lastPoint:null,source:null};
 try{localStorage.removeItem(V33_TRACK_KEY)}catch(e){}
 openTrackCenter();
}
function v33TrackGpx(track){
 const pts=track?.trackPoints||v33Track.points||[];
 const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const name=esc(track?.name||$('#routeName')?.textContent?.trim()||'Trek & Sleep Track');
 const seg=pts.map(p=>`<trkpt lat="${Number(p.lat).toFixed(7)}" lon="${Number(p.lon).toFixed(7)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`).join('');
 return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Trek & Sleep V3.6.0" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${name}</name><trkseg>${seg}</trkseg></trk></gpx>`;
}
function v33DownloadGpx(track){
 const xml=v33TrackGpx(track);
 const blob=new Blob([xml],{type:'application/gpx+xml'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');
 a.href=url;
 a.download=`trek-sleep-track-${new Date().toISOString().slice(0,10)}.gpx`;
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function v33TrackHudHtml(){
 if(!v33Track.recording)return '';
 return `<div class="trackHud">
   <div class="trackHudTop">
     <div><b>⏺ Aufzeichnung ${v33Track.paused?'pausiert':'läuft'}</b><small>${v33Track.source||'GPS'} · ${v33Track.points.length} Punkte</small></div>
     <strong>${v33Track.totalKm.toFixed(2)} km</strong>
   </div>
 </div>`;
}
function v33HistoryHtml(){
 const h=v33LoadHistory();
 if(!h.length)return '<div class="trackHistoryItem"><b>Noch keine abgeschlossene Aufzeichnung.</b><small>Die erste gespeicherte Tour erscheint hier.</small></div>';
 return `<div class="trackHistory">${h.slice(0,8).map((t,i)=>`
   <div class="trackHistoryItem">
     <b>${escapeHtml(t.name||'Aufgezeichnete Tour')}</b>
     <small>${new Date(t.date).toLocaleString('de-DE')} · ${escapeHtml(t.source||'GPS')}</small>
     <div class="trackMini"><span>${Number(t.distanceKm||0).toFixed(2)} km</span><span>${v33FmtDuration(t.durationMs||0)}</span><span>${Number(t.avgKmh||0).toFixed(1)} km/h</span></div>
     <button class="toolBtn wide v33Export" data-i="${i}" style="margin-top:9px">GPX exportieren</button>
   </div>`).join('')}</div>`;
}
function openTrackCenter(){
 const hasActive=!!v33Track.recording;
 const canFinish=hasActive || (Array.isArray(v33Track.points) && v33Track.points.length>0);

 $('#modalBody').innerHTML=`
 <span class="tag">⏺ Tour-Aufzeichnung · V3.6.0</span><h2>Gelaufenen Track aufzeichnen</h2>
 <div class="trackCard ${hasActive?'recording':''}">
   <div class="trackHead">
     <div><b style="font-size:22px">${hasActive?(v33Track.paused?'Aufzeichnung pausiert':'Aufzeichnung läuft'):'Bereit zur Aufzeichnung'}</b><small>${hasActive?`${v33Track.source||'GPS'} wird protokolliert.`:'Funktioniert mit echtem GPS und mit dem Simulator.'}</small></div>
     <span class="trackBadge ${hasActive?'rec':''}">${hasActive?'● REC':'bereit'}</span>
   </div>
   <div class="trackGrid">
     <div class="trackMetric"><b>${v33Track.totalKm.toFixed(2)} km</b><small>aufgezeichnet</small></div>
     <div class="trackMetric"><b>${v33FmtDuration(v33ElapsedMs())}</b><small>Bewegungszeit</small></div>
     <div class="trackMetric"><b>${v33AvgKmh().toFixed(1)} km/h</b><small>Durchschnitt</small></div>
     <div class="trackMetric"><b>${Math.round(v33Track.maxOffRouteM)} m</b><small>größte Routenabweichung</small></div>
   </div>
   <div class="trackActions">
     <button id="v33Start" class="primary">${hasActive?(v33Track.paused?'▶ Fortsetzen':'● Läuft'):'⏺ Aufzeichnung starten'}</button>
     <button id="v33Pause" class="toolBtn" ${hasActive?'':'disabled'}>${v33Track.paused?'▶ Fortsetzen':'⏸ Pause'}</button>
     <button id="v33Finish" class="toolBtn" ${canFinish?'':'disabled'}>🏁 Beenden & speichern</button>
     <button id="v33Reset" class="toolBtn warn">↺ Verwerfen</button>
   </div>
 </div>
 <h3 style="margin-top:18px">Gespeicherte Aufzeichnungen</h3>
 ${v33HistoryHtml()}`;

 $('#modal').classList.remove('hidden');

 $('#v33Start').onclick=v33StartRecording;
 if($('#v33Pause'))$('#v33Pause').onclick=v33PauseRecording;

 if($('#v33Finish')){
   $('#v33Finish').onclick=()=>{
     const btn=$('#v33Finish');
     if(btn.disabled)return;
     btn.disabled=true;
     btn.textContent='Speichere …';
     setTimeout(()=>v33FinishRecording(),0);
   };
 }

 $('#v33Reset').onclick=v33ResetRecording;

 document.querySelectorAll('.v33Export').forEach(b=>b.onclick=()=>{
   const t=v33LoadHistory()[Number(b.dataset.i)];
   if(t)v33DownloadGpx(t);
 });
}
function v33InjectTrackHud(){
 const host=$('#mapTourStatusHost');
 if(!host)return;
 const old=host.querySelector('.trackHud');
 if(!v33Track.recording){if(old)old.remove();return}
 const html=v33TrackHudHtml();
 if(old)old.outerHTML=html;
 else host.insertAdjacentHTML('afterbegin',html);
}
function v33RestoreRecording(){
 try{
   const raw=localStorage.getItem(V33_TRACK_KEY);
   if(raw){
     const saved=JSON.parse(raw);
     if(saved&&saved.recording){
       v33Track={...v33Track,...saved};
       v33Track.lastPoint=v33Track.points?.length?v33Track.points[v33Track.points.length-1]:null;
     }
   }
 }catch(e){}
}


/* ===== V3.6.0: Jagdzeiten & Sicherheitswarnungen ===== */
const V34_HUNTING_SOURCE='Rheinland-Pfalz §42 LJVO';
const V34_HUNTING_SOURCE_DATE='Stand der in der App hinterlegten Jagdzeiten: 24.08.2026';

// Core RLP seasons relevant to hikers. Ranges are evaluated each calendar year.
const V34_RLP_SEASONS=[
 {name:'Rotwild · Kälber',ranges:[[8,1,1,31]]},
 {name:'Rotwild · Schmaltiere/Schmalspießer',ranges:[[5,1,1,31]]},
 {name:'Rotwild · Alttiere/Hirsche',ranges:[[8,1,1,31]]},
 {name:'Damwild · Kälber',ranges:[[8,1,1,31]]},
 {name:'Damwild · Schmaltiere/Schmalspießer',ranges:[[5,1,1,31]]},
 {name:'Damwild · Alttiere/Hirsche',ranges:[[8,1,1,31]]},
 {name:'Sikawild',allYear:true},
 {name:'Muffelwild · Schmalschafe/Jährlinge',ranges:[[5,1,1,31]]},
 {name:'Muffelwild · Lämmer/Schafe/Widder',ranges:[[8,1,1,31]]},
 {name:'Rehwild · Schmalrehe/Böcke',ranges:[[5,1,1,31]]},
 {name:'Rehwild · Kitze/Ricken',ranges:[[9,1,1,31]]},
 {name:'Schwarzwild',allYear:true,note:'Elterntierschutz bleibt zu beachten.'},
 {name:'Feldhase',ranges:[[10,1,12,31]]},
 {name:'Wildkaninchen',allYear:true,note:'Behördliche lokale Schonzeiten möglich.'},
 {name:'Fuchs',ranges:[[8,1,2,28]]},
 {name:'Stein-/Baummarder',ranges:[[8,1,2,28]]},
 {name:'Hermelin',ranges:[[8,1,2,28]]},
 {name:'Dachs',ranges:[[8,1,12,31]]},
 {name:'Waschbär',ranges:[[8,1,2,28]]},
 {name:'Marderhund',ranges:[[8,1,2,28]]},
 {name:'Fasan',ranges:[[10,1,1,15]]},
 {name:'Ringeltaube',ranges:[[11,1,2,20]]},
 {name:'Graugans',ranges:[[8,1,8,31],[11,1,1,15]]},
 {name:'Kanada-/Nilgans',ranges:[[11,1,1,15]]},
 {name:'Stockente',ranges:[[9,1,1,15]]},
 {name:'Waldschnepfe',ranges:[[10,16,1,15]]},
 {name:'Rabenkrähe',ranges:[[8,1,2,20]]},
 {name:'Elster',ranges:[[8,1,2,20]]}
];

function v34DateInRange(d,m1,d1,m2,d2){
 const y=d.getFullYear();
 const start=new Date(y,m1-1,d1,0,0,0);
 let end=new Date(y,m2-1,d2,23,59,59);
 if(m2<m1 || (m2===m1&&d2<d1)){
   if(d<start){
     const prevStart=new Date(y-1,m1-1,d1,0,0,0);
     return d>=prevStart && d<=end;
   }
   end=new Date(y+1,m2-1,d2,23,59,59);
 }
 return d>=start && d<=end;
}
function v34SeasonOpen(item,d=new Date()){
 if(item.allYear)return true;
 return (item.ranges||[]).some(r=>v34DateInRange(d,...r));
}
function v34SeasonText(item){
 if(item.allYear)return 'ganzjährig*';
 const fmt=r=>`${String(r[0]).padStart(2,'0')}.${String(r[1]).padStart(2,'0')}.–${String(r[2]).padStart(2,'0')}.${String(r[3]).padStart(2,'0')}.`;
 return (item.ranges||[]).map(fmt).join(' / ');
}
function v34RouteCenter(){
 try{
   const pts=Array.isArray(route)?route:[];
   if(!pts.length){
     const u=normalizeCoord?.(userPosition);
     return u&&Number.isFinite(u.lat)&&Number.isFinite(u.lon)?{lat:u.lat,lon:u.lon}:null;
   }
   let lat=0,lon=0,n=0;
   for(const p of pts){
     let a=null,b=null;
     if(Array.isArray(p)){a=Number(p[0]);b=Number(p[1]);}
     else if(p&&typeof p==='object'){
       a=Number(p.lat ?? p.latitude);
       b=Number(p.lon ?? p.lng ?? p.longitude);
     }
     if(Number.isFinite(a)&&Number.isFinite(b)){lat+=a;lon+=b;n++}
   }
   return n?{lat:lat/n,lon:lon/n}:null;
 }catch(e){
   console.warn('v34RouteCenter',e);
   return null;
 }
}
function v34Region(){
 const c=v34RouteCenter();
 if(!c)return {state:'Unbekannt',area:'Tourregion nicht bestimmt',supported:false};
 // practical bounding box for current Germany prototype
 if(c.lat>=48.95&&c.lat<=50.95&&c.lon>=6.05&&c.lon<=8.55){
   const pfalz=(c.lat>=49.0&&c.lat<=49.65&&c.lon>=7.45&&c.lon<=8.35);
   return {state:'Rheinland-Pfalz',area:pfalz?'Pfälzerwald':'Rheinland-Pfalz',supported:true};
 }
 return {state:'Außerhalb RLP',area:'Jagdzeiten noch nicht hinterlegt',supported:false};
}

// NOAA-style approximate solar times; sufficient for an advisory dusk band.
function v34SunTimes(date,lat,lon){
 const rad=Math.PI/180;
 const start=new Date(date.getFullYear(),0,0);
 const N=Math.floor((date-start)/86400000);
 const gamma=2*Math.PI/365*(N-1+(12-12)/24);
 const eq=229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
 const decl=0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
 const zen=90.833*rad;
 const cosH=(Math.cos(zen)/(Math.cos(lat*rad)*Math.cos(decl)))-Math.tan(lat*rad)*Math.tan(decl);
 if(cosH<-1||cosH>1)return null;
 const H=Math.acos(cosH)/rad;
 const tz=-date.getTimezoneOffset()/60;
 const noon=720-4*lon-eq+tz*60;
 const rise=noon-4*H, set=noon+4*H;
 const mk=mins=>new Date(date.getFullYear(),date.getMonth(),date.getDate(),0,Math.round(mins),0);
 return {sunrise:mk(rise),sunset:mk(set)};
}
function v34DuskRisk(now=new Date()){
 const c=v34RouteCenter();
 if(!c)return {risk:false,text:'Dämmerung nicht berechenbar'};
 const sun=v34SunTimes(now,c.lat,c.lon);
 if(!sun)return {risk:false,text:'Dämmerung nicht berechenbar'};
 const pre=new Date(sun.sunrise.getTime()-90*60000);
 const after=new Date(sun.sunset.getTime()+90*60000);
 const morning=now>=pre&&now<=new Date(sun.sunrise.getTime()+60*60000);
 const evening=now>=new Date(sun.sunset.getTime()-90*60000)&&now<=after;
 const f=d=>d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
 return {risk:morning||evening,text:`Sonnenaufgang ca. ${f(sun.sunrise)} · Sonnenuntergang ca. ${f(sun.sunset)}`};
}
function v34Assessment(){
 try{
   const region=v34Region();
   const now=new Date();
   const dusk=v34DuskRisk(now);
   if(!region.supported)return {region,open:[],dusk,level:'unknown'};
   const open=V34_RLP_SEASONS.filter(x=>{
     try{return v34SeasonOpen(x,now)}catch(e){return false}
   });
   const high=open.length>0&&dusk.risk;
   return {region,open,dusk,level:high?'high':open.length?'caution':'low'};
 }catch(e){
   console.error('v34Assessment failed',e);
   return {
     region:{state:'Unbekannt',area:'Tourregion konnte nicht bestimmt werden',supported:false},
     open:[],
     dusk:{risk:false,text:'Dämmerung konnte nicht berechnet werden'},
     level:'unknown',
     error:String(e?.message||e)
   };
 }
}
function v34LocalHuntNotice(){
 // No central, reliable live feed is assumed. This field intentionally never
 // fabricates a local hunt. Future official feeds/municipal notices plug in here.
 return {
   status:'unbestätigt',
   title:'Keine bestätigte lokale Bewegungsjagd geladen',
   text:'Gesetzliche Jagdzeiten bedeuten nicht automatisch, dass gerade an deiner Route gejagt wird. Beschilderte Sperrungen und Anweisungen vor Ort haben immer Vorrang.'
 };
}
function v34HudHtml(){
 const a=v34Assessment();
 if(!a.region.supported)return '';
 if(!a.open.length&&!a.dusk.risk)return '';
 const msg=a.dusk.risk?'Jagdzeit + Dämmerungsfenster':'Jagdzeit im Tourgebiet aktiv';
 return `<div class="huntHud"><div><b>🦌 ${msg}</b><small>${escapeHtml(a.region.area)} · im Jagdcenter prüfen</small></div><strong>${a.open.length}</strong></div>`;
}
function v34InjectHud(){
 const host=$('#mapTourStatusHost');
 if(!host)return;
 const old=host.querySelector('.huntHud');
 const html=v34HudHtml();
 if(!html){if(old)old.remove();return}
 if(old)old.outerHTML=html;
 else host.insertAdjacentHTML('afterbegin',html);
}
function openHuntingCenter(){
 try{
   const modal=$('#modal'), body=$('#modalBody');
   if(!modal||!body)throw new Error('Modal-Fenster nicht gefunden.');

   const a=v34Assessment();
   const local=v34LocalHuntNotice();
   const cls=a.level==='high'?'high':a.level==='caution'?'caution':'';
   const openCount=Array.isArray(a.open)?a.open.length:0;
   const today=new Date().toLocaleDateString('de-DE');
   const dusk=a.dusk||{risk:false,text:'Keine Dämmerungsdaten'};

   const speciesHtml=a.region?.supported
     ? `<div class="huntSpecies">${V34_RLP_SEASONS.map(x=>{
         let open=false;
         try{open=v34SeasonOpen(x)}catch(e){}
         return `<div class="huntSpeciesRow"><div><b>${escapeHtml(x.name)}</b><small>${escapeHtml(v34SeasonText(x))}${x.note?' · '+escapeHtml(x.note):''}</small></div><span class="huntStatus ${open?'open':'closed'}">${open?'Jagdzeit':'Schonzeit'}</span></div>`;
       }).join('')}</div>`
     : `<div class="huntNotice"><b>Noch keine Jagdzeiten für diese Region hinterlegt.</b><small>V3.6.0 startet mit Rheinland-Pfalz. Weitere Bundesländer können später ergänzt werden.</small></div>`;

   body.innerHTML=`
    <span class="tag">🦌 Jagd & Sicherheit · V3.6.0</span><h2>Jagdhinweise entlang der Tour</h2>
    <div class="huntHero ${cls}">
      <div class="huntHead">
        <div><b style="font-size:22px">${escapeHtml(a.region?.area||'Tourregion')}</b><small>${escapeHtml(a.region?.state||'Unbekannt')} · Prüfung für ${today}</small></div>
        <span class="huntBadge">${a.region?.supported?(openCount?`${openCount} Jagdzeiten aktiv`:'keine erkannte Jagdzeit'):'Region noch nicht unterstützt'}</span>
      </div>
      <div class="huntGrid">
        <div class="huntMetric"><b>${openCount}</b><small>aktuell offene hinterlegte Jagdzeiten</small></div>
        <div class="huntMetric"><b>${dusk.risk?'erhöht':'normal'}</b><small>Dämmerungs-Hinweis</small></div>
        <div class="huntMetric"><b>${a.region?.supported?'RLP':'—'}</b><small>Regelwerk erkannt</small></div>
        <div class="huntMetric"><b>${escapeHtml(local.status)}</b><small>lokale Tagesjagd</small></div>
      </div>
    </div>

    <div class="huntNotice ${dusk.risk?'danger':'warn'}">
      <b>🌅 Dämmerung & Jagdbetrieb</b>
      <small>${escapeHtml(dusk.text)}${dusk.risk?' · Besonders sensibles Dämmerungsfenster.':''}</small>
    </div>

    <div class="huntNotice warn">
      <b>📍 ${escapeHtml(local.title)}</b>
      <small>${escapeHtml(local.text)}</small>
    </div>

    <h3 style="margin-top:18px">Jagdzeiten für Rheinland-Pfalz</h3>
    ${speciesHtml}

    <div class="huntFooter">
      <b>Wichtig:</b> Die Anzeige bestätigt keine aktuell laufende Jagd. Lokale Drückjagden, kurzfristige Sperrungen und behördliche Ausnahmen können von den allgemeinen Jagdzeiten abweichen. Beschilderung und Absperrungen vor Ort haben Vorrang.<br><br>
      Quelle der hinterlegten RLP-Jagdzeiten: ${V34_HUNTING_SOURCE}. ${V34_HUNTING_SOURCE_DATE}
    </div>`;

   modal.classList.remove('hidden');
 }catch(e){
   console.error('openHuntingCenter failed',e);
   const modal=$('#modal'),body=$('#modalBody');
   if(modal&&body){
     body.innerHTML=`<span class="tag">🦌 Jagd & Sicherheit · V3.6.0</span><h2>Jagdcenter</h2>
       <div class="huntNotice danger"><b>⚠ Jagdcenter konnte nicht vollständig geladen werden.</b>
       <small>${escapeHtml(String(e?.message||e))}</small></div>
       <button id="huntRetry" class="primary wide">Erneut laden</button>`;
     modal.classList.remove('hidden');
     const retry=$('#huntRetry'); if(retry)retry.onclick=openHuntingCenter;
   }else{
     alert('Jagdcenter konnte nicht geöffnet werden: '+String(e?.message||e));
   }
 }
}

function bind(){
 $('#gpsBtn').onclick=toggleGpsTracking;
 $('#warningBtn').onclick=openWarningCenter;
 $('#hazardLayerBtn').onclick=toggleHazardLayers;
 $('#paceBtn').onclick=openPaceSettings;
 $('#plannerBtn').onclick=openTourPlanner;
 $('#mapPlanBtn').onclick=openMapPlanner;
 $('#navStartBtn').onclick=toggleNavigationSession;
 $('#elevationBtn').onclick=openElevationProfile;
 $('#tourOverviewBtn').onclick=openTourOverview;
 $('#cockpitBtn').onclick=openTourCockpit;
 $('#trailGuideBtn').onclick=openTrailGuide;
 $('#dayPlanBtn').onclick=openDayStagePlanner;
 $('#navAssistBtn').onclick=openNavAssistSettings;
 $('#liveNavBtn').onclick=openLiveNavCenter;
 $('#simBtn').onclick=openSimulatorCenter;
 $('#trackBtn').onclick=openTrackCenter;
 $('#huntBtn').onclick=openHuntingCenter;
 setNavigationButton();
 if(localStorage.getItem('trek_sleep_plan_v20')) $('#plannerBtn').textContent='🗓 geplant';
 $('#paceBtn').textContent=`🚶 ${hikingSpeedKmh.toFixed(1).replace('.',',')} km/h`;
 $('#gpxBtn').onclick=()=>$('#gpxInput').click();
 $('#saveTourBtn').onclick=saveCurrentTour;
 $('#gpxInput').onchange=importGPX;
 $('#loadPoisBtn').onclick=()=>loadPois(false);
 $('#refreshBtn').onclick=()=>loadPois(true);
 $('#closeModal').onclick=()=>$('#modal').classList.add('hidden');

 $$('[data-filter].chip').forEach(b=>b.onclick=()=>{
   filter=b.dataset.filter;
   $$('[data-filter].chip').forEach(x=>x.classList.remove('active'));
   b.classList.add('active');
   renderPois();
 });

 $('#homeNav').onclick=openTourCockpit;
 $('#routeNav').onclick=openTourLibrary;
 $('#planNav').onclick=openTourPlanner;

 $('#sheetCompact').onclick=()=>setSheet('compact');
 $('#sheetHalf').onclick=()=>setSheet('half');
 $('#sheetFull').onclick=()=>setSheet('full');
 $('#legalInfoBtn').onclick=openLegalOverview;

 $('#moreNav').onclick=openV28Tools;
}

function info(title,text){
 $('#modalBody').innerHTML=`<span class="tag">TREK & SLEEP</span><h2>${title}</h2><p>${text}</p>`;
 $('#modal').classList.remove('hidden');
}

function setRoute(points,name,save=true,elevations=null){
 route=points;
 routeEle=Array.isArray(elevations)&&elevations.length===points.length?normalizeElevationArray(elevations):new Array(points.length).fill(null);
 if(usableElevationData(routeEle)){
   if(elevationDataSource==='none')elevationDataSource='gpx';
 }else{
   elevationDataSource='none';
 }
 routeGeoContext={names:[],state:'',county:'',city:'',resolved:false,error:false};
 routeCum=[0];
 for(let i=1;i<route.length;i++) routeCum[i]=routeCum[i-1]+hav(route[i-1],route[i]);

 if(routeLayer) map.removeLayer(routeLayer);
 routeLayer=L.polyline(route,{color:'#ff5e55',weight:6,opacity:.95}).addTo(map);
 map.fitBounds(routeLayer.getBounds(),{padding:[35,35]});

 $('#routeName').textContent=name;
 $('#routeMeta').textContent=`${routeCum.at(-1).toFixed(1)} km · präzise Linienberechnung`;

 if(save){
   try{localStorage.setItem('trek_sleep_last_route',JSON.stringify({name,points:route,elevations:routeEle,ts:Date.now()}))}catch(e){}
 }

 allPois=[];
 restorePoiCache();
 renderPois();
 updateProgress();
 updateNavigationStatus();
 refreshWarnings();
}

function restoreRoute(){
 try{
   const raw=localStorage.getItem('trek_sleep_last_route');
   if(!raw)return false;
   const x=JSON.parse(raw);
   if(!x?.points?.length)return false;
   setRoute(x.points,x.name||'Gespeicherte Route',false,x.elevations||null);
   return true;
 }catch(e){return false}
}

function hav(a,b){
 const R=6371,r=x=>x*Math.PI/180,d1=r(b[0]-a[0]),d2=r(b[1]-a[1]);
 const q=Math.sin(d1/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(d2/2)**2;
 return 2*R*Math.asin(Math.sqrt(q));
}

/* Präzise Projektion eines Punktes auf jedes Routensegment.
   Für kurze Segmentlängen genügt lokale equirektanguläre Projektion. */
function projectToSegment(p,a,b){
 const lat0=((a[0]+b[0]+p[0])/3)*Math.PI/180;
 const kx=111.320*Math.cos(lat0), ky=110.574;
 const ax=a[1]*kx, ay=a[0]*ky;
 const bx=b[1]*kx, by=b[0]*ky;
 const px=p[1]*kx, py=p[0]*ky;
 const vx=bx-ax, vy=by-ay, wx=px-ax, wy=py-ay;
 const len2=vx*vx+vy*vy;
 let t=len2?((wx*vx+wy*vy)/len2):0;
 t=Math.max(0,Math.min(1,t));
 const qx=ax+t*vx,qy=ay+t*vy;
 const dx=px-qx,dy=py-qy;
 const off=Math.hypot(dx,dy);
 const segLen=hav(a,b);
 const alongPart=segLen*t;
 const qLat=qy/ky,qLon=qx/kx;
 return {off,t,alongPart,point:[qLat,qLon]};
}

function nearestOnRoute(p){
 let best={off:Infinity,segment:0,along:0,point:route[0]};
 for(let i=0;i<route.length-1;i++){
   const pr=projectToSegment(p,route[i],route[i+1]);
   if(pr.off<best.off){
     best={
       off:pr.off,
       segment:i,
       along:(routeCum[i]||0)+pr.alongPart,
       point:pr.point
     };
   }
 }
 return best;
}


function toggleGpsTracking(){
 if(gpsWatchId!==null){
   navigator.geolocation.clearWatch(gpsWatchId);
   gpsWatchId=null;
   $('#gpsBtn').textContent='◎ GPS';
   $('#navStatus').classList.add('hidden');
   return;
 }
 startGpsTracking();
}

function startGpsTracking(){
 if(!navigator.geolocation)return alert('GPS nicht verfügbar.');
 $('#gpsBtn').textContent='… GPS';

 gpsWatchId=navigator.geolocation.watchPosition(p=>{
 if(v321Sim?.active)return;
   const candidate=[p.coords.latitude,p.coords.longitude];
   lastGpsAccuracy=p.coords.accuracy||null;
   lastGpsTimestamp=p.timestamp||Date.now();

   // Very poor fixes can be hundreds/metres or kilometres wrong, especially just after GPS starts.
   // Keep displaying GPS state but do not use a fix >150 m accuracy for route warnings.
   gpsFixAccepted=!lastGpsAccuracy || lastGpsAccuracy<=150;
   if(!gpsFixAccepted){
     $('#gpsBtn').textContent='△ GPS';
     $('#navStatus').classList.remove('hidden');
     $('#navStatus').classList.remove('offroute');
     $('#routeStateLabel').textContent='GPS wird präzisiert';
     $('#routeStateMeta').textContent=`Aktuelle Genauigkeit ±${Math.round(lastGpsAccuracy)} m`;
     $('#routeDeviation').textContent='—';
     $('#nextPointName').textContent='Warte auf genaueren GPS-Fix';
     $('#nextPointMeta').textContent='Routenwarnungen sind vorübergehend pausiert.';
     $('#nextPointDistance').textContent='—';
     $('#alertBox').classList.add('hidden');
     return;
   }

   userPosition=candidate;
   resolveNavigationMode(true);

   if(userMarker) userMarker.setLatLng(userPosition);
   else userMarker=L.circleMarker(userPosition,{
     radius:9,color:'#fff',weight:4,fillColor:'#238ef0',fillOpacity:1
   }).addTo(map);

   $('#gpsBtn').textContent='● GPS';
   updateProgress();
   recalcPoiMetrics();
   updateNavigationStatus();
   updateTurnInstruction();
   refreshWarnings();
   renderPois();
 },e=>{
   $('#gpsBtn').textContent='◎ GPS';
   if(gpsWatchId!==null){
     navigator.geolocation.clearWatch(gpsWatchId);
     gpsWatchId=null;
   }
   alert(e.message);
 },{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
}

function locate(){
 startGpsTracking();
}


/* ===== V3.6.0 runtime-safe GPS/navigation helpers ===== */
function finiteNumber(v){
 const n=Number(v);
 return Number.isFinite(n)?n:null;
}
function safeMeters(v){
 const n=finiteNumber(v);
 return n==null?null:Math.max(0,n);
}
function coordLat(pos){
 if(!pos)return null;
 if(Array.isArray(pos))return finiteNumber(pos[0]);
 return finiteNumber(pos.lat ?? pos.latitude ?? pos[0]);
}
function coordLon(pos){
 if(!pos)return null;
 if(Array.isArray(pos))return finiteNumber(pos[1]);
 return finiteNumber(pos.lon ?? pos.lng ?? pos.longitude ?? pos[1]);
}
function normalizeCoord(pos){
 const lat=coordLat(pos),lon=coordLon(pos);
 if(lat==null || lon==null)return null;
 if(Math.abs(lat)>90 || Math.abs(lon)>180)return null;
 return {lat,lon};
}
function safeDistanceKm(lat1,lon1,lat2,lon2){
 const vals=[lat1,lon1,lat2,lon2].map(finiteNumber);
 if(vals.some(v=>v==null))return null;
 const d=haversineKm(vals[0],vals[1],vals[2],vals[3]);
 return Number.isFinite(d)?d:null;
}
function planStartPoint(){
 const m=mapPlanMetrics();
 return m?.valid?m.startP:null;
}
function distanceToTourStartKm(){
 const u=normalizeCoord(userPosition);
 if(!u)return null;
 const s=planStartPoint();
 if(!s)return null;
 const slat=finiteNumber(s.lat ?? s[0]);
 const slon=finiteNumber(s.lon ?? s.lng ?? s[1]);
 if(slat==null || slon==null)return null;
 return safeDistanceKm(u.lat,u.lon,slat,slon);
}
function hasValidGpsPosition(){
 return normalizeCoord(userPosition)!=null;
}
function resolveNavigationMode(force=false){
 if(!navigationSession.active){
   navigationModeState={
     mode:'idle',
     distanceToStartKm:null,
     lastStableAt:Date.now(),
     lastGpsAt:navigationModeState?.lastGpsAt||0
   };
   return navigationModeState;
 }

 if(!hasValidGpsPosition()){
   navigationModeState={
     mode:'gps_pending',
     distanceToStartKm:null,
     lastStableAt:navigationModeState?.lastStableAt||0,
     lastGpsAt:navigationModeState?.lastGpsAt||0
   };
   return navigationModeState;
 }

 const d=distanceToTourStartKm();
 if(d==null){
   navigationModeState={
     mode:'gps_pending',
     distanceToStartKm:null,
     lastStableAt:navigationModeState?.lastStableAt||0,
     lastGpsAt:Date.now()
   };
   return navigationModeState;
 }

 const nextMode=d>=1.5?'arrival':'live';

 if(
   force ||
   navigationModeState.mode===nextMode ||
   navigationModeState.mode==='idle' ||
   navigationModeState.mode==='gps_pending'
 ){
   navigationModeState={
     mode:nextMode,
     distanceToStartKm:d,
     lastStableAt:Date.now(),
     lastGpsAt:Date.now()
   };
   return navigationModeState;
 }

 if(Date.now()-(navigationModeState.lastStableAt||0)>=1200){
   navigationModeState={
     mode:nextMode,
     distanceToStartKm:d,
     lastStableAt:Date.now(),
     lastGpsAt:Date.now()
   };
 }
 return navigationModeState;
}
function navMode(){
 return resolveNavigationMode().mode;
}
function navLiveMode(){
 return navigationSession.active && navMode()==='live';
}
function navArrivalMode(){
 return navigationSession.active && navMode()==='arrival';
}
function navGpsPending(){
 return navigationSession.active && navMode()==='gps_pending';
}
function navigationStateHtml(){
 const s=resolveNavigationMode();

 if(s.mode==='gps_pending'){
   return `<div class="navStateCard">
     <div class="navStateHead">
       <div><b>📡 GPS-Position wird bestimmt</b><small>Die Navigation wartet auf eine eindeutige Position und den Tourstart.</small></div>
       <span class="navStateBadge">Warten</span>
     </div>
     <div class="navStateGrid">
       <div><b>—</b><small>Entfernung zum Start</small></div>
       <div><b>—</b><small>Tourfortschritt</small></div>
     </div>
   </div>`;
 }

 if(s.mode==='arrival'){
   return `<div class="arrivalModeCard">
     <div class="arrivalModeHead">
       <div><b>🚗 Anreise zur Tour</b><small>Du bist noch nicht im Startbereich der geplanten Tour.</small></div>
       <span class="arrivalModeBadge">Vor-Tour</span>
     </div>
     <div class="arrivalModeGrid">
       <div><b>${s.distanceToStartKm.toFixed(1)} km</b><small>Luftlinie zum Tourstart</small></div>
       <div><b>—</b><small>Tourfortschritt</small></div>
     </div>
     <div class="arrivalModeHint">Reststrecke, Zielzeit und Routenabweichung werden erst im Startbereich aktiviert.</div>
     <button class="arrivalAction" onclick="openRouteToStart()">🚗 Route zum Tourstart öffnen</button>
   </div>`;
 }

 return '';
}
function arrivalModeActive(){return navArrivalMode();}
function arrivalModeHtml(){return navigationStateHtml();}

function updateProgress(){
 if(!userPosition || route.length<2){
   $('#progressBox').classList.add('hidden');
   return;
 }
 if(navigationSession.active && !navLiveMode()){
   $('#progressBox').classList.add('hidden');
   return;
 }
 const u=robustNearestOnRoute(userPosition);
 const total=Number(routeCum.at(-1));
 if(!Number.isFinite(u?.along) || !Number.isFinite(total) || total<=0){
   $('#progressBox').classList.add('hidden');
   return;
 }
 const along=Math.max(0,Math.min(total,u.along));
 const pct=Math.max(0,Math.min(100,(along/total)*100));
 $('#progressBox').classList.remove('hidden');
 $('#progressPct').textContent=pct.toFixed(0)+'%';
 $('#progressBar').style.width=pct+'%';
 $('#progressText').textContent=`${along.toFixed(1)} km geschafft · ${(total-along).toFixed(1)} km verbleiben`;
}




function haversineKm(a,b,c,d){
 let lat1,lon1,lat2,lon2;
 if(Array.isArray(a) && Array.isArray(b)){
   lat1=Number(a[0]); lon1=Number(a[1]);
   lat2=Number(b[0]); lon2=Number(b[1]);
 }else{
   lat1=Number(a); lon1=Number(b);
   lat2=Number(c); lon2=Number(d);
 }
 if(![lat1,lon1,lat2,lon2].every(Number.isFinite))return NaN;
 const R=6371,toRad=x=>x*Math.PI/180;
 const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
 const q=Math.sin(dLat/2)**2+
   Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(q)));
}

function projectToSegmentKm(p,a,b){
 // Local equirectangular projection is stable for trekking-scale segments.
 const R=6371;
 const lat0=((a[0]+b[0]+p[0])/3)*Math.PI/180;
 const xy=q=>[
   R*(q[1]-a[1])*Math.PI/180*Math.cos(lat0),
   R*(q[0]-a[0])*Math.PI/180
 ];
 const A=[0,0], B=xy(b), P=xy(p);
 const vx=B[0], vy=B[1], wx=P[0], wy=P[1];
 const vv=vx*vx+vy*vy;
 let t=vv?((wx*vx+wy*vy)/vv):0;
 t=Math.max(0,Math.min(1,t));
 const q=[A[0]+t*vx,A[1]+t*vy];
 const dx=P[0]-q[0],dy=P[1]-q[1];
 return {off:Math.sqrt(dx*dx+dy*dy),t};
}

function robustNearestOnRoute(p){
 const np=normalizeCoord(p);
 if(!np || !route || route.length<2)return {off:Infinity,along:0,index:0,t:0};
 const point=[np.lat,np.lon];
 let best={off:Infinity,along:0,index:0,t:0};
 for(let i=0;i<route.length-1;i++){
   const a=route[i],b=route[i+1];
   if(!Array.isArray(a)||!Array.isArray(b))continue;
   const r=projectToSegmentKm(point,a,b);
   if(!Number.isFinite(r?.off) || !Number.isFinite(r?.t))continue;
   if(r.off<best.off){
     const seg=haversineKm(a,b);
     if(!Number.isFinite(seg))continue;
     best={off:r.off,along:(routeCum[i]||0)+(seg*r.t),index:i,t:r.t};
   }
 }
 return best;
}

function routeDistanceFromUser(){
 if(!userPosition||route.length<2)return null;
 return robustNearestOnRoute(userPosition);
}

function nextRelevantPoi(){
 if(navigationSession.active && !navLiveMode())return null;
 if(!userPosition||!allPois.length)return null;
 const u=robustNearestOnRoute(userPosition);
 if(!Number.isFinite(u.off)||u.off>2)return null;
 const candidates=allPois
   .filter(p=>p.direction!=='behind')
   .map(p=>({...p,aheadKm:Math.max(0,p.along-u.along)}))
   .filter(p=>p.aheadKm<=NAV_PREFS.importantWithinKm)
   .sort((a,b)=>{
      const ap=(a.type==='emergency'?5:a.type==='drinking_water'?4:a.type==='camp'?3:a.type==='shelter'?2:1);
      const bp=(b.type==='emergency'?5:b.type==='drinking_water'?4:b.type==='camp'?3:b.type==='shelter'?2:1);
      const as=a.aheadKm+(a.off*1.8)-(ap*.35);
      const bs=b.aheadKm+(b.off*1.8)-(bp*.35);
      return as-bs;
   });
 return candidates[0]||null;
}

function buildSmartAlert(){
 if(navigationSession.active && !navLiveMode())return null;
 if(!userPosition||!allPois.length)return null;
 const u=robustNearestOnRoute(userPosition);
 if(!Number.isFinite(u.off))return null;
 const ahead=allPois.map(p=>({...p,aheadKm:p.along-u.along}))
   .filter(p=>p.aheadKm>=0);

 const emergency=ahead.filter(p=>p.type==='emergency').sort((a,b)=>a.aheadKm-b.aheadKm)[0];
 const water=ahead.filter(p=>p.type==='drinking_water').sort((a,b)=>a.aheadKm-b.aheadKm)[0];
 const sleep=ahead.filter(p=>p.type==='camp').sort((a,b)=>a.aheadKm-b.aheadKm)[0];

 const offM=Math.round(u.off*1000);
 if(offM>NAV_PREFS.offRouteWarnM){
   const d=offM>=1000 ? `${(offM/1000).toFixed(1)} km` : `${offM} m`;
   return {icon:'↩',title:'Route verlassen',text:`Du bist etwa ${d} von der geplanten Route entfernt.`};
 }
 const hz=hazardsAhead().find(h=>h.level>=2&&h.aheadKm<=8);
 if(hz){return {icon:'⚠',title:hz.level>=3?'Wettergefahr voraus':'Wetterhinweis voraus',text:`${hz.types.join(', ')} in etwa ${hz.aheadKm<1?Math.round(hz.aheadKm*1000)+' m':hz.aheadKm.toFixed(1)+' km'} – voraussichtlich gegen ${formatEta(new Date(hz.eta))}.`};}

 if(emergency && emergency.aheadKm<1.0){
   return {icon:'✚',title:'Rettungspunkt in der Nähe',text:`${emergency.name} liegt etwa ${emergency.aheadKm.toFixed(1)} km voraus.`};
 }
 if(!water || water.aheadKm>NAV_PREFS.waterWarnKm){
   return {icon:'💧',title:'Wasser voraus prüfen',text:water?`Nächstes bestätigtes Trinkwasser erst in ${water.aheadKm.toFixed(1)} km.`:'Kein bestätigtes Trinkwasser in den gespeicherten Punkten voraus.'};
 }
 if(sleep && sleep.aheadKm<NAV_PREFS.sleepWarnKm){
   return {icon:'⛺',title:'Schlafplatz voraus',text:`${sleep.name} liegt etwa ${sleep.aheadKm.toFixed(1)} km voraus (+${(sleep.off*2).toFixed(1)} km Umweg).`};
 }
 return null;
}

function updateNavigationStatus(){
 if(!userPosition||route.length<2){
   $('#navStatus').classList.add('hidden');
   $('#alertBox').classList.add('hidden');
   return;
 }
 if(navigationSession.active && !navLiveMode()){
   $('#navStatus').classList.add('hidden');
   $('#alertBox').classList.add('hidden');
   return;
 }
 const u=routeDistanceFromUser();
 if(!u || !Number.isFinite(u.off)){
   $('#navStatus').classList.add('hidden');
   $('#alertBox').classList.add('hidden');
   return;
 }
 const offM=Math.max(0,Math.round(u.off*1000));
 const offRoute=offM>NAV_PREFS.offRouteWarnM;
 const farFromRoute=offM>2000;

 $('#navStatus').classList.remove('hidden');
 $('#navStatus').classList.toggle('offroute',offRoute);
 $('#routeStateLabel').textContent=offRoute?'Route verlassen':'Auf Route';
 $('#routeStateMeta').innerHTML=`<span class="liveDot ${offRoute?'off':''}"></span>GPS live${lastGpsAccuracy?` · Genauigkeit ±${Math.round(lastGpsAccuracy)} m`:''}`;
 $('#routeDeviation').textContent=offM>=1000?(offM/1000).toFixed(1)+' km':offM+' m';

 const n=farFromRoute?null:nextRelevantPoi();
 if(n){
   const aheadKm=Math.max(0,n.along-u.along);
   const meta=TYPE[n.type]?.label||'POI';
   $('#nextPointIcon').textContent=TYPE[n.type]?.icon||'↗';
   $('#nextPointName').textContent=n.name;
   $('#nextPointMeta').textContent=`${meta} · ${Math.round(n.off*1000)} m von der Route`;
   $('#nextPointDistance').textContent=aheadKm<1?Math.round(aheadKm*1000)+' m':aheadKm.toFixed(1)+' km';
 }else{
   $('#nextPointIcon').textContent='↗';
   $('#nextPointName').textContent=farFromRoute?'Zur Route zurückkehren':'Kein wichtiger Punkt voraus';
   $('#nextPointMeta').textContent=farFromRoute?'POI-Entfernungen werden wieder angezeigt, sobald du näher an der Route bist.':'Für diese Route sind keine passenden Offline-POIs gespeichert.';
   $('#nextPointDistance').textContent='—';
 }
 const alert=buildSmartAlert();
 if(alert){
   $('#alertBox').classList.remove('hidden');
   $('#alertIcon').textContent=alert.icon;
   $('#alertTitle').textContent=alert.title;
   $('#alertText').textContent=alert.text;
 }else{
   $('#alertBox').classList.add('hidden');
 }
}

function bearingDeg(a,b){
 const p1=a[0]*Math.PI/180,p2=b[0]*Math.PI/180;
 const dl=(b[1]-a[1])*Math.PI/180;
 const y=Math.sin(dl)*Math.cos(p2);
 const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
 return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function angleDiff(a,b){
 let d=(b-a+540)%360-180;
 return d;
}
function updateTurnInstruction(){
 // V3.6.0: Abbiegehinweise nur bei einer wirklich aktiven Live-Tour anzeigen.
 // Im Leerlauf, während GPS noch bestimmt wird und im Vor-Tour-/Anreisemodus bleibt die Karte frei.
 if(!navLiveMode()){$('#turnCard').classList.add('hidden');return;}
 if(!userPosition||route.length<3){
   $('#turnCard').classList.add('hidden'); return;
 }
 const u=robustNearestOnRoute(userPosition);
 if(!u || u.off>2){
   $('#turnCard').classList.add('hidden'); return;
 }
 let i=Math.min(route.length-3,Math.max(0,u.index));
 let found=null;
 for(let j=i;j<Math.min(route.length-2,i+80);j++){
   const b1=bearingDeg(route[j],route[j+1]);
   const b2=bearingDeg(route[j+1],route[j+2]);
   const d=angleDiff(b1,b2);
   const dist=(routeCum[j+1]||0)-u.along;
   if(dist<0)continue;
   if(Math.abs(d)>=35){
     found={dist,d};break;
   }
 }
 $('#turnCard').classList.remove('hidden');
 if(!found){
   $('#turnIcon').textContent='↑';
   $('#turnText').textContent='Route weiter folgen';
   $('#turnDistance').textContent='—';
   return;
 }
 const right=found.d>0;
 $('#turnIcon').textContent=right?'↱':'↰';
 $('#turnText').textContent=right?'Rechts halten':'Links halten';
 $('#turnDistance').textContent=found.dist<1?Math.round(found.dist*1000)+' m':found.dist.toFixed(1)+' km';
}

async function refreshWarnings(){
 const ref=userPosition || (route.length?route[Math.floor(route.length/2)]:null);
 if(!ref)return;
 $('#warningBtn').textContent='⚠ …';
 liveWarnings=[]; weatherSnapshot=null; weatherForecast=null; fireDanger=null;

 await resolveRouteGeoContext();

 await Promise.allSettled([
   loadWeatherSnapshot(ref[0],ref[1]),
   loadDwdWarnings(ref[0],ref[1]),
   loadFireDanger(ref[0],ref[1]),
   loadRegionalFireRisk(),
   loadRouteHazards(),
   loadRouteStageForecast(),
   loadStageWeather().then(x=>window.__stageWeather=x)
 ]);

 liveWarnings=filterWarningsForRoute(liveWarnings);
 liveWarnings.sort((a,b)=>(b.level||0)-(a.level||0));

 const count=liveWarnings.filter(w=>!w.error).length + (regionalFireRisk&&regionalFireRisk.level>=3?1:0) + routeHazards.filter(h=>h.level>=2).length;
 $('#warningBtn').textContent='⚠ '+count;
 $('#warningBtn').classList.toggle('active',count>0);
}

function routeSamplePoints(){
 if(!route?.length)return [];
 const idxs=[0,Math.floor(route.length*.5),route.length-1];
 return idxs.map(i=>route[Math.max(0,Math.min(route.length-1,i))]);
}
function norm(s){
 return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9äöüß ]+/g,' ').replace(/\s+/g,' ').trim();
}
function usefulPlaceTokens(address){
 const vals=[
   address.county,
   address.city,
   address.town,
   address.village,
   address.municipality,
   address.city_district,
   address.suburb
 ].filter(Boolean);

 const out=[];
 vals.forEach(v=>{
   const n=norm(v);
   const clean=n.replace(/^(landkreis|kreis|stadt|gemeinde|verbandsgemeinde|hansestadt|kreisfreie stadt)\s+/,'');
   if(n.length>=4)out.push(n);
   if(clean.length>=4)out.push(clean);
 });

 return [...new Set(out)];
}
async function reverseGeocodePoint(lat,lon){
 const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=10&addressdetails=1`;
 const r=await fetch(url,{headers:{'Accept':'application/json'}});
 if(!r.ok)throw Error('Reverse-Geocoding HTTP '+r.status);
 return await r.json();
}
async function resolveRouteGeoContext(){
 if(routeGeoContext.resolved)return routeGeoContext;
 const names=new Set(); let firstAddress=null;
 try{
   for(const p of routeSamplePoints()){
     try{
       const g=await reverseGeocodePoint(p[0],p[1]),a=g.address||{};
       if(!firstAddress)firstAddress=a;
       usefulPlaceTokens(a).forEach(x=>names.add(x));
       await new Promise(res=>setTimeout(res,350));
     }catch(e){}
   }
   routeGeoContext={names:[...names],state:firstAddress?.state||'',county:firstAddress?.county||'',city:firstAddress?.city||firstAddress?.town||firstAddress?.village||'',resolved:true,error:names.size===0};
 }catch(e){
   routeGeoContext={names:[],state:'',county:'',city:'',resolved:true,error:true};
 }
 return routeGeoContext;
}
function stripAdminPrefix(s){
 return norm(s)
  .replace(/^(landkreis|kreis|stadt|gemeinde|verbandsgemeinde|hansestadt|kreisfreie stadt)\s+/,'')
  .replace(/\s+(landkreis|kreis)$/,'')
  .trim();
}

function routeAdminTokens(){
 const raw=[
   routeGeoContext.county,
   routeGeoContext.city,
   routeGeoContext.state
 ].filter(Boolean);

 const strong=[];
 raw.forEach(v=>{
   const n=norm(v);
   const stripped=stripAdminPrefix(v);
   if(n.length>=4)strong.push(n);
   if(stripped.length>=4)strong.push(stripped);
 });

 return [...new Set(strong)];
}

function warningRegionTokens(region){
 const n=norm(region);
 const pieces=n
   .split(/[-,;/|()]+/)
   .map(x=>stripAdminPrefix(x))
   .filter(x=>x.length>=4);

 // Also keep whole normalized region for exact containment against strong tokens.
 pieces.push(n);
 return [...new Set(pieces)];
}

function warningMatchesRoute(w){
 if(w.error)return true;

 const region = norm(w.region||'');
 if(!region)return false;

 const routeTokens = routeAdminTokens();
 if(!routeTokens.length)return false;

 const warningTokens = warningRegionTokens(w.region||'');

 // Strict rule 1:
 // exact administrative token match after removing "Kreis", "Landkreis", etc.
 const exact = warningTokens.some(wt =>
   routeTokens.some(rt => wt===rt)
 );
 if(exact)return true;

 // Strict rule 2:
 // allow containment only for long, specific names (>= 8 chars).
 // This prevents generic fragments such as "kreis", "stadt", "pfalz", "küste".
 const specificContainment = warningTokens.some(wt =>
   wt.length>=8 &&
   routeTokens.some(rt =>
     rt.length>=8 && (wt.includes(rt) || rt.includes(wt))
   )
 );
 if(specificContainment)return true;

 return false;
}
function isObviouslyDistantRegion(region){
 const r=norm(region);
 const state=norm(routeGeoContext.state||'');

 // Extra defensive guard for the current inland Rheinland-Pfalz test region.
 if(state.includes('rheinland pfalz')){
   const distant=[
     'wilhelmshaven','wittmund','rostock','vorpommern rugen','cuxhaven','aurich',
     'helgoland','plon','ostholstein','dithmarschen','nordfriesland','friesland',
     'kiel','flensburg','segeberg','steinburg','neumunster','stade'
   ];
   if(distant.some(x=>r.includes(x)))return true;
 }
 return false;
}

function filterWarningsForRoute(warnings){
 const arr=(warnings||[]).filter(Boolean);

 if(routeGeoContext.error || !routeAdminTokens().length){
   return arr.filter(w=>w.error);
 }

 return arr.filter(w=>{
   if(w.error)return true;
   if(isObviouslyDistantRegion(w.region||''))return false;
   return warningMatchesRoute(w);
 });
}


function hazardSampleIndexes(){
 if(!route?.length)return [];
 const count=Math.min(7,Math.max(3,Math.ceil((routeCum.at(-1)||1)/5)+1));
 const idxs=[];for(let i=0;i<count;i++)idxs.push(Math.round((route.length-1)*(i/(count-1))));
 return [...new Set(idxs)];
}
function hazardSeverity(x){
 let level=0,types=[];
 if(x.gust>=60||x.wind>=45){level=Math.max(level,3);types.push('Sturm/Böen')}
 else if(x.gust>=45||x.wind>=30){level=Math.max(level,2);types.push('starke Böen')}
 if(x.rainProb>=80&&x.rain>=4){level=Math.max(level,3);types.push('Starkregen')}
 else if(x.rainProb>=65&&x.rain>=2){level=Math.max(level,2);types.push('kräftiger Regen')}
 if([95,96,99].includes(Number(x.code))){level=Math.max(level,3);types.push('Gewitter')}
 else if([80,81,82].includes(Number(x.code))){level=Math.max(level,2);types.push('Schauer')}
 if(x.temp>=32){level=Math.max(level,2);types.push('Hitze')}
 if(x.temp<=2){level=Math.max(level,2);types.push('Kälte')}
 return {level,types:[...new Set(types)]};
}
function routeStartAlong(){
 if(!userPosition)return 0;
 const u=robustNearestOnRoute(userPosition);
 return Number.isFinite(u?.along)?Math.max(0,u.along):0;
}
function etaForAlong(alongKm){
 const start=plannedStartDate(),total=routeCum.at(-1)||0,speed=Math.max(1,Number(tourPlan.speed||hikingSpeedKmh||4));
 const walkH=Math.max(0,alongKm)/speed;
 const pauseH=total>0?Math.max(0,Number(tourPlan.pauseMinutes||0))/60*(Math.max(0,alongKm)/total):0;
 return new Date(start.getTime()+(walkH+pauseH)*3600000);
}
function formatEta(d){
 return d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
}
async function fetchPointHazard(lat,lon,alongKm){
 const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,rain,weather_code,wind_speed_10m,wind_gusts_10m&forecast_days=2&timezone=auto`;
 const r=await fetch(url);if(!r.ok)throw Error('Wetterpunkt HTTP '+r.status);
 const d=await r.json(),h=d.hourly||{},times=h.time||[];
 const eta=etaForAlong(alongKm);
 let idx=0,best=Infinity;
 times.forEach((t,i)=>{
   const diff=Math.abs(new Date(t).getTime()-eta.getTime());
   if(diff<best){best=diff;idx=i}
 });
 const x={
   temp:Number(h.temperature_2m?.[idx]||0),
   rainProb:Number(h.precipitation_probability?.[idx]||0),
   rain:Number(h.rain?.[idx]||0),
   code:Number(h.weather_code?.[idx]||0),
   wind:Number(h.wind_speed_10m?.[idx]||0),
   gust:Number(h.wind_gusts_10m?.[idx]||0)
 };
 return {lat,lon,alongKm,eta:eta.toISOString(),forecastTime:times[idx]||'',...x,...hazardSeverity(x)};
}
async function loadRouteHazards(){
 routeHazards=[];clearHazardLayers();if(!route?.length)return;
 for(const idx of hazardSampleIndexes()){
   const p=route[idx];
   try{routeHazards.push(await fetchPointHazard(p[0],p[1],routeCum[idx]||0));await new Promise(r=>setTimeout(r,120))}catch(e){}
 }
 routeHazards=routeHazards.filter(h=>h.level>0).sort((a,b)=>a.alongKm-b.alongKm);
}
function clearHazardLayers(){hazardLayers.forEach(l=>{try{map.removeLayer(l)}catch(e){}});hazardLayers=[]}
function drawHazardLayers(){
 clearHazardLayers();
 routeHazards.forEach(h=>{
   const c=L.circle([h.lat,h.lon],{radius:h.level>=3?700:450,color:h.level>=3?'#b33a32':'#a27a27',weight:2,fillOpacity:.16}).addTo(map);
   c.bindPopup(`<b>⚠ ${escapeHtml(h.types.join(', '))}</b><br>bei km ${h.alongKm.toFixed(1)}`);hazardLayers.push(c)
 })
}
function toggleHazardLayers(){const active=$('#hazardLayerBtn').classList.toggle('active');if(active)drawHazardLayers();else clearHazardLayers()}
function userAlongKm(){if(!userPosition)return 0;const u=robustNearestOnRoute(userPosition);return Number.isFinite(u?.along)?u.along:0}
function hazardsAhead(){const ua=userAlongKm();return routeHazards.map(h=>({...h,aheadKm:h.alongKm-ua})).filter(h=>h.aheadKm>=0).sort((a,b)=>a.aheadKm-b.aheadKm)}
async function loadWeatherSnapshot(lat,lon){
 try{
   const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m&forecast_days=2&timezone=auto`;
   const r=await fetch(url); if(!r.ok)throw Error('Wetter HTTP '+r.status);
   const d=await r.json(); weatherSnapshot=d.current||null; weatherForecast=d.hourly||null;
 }catch(e){weatherSnapshot={error:true};weatherForecast=null}
}

async function loadDwdWarnings(lat,lon){
 try{
   // DWD publishes warnings.json as JSONP, not plain JSON.
   // Fetch as text, strip warnWetter.loadWarnings(...) wrapper, then parse.
   const urls=[
     'https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json',
     'https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json?'+Date.now()
   ];
   let txt=null,lastErr=null;
   for(const url of urls){
     try{
       const r=await fetch(url,{cache:'no-store'});
       if(!r.ok)throw Error('DWD HTTP '+r.status);
       txt=await r.text(); if(txt)break;
     }catch(e){lastErr=e}
   }
   if(!txt)throw lastErr||Error('Keine DWD-Daten');
   const start=txt.indexOf('('), end=txt.lastIndexOf(')');
   if(start<0||end<=start)throw Error('Unerwartetes DWD-JSONP');
   const d=JSON.parse(txt.slice(start+1,end).trim());
   const all=[];
   Object.values(d.warnings||{}).forEach(arr=>(arr||[]).forEach(w=>all.push(w)));
   const now=Date.now();
   liveWarnings=all.filter(w=>(w.end||0)>now).slice(0,300).map(w=>({
      title:w.event||w.headline||'DWD-Warnung',
      text:w.description||w.instruction||'Aktuelle Warnung des Deutschen Wetterdienstes.',
      level:w.level||1,start:w.start,end:w.end,region:w.regionName||'',warnCellId:w.warnCellId||''
   }));
 }catch(e){
   liveWarnings=[{title:'DWD-Warnungen nicht geladen',text:'Die DWD-Abfrage war nicht erreichbar. Wetterdaten funktionieren unabhängig davon weiter.',level:0,error:true}];
 }
}




function normStateName(s){
 return String(s||'').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9]+/g,' ').trim();
}

function routeWbiSamples(){
 if(!route?.length)return userPosition?[userPosition]:[];
 const idxs=[
   0,
   Math.floor(route.length*0.25),
   Math.floor(route.length*0.5),
   Math.floor(route.length*0.75),
   route.length-1
 ];
 const out=[],seen=new Set();
 for(const i of idxs){
   const p=route[Math.max(0,Math.min(route.length-1,i))];
   const k=p[0].toFixed(4)+','+p[1].toFixed(4);
   if(!seen.has(k)){seen.add(k);out.push(p)}
 }
 return out;
}

function minDistanceToRouteSamples(station,samples){
 let best=Infinity;
 for(const p of samples){
   const d=haversineKm(p[0],p[1],Number(station.geoBreite),Number(station.geoLaenge));
   if(d<best)best=d;
 }
 return best;
}

function wbiLabel(level){
 return ({1:'sehr gering',2:'gering',3:'mittel',4:'hoch',5:'sehr hoch'})[level]||'unbekannt';
}
function wbiAdvice(level){
 if(level<=1)return 'Normale Vorsicht. Offenes Feuer und Kochen trotzdem nur dort, wo es örtlich erlaubt ist.';
 if(level===2)return 'Erhöhte Aufmerksamkeit. Funkenflug vermeiden und örtliche Feuerregeln prüfen.';
 if(level===3)return 'Deutlich vorsichtiger sein. Auf Feuer möglichst verzichten und lokale Verbote unbedingt prüfen.';
 if(level===4)return 'Hohe Waldbrandgefahr. Kein offenes Feuer; auch bei Kochern besonders vorsichtig sein und lokale Verbote beachten.';
 if(level>=5)return 'Sehr hohe Waldbrandgefahr. Auf Feuer und hitzeerzeugende Aktivitäten im Wald verzichten; amtliche örtliche Vorgaben beachten.';
 return 'Örtliche Regeln und Hinweise der Forst- und Gefahrenabwehrbehörden prüfen.';
}

async function loadFireDanger(lat,lon){
 const endpoint='https://services2.arcgis.com/7wuv6DH7DYhDuwvU/ArcGIS/rest/services/DWD/FeatureServer/3/query';

 try{
   const params=new URLSearchParams({
     where:'1=1',
     outFields:'Stations_ID,Stationsname,Bundesland,geoBreite,geoLaenge,wbi_tag,tag,aktualisierung_DWD,Letzte_Aktualisierung',
     returnGeometry:'false',
     f:'json'
   });

   const r=await fetch(endpoint+'?'+params.toString(),{cache:'no-store'});
   if(!r.ok)throw Error('WBI HTTP '+r.status);

   const d=await r.json();
   if(d.error)throw Error(d.error.message||'WBI-Abfrage fehlgeschlagen');

   let stations=(d.features||[])
     .map(x=>x.attributes||{})
     .filter(x=>
       Number.isFinite(Number(x.geoBreite)) &&
       Number.isFinite(Number(x.geoLaenge)) &&
       Number(x.wbi_tag)>=1 &&
       Number(x.wbi_tag)<=5
     );

   if(!stations.length)throw Error('Keine aktuellen WBI-Stationen');

   const samples=routeWbiSamples();
   const contextState=routeGeoContext?.state||'';
   const contextStateNorm=normStateName(contextState);

   stations.forEach(s=>{
     s.routeDistanceKm=minDistanceToRouteSamples(s,samples.length?samples:[[lat,lon]]);
     s.sameState=contextStateNorm &&
       normStateName(s.Bundesland).includes(contextStateNorm);
   });

   // Priority:
   // 1) same federal state and within 120 km of any route sample
   // 2) any station within 80 km of any route sample
   // 3) no local assignment rather than a far-away fake "local" station
   let candidates=stations
     .filter(s=>s.sameState && s.routeDistanceKm<=120)
     .sort((a,b)=>a.routeDistanceKm-b.routeDistanceKm);

   let selectionMode='Bundesland';
   if(!candidates.length){
     candidates=stations
       .filter(s=>s.routeDistanceKm<=80)
       .sort((a,b)=>a.routeDistanceKm-b.routeDistanceKm);
     selectionMode='Entfernung';
   }

   if(!candidates.length){
     const nearest=stations.slice().sort((a,b)=>a.routeDistanceKm-b.routeDistanceKm)[0];
     fireDanger={
       level:null,
       title:'Waldbrandgefahr',
       tendency:'keine lokale Zuordnung',
       text:`Keine ausreichend nahe DWD-WBI-Station für die Tour gefunden. Die nächstgelegene verfügbare Station wäre ${nearest?.Stationsname||'unbekannt'} in etwa ${nearest?.routeDistanceKm?.toFixed(1)||'?'} km Entfernung und wird deshalb nicht als lokale WBI-Stufe verwendet.`,
       source:'DWD WBI · lokale Zuordnung nicht ausreichend',
       official:true,
       localMatch:false,
       nearestRejected:nearest||null,
       sampleCount:samples.length
     };
     return;
   }

   // For long routes, inspect several route samples. Use the maximum WBI among
   // sufficiently close regional stations as a conservative tour-wide level.
   const nearby=candidates.filter(s=>s.routeDistanceKm<=80);
   const pool=nearby.length?nearby:candidates.slice(0,3);
   const maxLevel=Math.max(...pool.map(s=>Number(s.wbi_tag)));
   const representative=pool
     .filter(s=>Number(s.wbi_tag)===maxLevel)
     .sort((a,b)=>a.routeDistanceKm-b.routeDistanceKm)[0];

   const level=Math.max(1,Math.min(5,maxLevel));
   fireDanger={
     level,
     title:'Waldbrandgefahr',
     tendency:'Stufe '+level,
     label:wbiLabel(level),
     station:representative.Stationsname||'DWD-Station',
     distanceKm:representative.routeDistanceKm,
     date:representative.tag?new Date(representative.tag).toLocaleDateString('de-DE'):'',
     updated:representative.aktualisierung_DWD||representative.Letzte_Aktualisierung||'',
     advice:wbiAdvice(level),
     text:`Offizieller DWD-Waldbrandgefahrenindex für die Tourregion: Stufe ${level} von 5 (${wbiLabel(level)}). Herangezogen wurde ${representative.Stationsname||'eine DWD-Station'} in etwa ${representative.routeDistanceKm.toFixed(1)} km Entfernung zur Route.`,
     source:'DWD WBI · regional zugeordnet',
     official:true,
     localMatch:true,
     selectionMode,
     sampleCount:samples.length,
     candidateCount:pool.length,
     state:representative.Bundesland||contextState||''
   };
 }catch(e){
   fireDanger={
     level:null,
     title:'Waldbrandgefahr',
     tendency:'nicht geladen',
     text:'Die aktuelle regionale WBI-Stufe konnte nicht geladen werden. Es wird keine Ersatzstufe geschätzt.',
     source:'DWD WBI · Abruf fehlgeschlagen',
     official:false,
     error:true
   };
 }
}


function loadTourPlan(){
 try{const x=JSON.parse(localStorage.getItem('trek_sleep_plan_v20')||'null');if(x)return x}catch(e){}
 const d=new Date();d.setMinutes(Math.ceil(d.getMinutes()/5)*5,0,0);
 return {startTime:d.toISOString(),speed:4,pauseMinutes:20,pauseAtHalf:true};
}
function saveTourPlanLocal(){localStorage.setItem('trek_sleep_plan_v20',JSON.stringify(tourPlan))}
function plannedStartDate(){const d=new Date(tourPlan.startTime||Date.now());return isNaN(d)?new Date():d}
function planTimes(){
 const start=plannedStartDate();
 const m=mapPlanMetrics();
 if(m.valid){
   const speed=Math.max(1,Number(tourPlan.speed||4));
   const walkH=m.distance/speed;
   const pauseMin=stageTotalPause();
   const ordered=orderedPlanPoints();
   const midKm=m.startP.alongKm+m.distance/2;
   let elapsedKm=0,halfDate=new Date(start);
   for(let i=0;i<ordered.length-1;i++){
     const a=ordered[i],b=ordered[i+1];
     const seg=Math.max(0,(b.alongKm??0)-(a.alongKm??0));
     if((a.alongKm??0)<=midKm && (b.alongKm??0)>=midKm){
       const partial=Math.max(0,midKm-(a.alongKm??0));
       const priorPause=ordered.slice(1,i+1).filter(p=>p.type==='stop').reduce((sum,p)=>sum+Number(p.pauseMinutes||0),0);
       halfDate=new Date(start.getTime()+(Math.max(0,(a.alongKm??0)-m.startP.alongKm)+partial)/speed*3600000+priorPause*60000);
       break;
     }
   }
   const finish=new Date(start.getTime()+walkH*3600000+pauseMin*60000);
   return {start,half:halfDate,finish,totalH:walkH+pauseMin/60};
 }
 const pauseH=Math.max(0,Number(tourPlan.pauseMinutes||0))/60;
 const walkH=(routeCum.at(-1)||0)/Math.max(1,Number(tourPlan.speed||4));
 const half=new Date(start.getTime()+(walkH/2+(tourPlan.pauseAtHalf?pauseH/2:0))*3600000);
 const finish=new Date(start.getTime()+(walkH+pauseH)*3600000);
 return {start,half,finish,totalH:walkH+pauseH};
}
function formatDateTimeLocalInput(d){
 const p=n=>String(n).padStart(2,'0');
 return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function plannerTimelineHtml(){
 const t=planTimes(),fmt=d=>d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
 return `<div class="planTimeline">
  <div class="planStop"><div class="planStopIcon">🥾</div><div><b>Start</b><small>${t.start.toLocaleDateString('de-DE')}</small></div><strong>${fmt(t.start)}</strong></div>
  <div class="planStop"><div class="planStopIcon">🧭</div><div><b>Streckenmitte</b><small>${tourPlan.pauseAtHalf?'inkl. Pause':'ohne feste Pause'}</small></div><strong>${fmt(t.half)}</strong></div>
  <div class="planStop"><div class="planStopIcon">🏁</div><div><b>Ziel</b><small>geschätzte Ankunft</small></div><strong>${fmt(t.finish)}</strong></div>
 </div>`;
}

function loadMapPlan(){
 try{
   const v=JSON.parse(localStorage.getItem('trek_sleep_map_plan_v21')||localStorage.getItem('trek_sleep_map_plan_v22')||'null');
   if(v && Array.isArray(v.points)){
     v.points=v.points.map(p=>({...p,pauseMinutes:p.type==='stop'?Number(p.pauseMinutes??15):0}));
     return v;
   }
 }catch(e){}
 return {points:[]};
}
function saveMapPlan(){ localStorage.setItem('trek_sleep_map_plan_v22',JSON.stringify(mapPlan)); localStorage.setItem('trek_sleep_map_plan_v21',JSON.stringify(mapPlan)); }
function pointIcon(type){
 return type==='start'?'🥾':type==='finish'?'🏁':'⏸';
}
function pointLabel(type){
 return type==='start'?'Start':type==='finish'?'Ziel':'Zwischenstopp';
}
function clearMapPlanLayers(){
 mapPlanLayers.forEach(l=>{try{map.removeLayer(l)}catch(e){}});
 mapPlanLayers=[];
}
function drawMapPlan(){
 clearMapPlanLayers();
 if(!mapPlan?.points?.length)return;
 const latlngs=[];
 mapPlan.points.forEach((p,i)=>{
   const icon=L.divIcon({
     className:'',
     html:`<div class="planMarker ${p.type}">${pointIcon(p.type)}</div>`,
     iconSize:[30,30],iconAnchor:[15,15]
   });
   const m=L.marker([p.lat,p.lon],{icon}).addTo(map);
   m.bindPopup(`<b>${pointLabel(p.type)}</b><br>${i+1}. Planungspunkt`);
   mapPlanLayers.push(m);
   latlngs.push([p.lat,p.lon]);
 });
 if(latlngs.length>1){
   const line=L.polyline(latlngs,{color:'#8de239',weight:4,dashArray:'8 8',opacity:.9}).addTo(map);
   mapPlanLayers.push(line);
 }
}
function nearestRoutePoint(lat,lon){
 if(!route?.length)return {lat,lon,idx:null,alongKm:null};
 let best=null,dist=Infinity;
 route.forEach((p,i)=>{
   const d=haversineKm(lat,lon,p[0],p[1]);
   if(d<dist){dist=d;best={lat:p[0],lon:p[1],idx:i,alongKm:routeCum[i]||0,distanceKm:d}}
 });
 return best||{lat,lon,idx:null,alongKm:null};
}
function addPlanPoint(type,lat,lon){
 const p=nearestRoutePoint(lat,lon);
 if(type==='start')mapPlan.points=mapPlan.points.filter(x=>x.type!=='start');
 if(type==='finish')mapPlan.points=mapPlan.points.filter(x=>x.type!=='finish');
 mapPlan.points.push({type,lat:p.lat,lon:p.lon,alongKm:p.alongKm,idx:p.idx,pauseMinutes:type==='stop'?15:0,created:Date.now()});
 mapPlan.points.sort((a,b)=>(a.alongKm??999999)-(b.alongKm??999999));
 saveMapPlan();drawMapPlan();
 v30BuildTrailHints();renderMapTourStatus();
}
function mapPlanMetrics(){
 const pts=(mapPlan.points||[]).slice().sort((a,b)=>(finiteNumber(a.alongKm)??999999)-(finiteNumber(b.alongKm)??999999));
 const startP=pts.find(p=>p.type==='start');
 const finishP=pts.find(p=>p.type==='finish');
 const startCount=pts.filter(p=>p.type==='start').length;
 const finishCount=pts.filter(p=>p.type==='finish').length;
 const s=finiteNumber(startP?.alongKm),f=finiteNumber(finishP?.alongKm);
 const valid=startCount===1 && finishCount===1 && !!startP && !!finishP && s!=null && f!=null && f>s;
 const distance=valid ? f-s : 0;
 const active=valid ? pts.filter(p=>{
   const a=finiteNumber(p.alongKm);
   return a!=null && a>=s && a<=f;
 }) : pts;
 return {valid,distance,startP,finishP,startCount,finishCount,active};
}
function mapPlanValidationHtml(){
 const m=mapPlanMetrics();
 if(m.valid)return `<div class="mapPlanValid">✓ Vollständiger Tourplan · Start und Ziel erkannt</div>`;
 const missing=[];
 if(m.startCount!==1)missing.push('genau 1 Start');
 if(m.finishCount!==1)missing.push('genau 1 Ziel');
 if(m.startCount===1 && m.finishCount===1 && m.startP?.alongKm>=m.finishP?.alongKm)missing.push('Ziel muss hinter dem Start liegen');
 return `<div class="mapPlanInvalid">⚠ Für einen vollständigen Plan fehlt: ${missing.join(' · ')}</div>`;
}
function mapPlanListHtml(){
 const pts=(mapPlan.points||[]).slice().sort((a,b)=>(a.alongKm??999999)-(b.alongKm??999999));
 if(!pts.length)return '<div class="mapPlanInfo">Noch keine Planungspunkte. Setze zuerst einen Start, danach optional Stopps und zuletzt ein Ziel.</div>';
 return `<div class="mapPlanList">${pts.map((p,i)=>{
   const originalIndex=mapPlan.points.indexOf(p);
   return `<div class="mapPlanItem ${p.type}">
    <div class="mapPlanItemIcon">${pointIcon(p.type)}</div>
    <div>
      <b>${pointLabel(p.type)}</b>
      <small>${p.alongKm!=null?'GPX km '+p.alongKm.toFixed(1):'frei gesetzt'}${p.type==='stop'?' · Pause':''}</small>
      ${p.type==='stop'?`<div class="stopPauseRow"><span>Pausendauer</span><select data-stop-pause="${originalIndex}">
        ${[0,5,10,15,20,30,45,60].map(v=>`<option value="${v}" ${Number(p.pauseMinutes||0)===v?'selected':''}>${v} Min.</option>`).join('')}
      </select></div>`:''}
    </div>
    <button data-del-plan="${originalIndex}">✕</button>
   </div>`;
 }).join('')}</div>`;
}
function openMapPlanner(){
 $('#modalBody').innerHTML=`<span class="tag">📍 Kartenplanung · V3.6.0</span>
 <h2>Start, Stopps und Ziel</h2>
 <div class="mapPlanInfo">Wähle unten einen Punkttyp, schließe das Fenster und tippe auf die Karte. Der Punkt rastet auf die vorhandene GPX-Route ein.</div>
 <div class="mapPlanToolbar">
  <button data-mapmode="start">🥾 Start</button>
  <button data-mapmode="stop">⏸ Stopp</button>
  <button data-mapmode="finish">🏁 Ziel</button>
  <button id="clearMapPlan">🗑 Leeren</button>
 </div>
 ${mapPlanListHtml()}
 ${mapPlanValidationHtml()}
 <div class="mapPlanSummary"><b>${mapPlan.points.length} Planungspunkte</b><small>${mapPlanMetrics().valid ? mapPlanMetrics().distance.toFixed(1)+' km · '+stageTotalPause()+' Min. Stopppausen' : 'Setze Start und Ziel, um die tatsächliche GPX-Tourdistanz zu berechnen.'}</small></div>
 <button id="saveMapPlanBtn" class="mapPlanSave" ${mapPlanMetrics().valid?'':'disabled'}>Plan auf Karte übernehmen</button>`;
 $('#modal').classList.remove('hidden');

 $$('[data-mapmode]').forEach(b=>b.onclick=()=>{
   mapPlanMode=b.dataset.mapmode;
   $('#modal').classList.add('hidden');
   $('#mapPlanBtn').textContent=`📍 ${pointLabel(mapPlanMode)} setzen`;
   $('#mapPlanBtn').classList.add('active');
 });
 $$('[data-del-plan]').forEach(b=>b.onclick=()=>{
   mapPlan.points.splice(Number(b.dataset.delPlan),1);saveMapPlan();drawMapPlan();renderMapTourStatus();openMapPlanner();
 });
 $$('[data-stop-pause]').forEach(sel=>sel.onchange=()=>{
   const idx=Number(sel.dataset.stopPause);
   if(mapPlan.points[idx])mapPlan.points[idx].pauseMinutes=Number(sel.value||0);
   saveMapPlan();openMapPlanner();
 });
 $('#clearMapPlan').onclick=()=>{
   mapPlan={points:[]};saveMapPlan();drawMapPlan();renderMapTourStatus();openMapPlanner();
 };
 $('#saveMapPlanBtn').onclick=async()=>{
   const metrics=mapPlanMetrics();
   if(!metrics.valid)return;
   mapPlan.points.sort((a,b)=>(a.alongKm??999999)-(b.alongKm??999999));
   saveMapPlan();drawMapPlan();renderMapTourStatus();
   $('#mapPlanBtn').textContent='📍 Route geplant';
   $('#mapPlanBtn').classList.remove('active');
   navigationSession={active:false,startedAt:null};
 navigationModeState={mode:'idle',distanceToStartKm:null,lastStableAt:Date.now(),lastGpsAt:navigationModeState.lastGpsAt||0};saveNavigationSession();setNavigationButton();
   $('#modal').classList.add('hidden');
   await refreshWarnings();
 };
}
function mapPlanStageTimes(){
 const m=mapPlanMetrics();
 if(!m.valid)return null;
 const pauseH=Math.max(0,Number(tourPlan.pauseMinutes||0))/60;
 const walkH=m.distance/Math.max(1,Number(tourPlan.speed||4));
 const startDate=plannedStartDate();
 return {start:startDate,finish:new Date(startDate.getTime()+(walkH+pauseH)*3600000),distance:m.distance,walkH,pauseH};
}


function orderedPlanPoints(){
 const m=mapPlanMetrics();
 if(!m.valid)return [];
 return (mapPlan.points||[])
   .filter(p=>(p.alongKm??-1)>=m.startP.alongKm && (p.alongKm??1e9)<=m.finishP.alongKm)
   .sort((a,b)=>(a.alongKm??999999)-(b.alongKm??999999));
}
function plannedStageData(){
 const pts=orderedPlanPoints();
 if(pts.length<2)return [];
 const speed=Math.max(1,Number(tourPlan.speed||4));
 const startDate=plannedStartDate();
 let cursor=new Date(startDate),out=[];
 for(let i=0;i<pts.length-1;i++){
   const from=pts[i],to=pts[i+1];
   const distance=Math.max(0,(to.alongKm??0)-(from.alongKm??0));
   const walkH=distance/speed;
   const depart=new Date(cursor);
   const arrive=new Date(cursor.getTime()+walkH*3600000);
   out.push({
     index:i+1,from,to,distance,depart:depart.toISOString(),arrive:arrive.toISOString(),
     pauseAfter:to.type==='stop'?Number(to.pauseMinutes||0):0
   });
   cursor=new Date(arrive.getTime()+(to.type==='stop'?Number(to.pauseMinutes||0):0)*60000);
 }
 return out;
}
function stageTotalPause(){
 return orderedPlanPoints().filter(p=>p.type==='stop').reduce((a,p)=>a+Number(p.pauseMinutes||0),0);
}
function stagePlanFinish(){
 const stages=plannedStageData();
 if(!stages.length)return null;
 const last=stages[stages.length-1];
 return new Date(last.arrive);
}
async function loadStageWeather(){
 const stages=plannedStageData();
 for(const s of stages){
   try{
     const f=await fetchForecastAt(s.to.lat,s.to.lon,new Date(s.arrive));
     s.weather=f;
   }catch(e){s.weather=null}
 }
 return stages;
}

function formatDurationMinutes(mins){
 mins=Math.max(0,Math.round(mins));
 const h=Math.floor(mins/60),m=mins%60;
 return h?`${h} Std. ${m} Min.`:`${m} Min.`;
}
function currentPlanAlongKm(){
 if(!navLiveMode() || !route?.length)return null;
 const uPos=normalizeCoord(userPosition);
 if(!uPos)return null;
 const u=robustNearestOnRoute([uPos.lat,uPos.lon]);
 const along=finiteNumber(u?.along);
 const off=finiteNumber(u?.off);
 if(along==null || off==null || off>2)return null;
 return Math.max(0,along);
}
function actualSpeedEstimate(){
 // Use configured walking speed as stable fallback.
 // If GPS speed exists and is plausible for walking, blend it in.
 let configured=Math.max(1,Number(tourPlan.speed||hikingSpeedKmh||4));
 const gpsKmh=Number(userPosition?.speed||0)*3.6;
 if(gpsKmh>=1.5 && gpsKmh<=8){
   return configured*0.4+gpsKmh*0.6;
 }
 return configured;
}
function liveStageMetrics(){
 const stages=plannedStageData();
 if(!stages.length)return null;
 const along=currentPlanAlongKm();
 const ordered=orderedPlanPoints();
 const m=mapPlanMetrics();
 const speed=actualSpeedEstimate();

 if(along==null){
   const first=stages[0];
   return {
     activeIndex:0,
     active:first,
     along:null,
     speed,
     remainingStageKm:first.distance,
     remainingTourKm:m.valid?m.distance:0,
     etaStage:new Date(first.arrive),
     etaFinish:stagePlanFinish(),
     progressPct:0,
     beforeStart:true
   };
 }

 const startKm=m.startP?.alongKm??0;
 const finishKm=m.finishP?.alongKm??startKm;
 const clamped=Math.max(startKm,Math.min(finishKm,along));

 let activeIndex=stages.length-1;
 for(let i=0;i<stages.length;i++){
   if(clamped <= (stages[i].to.alongKm??finishKm)+0.03){
     activeIndex=i; break;
   }
 }
 const active=stages[activeIndex];
 const stageStart=active.from.alongKm??startKm;
 const stageEnd=active.to.alongKm??stageStart;
 const stageLen=Math.max(0.001,stageEnd-stageStart);
 const progressed=Math.max(0,Math.min(stageLen,clamped-stageStart));
 const remainingStageKm=Math.max(0,stageLen-progressed);
 const trackedRemaining=navigationSession.active?remainingDistanceFromTracking():null;
 const remainingTourKm=trackedRemaining!=null?trackedRemaining:Math.max(0,finishKm-clamped);
 const progressPct=Math.max(0,Math.min(100,(progressed/stageLen)*100));

 // ETA from current position using current/fallback speed + future planned stop pauses.
 let now=new Date();
 let etaStage=new Date(now.getTime()+(remainingStageKm/speed)*3600000);
 let remainingPause=0;
 for(let i=activeIndex;i<stages.length-1;i++){
   const stop=stages[i].to;
   if(stop?.type==='stop')remainingPause+=Number(stop.pauseMinutes||0);
 }
 let etaFinish=new Date(now.getTime()+(remainingTourKm/speed)*3600000+remainingPause*60000);

 return {
   activeIndex,active,along:clamped,speed,remainingStageKm,remainingTourKm,
   etaStage,etaFinish,progressPct,beforeStart:false
 };
}


function distanceMeters(aLat,aLon,bLat,bLon){
 return haversineKm(aLat,aLon,bLat,bLon)*1000;
}

function loadNavigationSession(){
 try{return JSON.parse(localStorage.getItem('trek_sleep_nav_session_v241')||'null')||{active:false,startedAt:null}}
 catch(e){return {active:false,startedAt:null}}
}
function saveNavigationSession(){localStorage.setItem('trek_sleep_nav_session_v241',JSON.stringify(navigationSession))}
function setNavigationButton(){
 const b=$('#navStartBtn'); if(!b)return;
 if(navigationSession.active){
   b.textContent='■ Tour beenden';
   b.classList.add('activeNav','stopNav');
 }else{
   b.textContent='▶ Tour starten';
   b.classList.remove('activeNav','stopNav');
 }
}
function startNavigationSession(){
 if(!mapPlanMetrics().valid){
   info('Tourplanung','Setze zuerst Start und Ziel und übernimm den Tourplan.');
   return;
 }
 navigationSession={active:true,startedAt:new Date().toISOString()};
 navigationModeState={mode:'gps_pending',distanceToStartKm:null,lastStableAt:Date.now(),lastGpsAt:0};
 // V3.6.0 starts in Vor-Tour mode until GPS is close enough to the planned start.
 liveNavState={activeStageIndex:0,reachedStops:{},completed:false};
 saveNavigationSession();setNavigationButton();renderMapTourStatus();
}
function stopNavigationSession(){
 navigationSession={active:false,startedAt:null};
 navigationModeState={mode:'idle',distanceToStartKm:null,lastStableAt:Date.now(),lastGpsAt:navigationModeState.lastGpsAt||0};
 saveNavigationSession();setNavigationButton();renderMapTourStatus();
}
function toggleNavigationSession(){
 if(navigationSession.active)stopNavigationSession();else startNavigationSession();
}


function nearestRouteTracking(lat,lon){
 if(!route?.length || route.length<2)return null;
 const u=robustNearestOnRoute([lat,lon]);
 const offKm=finiteNumber(u?.off);
 const along=finiteNumber(u?.along);
 if(offKm==null || along==null)return null;
 return {
   distanceM:Math.max(0,offKm*1000),
   idx:Number.isInteger(u?.index)?u.index:0,
   alongKm:Math.max(0,along),
   point:route[Number.isInteger(u?.index)?u.index:0],
   t:finiteNumber(u?.t)??0
 };
}

function routeDeviationLevel(distanceM){
 if(distanceM==null)return 0;
 if(distanceM>=120)return 2;
 if(distanceM>=60)return 1;
 return 0;
}
function updateRouteTracking(){
 if(!navLiveMode() || !route?.length){
   routeTrackingState={offRoute:false,distanceToRouteM:null,alongKm:null,lastUpdate:null};
   return routeTrackingState;
 }
 const uPos=normalizeCoord(userPosition);
 if(!uPos){
   routeTrackingState={offRoute:false,distanceToRouteM:null,alongKm:null,lastUpdate:null};
   return routeTrackingState;
 }
 const n=nearestRouteTracking(uPos.lat,uPos.lon);
 const dist=safeMeters(n?.distanceM);
 const along=finiteNumber(n?.alongKm);
 if(dist==null || along==null){
   routeTrackingState={offRoute:false,distanceToRouteM:null,alongKm:null,lastUpdate:null};
   return routeTrackingState;
 }
 const level=routeDeviationLevel(dist);
 routeTrackingState={
   offRoute:level>0,
   level,
   distanceToRouteM:dist,
   alongKm:Math.max(0,along),
   routeIndex:Number.isInteger(n?.idx)?n.idx:null,
   lastUpdate:new Date().toISOString()
 };
 return routeTrackingState;
}

function drawUserRouteMarker(){
 if(!map)return;
 const u=normalizeCoord(userPosition);
 if(!u)return;
 try{if(userRouteMarker)map.removeLayer(userRouteMarker)}catch(e){}
 const icon=L.divIcon({className:'',html:'<div class="routeUserMarker"></div>',iconSize:[26,26],iconAnchor:[13,13]});
 userRouteMarker=L.marker([u.lat,u.lon],{icon,zIndexOffset:2000}).addTo(map);
}

function routeDeviationHtml(){
 if(!navLiveMode())return '';
 const t=updateRouteTracking();
 const dist=safeMeters(t?.distanceToRouteM);

 if(dist==null){
   return `<div class="routeDeviationCard">
     <div class="routeDeviationHead">
       <div><b>📍 GPS-Routenstatus</b><small>Abstand wird bestimmt</small></div>
       <span class="routeDeviationBadge">GPS</span>
     </div>
     <div class="routeDeviationHint">Noch kein belastbarer Routenabstand verfügbar. Es wird keine Warnstufe angezeigt.</div>
   </div>`;
 }

 const level=dist>=120?2:dist>=60?1:0;
 const cls=level===2?'danger':level===1?'warn':'arrival';
 const status=level===2?'Route deutlich verlassen':level===1?'Route verlassen':'Auf Route';
 const hint=level===2
   ?'Kehre möglichst zur GPX-Strecke zurück.'
   :level===1
   ?'Du bist merklich von der GPX-Strecke entfernt. Prüfe den Wegverlauf.'
   :'Deine GPS-Position liegt im erwarteten Korridor der Route.';
 const along=finiteNumber(t?.alongKm);

 return `<div class="routeDeviationCard ${cls}">
   <div class="routeDeviationHead">
     <div><b>📍 ${status}</b><small>präziser Linienabgleich</small></div>
     <span class="routeDeviationBadge">${Math.round(dist)} m</span>
   </div>
   <div class="routeDeviationGrid">
     <div><b>${Math.round(dist)} m</b><small>Abstand zur Route</small></div>
     <div><b>${along==null?'—':along.toFixed(1)+' km'}</b><small>Fortschritt auf GPX</small></div>
   </div>
   <div class="routeDeviationHint">${hint}</div>
 </div>`;
}

function remainingDistanceFromTracking(){
 if(!navLiveMode())return null;
 const m=mapPlanMetrics(),t=updateRouteTracking();
 const along=finiteNumber(t?.alongKm);
 const finish=finiteNumber(m?.finishP?.alongKm);
 if(!m.valid || along==null || finish==null)return null;
 return Math.max(0,finish-along);
}

function updateLiveNavigationState(){
 const stages=plannedStageData();
 if(!stages.length || !mapPlanMetrics().valid){
   liveNavState={activeStageIndex:0,reachedStops:{},completed:false};
   return;
 }
 if(!navLiveMode()){
   liveNavState.activeStageIndex=0;
   return;
 }
 const along=currentPlanAlongKm();
 if(along==null || !navigationSession.active){
   liveNavState.activeStageIndex=Math.min(liveNavState.activeStageIndex||0,stages.length-1);
   return;
 }
 let idx=stages.length-1;
 for(let i=0;i<stages.length;i++){
   const endKm=stages[i].to.alongKm??Infinity;
   if(along <= endKm+0.05){ idx=i; break; }
 }
 const active=stages[idx];
 const next=active.to;
 const userLat=userPosition?.lat,userLon=userPosition?.lon;
 if(userLat!=null && userLon!=null && next){
   const d=distanceMeters(userLat,userLon,next.lat,next.lon);
   if(d<=45){
     if(next.type==='stop'){
       liveNavState.reachedStops[next.created||idx]=true;
       if(idx<stages.length-1)idx+=1;
     }else if(next.type==='finish'){
       liveNavState.completed=true;
       navigationSession.active=false;saveNavigationSession();setNavigationButton();
     }
   }
 }
 liveNavState.activeStageIndex=idx;
}
function activeLiveStage(){
 updateLiveNavigationState();
 const stages=plannedStageData();
 if(!stages.length)return null;
 return stages[Math.min(liveNavState.activeStageIndex||0,stages.length-1)];
}
function liveNavigationHtml(){
 const __mode=navMode();
 if(__mode!=='live')return navigationStateHtml();

 if(arrivalModeActive()){
   return arrivalModeHtml();
 }

 const stages=plannedStageData();
 if(!stages.length || !mapPlanMetrics().valid)return '';
 updateLiveNavigationState();

 if(liveNavState.completed){
   return `<div class="navLiveCard navComplete">
     <div class="navLiveHead"><div><b>🏁 Tour beendet</b><small>Ziel erreicht</small></div><span class="navLiveBadge">fertig</span></div>
     <div class="navInstruction">Du hast den geplanten Zielpunkt erreicht.</div>
   </div>`;
 }

 const l=liveStageMetrics();
 if(!l)return '';
 const active=activeLiveStage()||l.active;
 const next=active.to;
 const nextLabel=pointLabel(next.type);
 const distKm=Math.max(0,(next.alongKm??0)-(l.along??(active.from.alongKm??0)));
 const pauseMin=next.type==='stop'?Number(next.pauseMinutes||0):0;
 const gpsLive=navigationSession.active && !arrivalModeActive() && l.along!=null;
 const eta = gpsLive ? new Date(Date.now()+(distKm/Math.max(1,l.speed))*3600000) : new Date(active.arrive);

 let instruction = '';
 if(next.type==='stop'){
   instruction = `Weiter bis zum Zwischenstopp. ${pauseMin?`Dort sind ${pauseMin} Min. Pause geplant.`:'Keine Pause eingeplant.'}`;
 }else{
   instruction = `Weiter bis zum Ziel.`;
 }

 return `<div class="navLiveCard ${gpsLive?'':'navReached'}">
   <div class="navLiveHead">
     <div><b>🧭 Live-Navigation · Etappe ${(liveNavState.activeStageIndex||0)+1}/${stages.length}</b><small>${pointLabel(active.from.type)} → ${nextLabel}</small></div>
     <span class="navLiveBadge">${gpsLive?'unterwegs':navigationSession.active?'Navigation aktiv':'geplant'}</span>
   </div>
   <div class="navLiveMain">
     <div><b>${distKm.toFixed(1)} km</b><small>bis ${nextLabel}</small></div>
     <div><b>${formatEta(eta)}</b><small>voraussichtliche Ankunft</small></div>
   </div>
   <div class="navInstruction">${instruction}</div>
   <div class="navSessionStrip">${navigationSession.active?`<strong>Navigation läuft.</strong> Automatische Etappenumschaltung ist aktiv.`:`Tour ist noch nicht gestartet. Tippe oben auf „Tour starten“.`}</div>
 </div>`;
}

function compactMapTourStatusHtml(){
 const l=liveStageMetrics();
 if(!l)return '';
 updateLiveNavigationState();
 const stages=plannedStageData();
 if(!stages.length)return '';
 const idx=Math.min(liveNavState.activeStageIndex||0,stages.length-1);
 const active=stages[idx];
 const next=active.to;
 const nextLabel=pointLabel(next.type);
 const pauseMin=next.type==='stop'?Number(next.pauseMinutes||0):0;

 // Recompute stage remainder from current along and selected active stage
 const along=l.along;
 const remainingStageKm=along==null
   ? active.distance
   : Math.max(0,(next.alongKm??0)-along);
 const etaStage = along==null
   ? new Date(active.arrive)
   : new Date(Date.now()+(remainingStageKm/Math.max(1,l.speed))*3600000);

 return `<div class="mapTourStatus v24">
   <div class="mapTourStatusHead">
     <div><b>🧭 Etappe ${idx+1}/${stages.length}</b><small>${pointLabel(active.from.type)} → ${nextLabel}</small></div>
     <span class="mapTourStatusBadge">${navigationSession.active?(along==null?'aktiv':'unterwegs'):'geplant'}</span>
   </div>
   <div class="mapTourProgress"><span style="width:${(l.progressPct||0).toFixed(0)}%"></span></div>
   <div class="mapTourStatusGrid">
     <div><b>${remainingStageKm.toFixed(1)} km</b><small>nächster Punkt</small></div>
     <div><b>${formatEta(etaStage)}</b><small>Ankunft</small></div>
     <div><b>${l.remainingTourKm.toFixed(1)} km</b><small>bis Ziel</small></div>
     <div><b>${formatEta(l.etaFinish)}</b><small>Zielzeit</small></div>
   </div>
   <div class="mapTourNext">${pauseMin?`⏸ ${pauseMin} Min. Pause am nächsten Stopp.`:(next.type==='finish'?'🏁 Nächster Punkt: Ziel.':'Kein Halt eingeplant.')}</div>
 </div>`;
}

function renderMapTourStatus(){
 setTimeout(()=>{try{v34InjectHud()}catch(e){}},0);
 setTimeout(()=>{try{v33InjectTrackHud()}catch(e){}},0);
 setTimeout(()=>{try{v32UpdateEngine();v32InjectHud()}catch(e){}},0);

 const __v311bar=$('#v30NavHintBar');
 if(__v311bar && !(navigationSession?.active && typeof navLiveMode==='function' && navLiveMode())){
   __v311bar.classList.remove('show');
 }

 setTimeout(()=>{v31CheckAlerts();const h=$('#mapTourStatusHost');if(h&&navigationSession?.active&&navLiveMode?.()){const extra=v31LiveStripHtml()+v31AssistStatusHtml();if(extra&&!h.innerHTML.includes('navAssistCard'))h.innerHTML+=extra}},0);
 setTimeout(v30UpdateNavHintBar,0);
 const host=$('#mapTourStatusHost');
 if(!host)return;
 if(!mapPlanMetrics().valid){host.innerHTML='';return;}
 const mode=navMode();
 if(mode!=='live'){host.innerHTML=navigationStateHtml();return;}
 const navHtml=typeof compactLiveNavHtml==='function'?compactLiveNavHtml():liveNavigationHtml();
 host.innerHTML=navHtml+routeDeviationHtml();
}

function liveStageHtml(){
 const l=liveStageMetrics();
 if(!l)return '';
 const a=l.active;
 const nextLabel=pointLabel(a.to.type);
 const currentEtappe=l.activeIndex+1;
 const total=plannedStageData().length;
 return `<div class="liveStage">
   <b>📡 Aktuelle Etappe ${currentEtappe}/${total}</b>
   <small>${pointLabel(a.from.type)} → ${nextLabel}</small>
   <div class="stageProgressBar"><span style="width:${l.progressPct.toFixed(0)}%"></span></div>
   <div class="liveStageGrid">
     <div><b>${l.remainingStageKm.toFixed(1)} km</b><small>bis ${nextLabel}</small></div>
     <div><b>${formatEta(l.etaStage)}</b><small>voraussichtliche Ankunft</small></div>
     <div><b>${l.remainingTourKm.toFixed(1)} km</b><small>bis Ziel</small></div>
     <div><b>${formatEta(l.etaFinish)}</b><small>neue Zielankunft</small></div>
   </div>
   <span class="stageNowBadge">${l.beforeStart?'Planstatus':'GPS/Fortschritt'} · Tempo ${l.speed.toFixed(1).replace('.',',')} km/h</span>
 </div>`;
}

function stagePlannerHtml(stages){
 if(!stages?.length)return '';
 const fmt=d=>new Date(d).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
 const totalDistance=stages.reduce((sum,s)=>sum+s.distance,0);
 return `<div class="stagePlanner">
   <div class="stageSummary"><b>🧭 Etappenplan</b><small>${stages.length} Etappen · ${totalDistance.toFixed(1)} km · ${stageTotalPause()} Min. geplante Pausen</small></div>
   ${stages.map((s,i)=>{
     const w=s.weather,level=w?.level||0;
     const walkMin=(s.distance/Math.max(1,Number(tourPlan.speed||4)))*60;
     const pauseEnd=s.pauseAfter?new Date(new Date(s.arrive).getTime()+s.pauseAfter*60000):null;
     const remaining=stages.slice(i+1).reduce((sum,x)=>sum+x.distance,0);
     return `<div class="stageCard ${level>=3?'high':level===2?'medium':''}">
       <div class="stageHead">
        <div><b>Etappe ${s.index}: ${pointLabel(s.from.type)} → ${pointLabel(s.to.type)}</b><small>${fmt(s.depart)} – ${fmt(s.arrive)}</small></div>
        <div class="stageDistance">${s.distance.toFixed(1)} km</div>
       </div>
       <div class="stageStats">
         <div><b>${formatDurationMinutes(walkMin)}</b><small>Gehzeit</small></div>
         <div><b>${fmt(s.arrive)}</b><small>Ankunft</small></div>
         <div><b>${s.pauseAfter?fmt(pauseEnd):'—'}</b><small>${s.pauseAfter?'Pausenende':'keine Pause'}</small></div>
         <div><b>${remaining.toFixed(1)} km</b><small>danach bis Ziel</small></div>
       </div>
       ${hasElevationData()?(()=>{const es=elevationStatsBetween(s.from.alongKm,s.to.alongKm);return es?`<div class="stageElevation"><div><b>+${es.gain} m</b><small>Anstieg</small></div><div><b>−${es.loss} m</b><small>Abstieg</small></div><div><b>${es.max} m</b><small>max. Höhe</small></div></div>`:''})():''}
       ${w?`<div class="stageWeather">
         <div><b>${Math.round(w.temp)} °C</b><small>bei Ankunft</small></div>
         <div><b>${Math.round(w.rainProb)} %</b><small>Regen</small></div>
         <div><b>${Math.round(w.gust)} km/h</b><small>Böen</small></div>
       </div>`:'<div class="warningBody">Wetter für diese Etappe nicht geladen.</div>'}
       ${w?.reasons?.length?`<div class="warningBody">⚠ ${escapeHtml(w.reasons.join(', '))}</div>`:''}
     </div>`;
   }).join('')}
 </div>`;
}




/* ===== V3.6.0: Trail-Navigation, Etappenplan, Offline-Tourpaket ===== */
const V30_OFFLINE_KEY='trek_sleep_v30_offline_packages';
let v30TrailHints=[];

function v30Bearing(a,b){
 const lat1=a[0]*Math.PI/180,lat2=b[0]*Math.PI/180,dLon=(b[1]-a[1])*Math.PI/180;
 const y=Math.sin(dLon)*Math.cos(lat2);
 const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
 return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function v30AngleDiff(a,b){return (b-a+540)%360-180}
function v30TurnType(delta){
 const a=Math.abs(delta);
 if(a<18)return {icon:'↑',label:'Geradeaus'};
 if(a<45)return delta>0?{icon:'↗',label:'Leicht rechts'}:{icon:'↖',label:'Leicht links'};
 if(a<115)return delta>0?{icon:'→',label:'Rechts abbiegen'}:{icon:'←',label:'Links abbiegen'};
 return {icon:'↩',label:'Scharf wenden'};
}
function v30BuildTrailHints(){
 if(!route?.length||route.length<5){v30TrailHints=[];return []}
 const hints=[];let lastAlong=-999;
 for(let i=2;i<route.length-2;i++){
   const b1=v30Bearing(route[i-2],route[i]),b2=v30Bearing(route[i],route[i+2]);
   const delta=v30AngleDiff(b1,b2);
   if(Math.abs(delta)<28)continue;
   const along=Number(routeCum[i])||0;
   if(along-lastAlong<.08)continue;
   const turn=v30TurnType(delta);
   hints.push({idx:i,alongKm:along,delta,icon:turn.icon,label:turn.label,lat:route[i][0],lon:route[i][1]});
   lastAlong=along;
 }
 v30TrailHints=hints;return hints;
}
function v30CurrentAlong(){
 try{const v=currentPlanAlongKm();if(Number.isFinite(Number(v)))return Number(v)}catch(e){}
 return 0;
}
function v30NextTrailHints(limit=4){
 if(!v30TrailHints.length)v30BuildTrailHints();
 const along=v30CurrentAlong();

 const passed=v32State?.passedTurns;
 return v30TrailHints
   .filter(h=>!(passed && typeof passed.has==='function' && passed.has(h.idx)))
   .filter(h=>h.alongKm>=along-.01)
   .slice(0,limit);
}
function v30FormatDistKm(km){return km<1?`${Math.max(0,Math.round(km*1000))} m`:`${km.toFixed(1)} km`}

function openTrailGuide(){
 const hints=v30NextTrailHints(8),along=v30CurrentAlong(),total=routeCum?.at(-1)||0;
 $('#modalBody').innerHTML=`
 <span class="tag">🧭 Trail-Navigation · V3.6.0</span><h2>Abbiegehinweise</h2>
 <div class="trailHero"><div class="trailTop"><div><h3>${navigationSession?.active?'Navigation aktiv':'Vorschau der Route'}</h3>
 <small>Hinweise werden aus der Form deiner GPX-Strecke abgeleitet.</small></div><span class="trailBadge">${v30TrailHints.length} Hinweise</span></div>
 <div class="cockpitGrid"><div class="cockpitMetric"><b>${along.toFixed(1)} km</b><small>Fortschritt</small></div>
 <div class="cockpitMetric"><b>${Math.max(0,total-along).toFixed(1)} km</b><small>bis Ziel</small></div></div></div>
 ${hints.length?hints.map(h=>`<div class="turnCard"><div class="turnIcon">${h.icon}</div><div><b>${escapeHtml(h.label)}</b><small>bei km ${h.alongKm.toFixed(1)}</small></div><div class="turnDist">${v30FormatDistKm(Math.max(0,h.alongKm-along))}</div></div>`).join(''):
 '<div class="card"><b>Keine markanten Richtungsänderungen gefunden.</b><p>Die Strecke verläuft hier überwiegend gerade oder enthält zu wenige Punkte.</p></div>'}
 <div class="card"><small>Die Hinweise werden geometrisch aus der GPX-Linie erzeugt und ersetzen keine ausgeschilderte Wegführung.</small></div>`;
 $('#modal').classList.remove('hidden');
}

function v30PoisForSegment(a,b){
 const lo=Math.min(a,b),hi=Math.max(a,b);
 return (allPois||[]).filter(p=>{const x=Number(p.along);return Number.isFinite(x)&&x>=lo-.05&&x<=hi+.05});
}
function v30StagePoints(){
 const m=mapPlanMetrics(),total=routeCum?.at(-1)||0;
 const start=m.valid?Number(m.startP.alongKm):0,finish=m.valid?Number(m.finishP.alongKm):total;
 const stops=(m.active||[]).filter(p=>p.type==='stop').sort((a,b)=>Number(a.alongKm)-Number(b.alongKm));
 return [{type:'start',alongKm:start},...stops,{type:'finish',alongKm:finish}];
}
function v30StageETA(distanceKm,pauseMin=0){
 const speed=Number(planSettings?.speedKmh)||4;
 const mins=(distanceKm/Math.max(.5,speed))*60+pauseMin,h=Math.floor(mins/60),m=Math.round(mins%60);
 return h?`${h} Std. ${m} Min.`:`${m} Min.`;
}
function v30StagePoiPills(pois){
 const priority=['drinking_water','water_source','shelter','sleep','camp','emergency'],chosen=[];
 for(const t of priority){const p=pois.find(x=>x.type===t);if(p)chosen.push(p)}
 if(!chosen.length)return '<span class="pill">keine wichtigen POIs geladen</span>';
 return chosen.slice(0,5).map(p=>{const t=TYPE[p.type]||{icon:'•',label:'POI'};return `<span class="pill">${t.icon} ${escapeHtml(t.label)}</span>`}).join('');
}
function openDayStagePlanner(){
 const pts=v30StagePoints(),total=routeCum?.at(-1)||0,stages=[];
 for(let i=0;i<pts.length-1;i++){
   const a=Number(pts[i].alongKm)||0,b=Number(pts[i+1].alongKm)||0;if(!(b>a))continue;
   const pois=v30PoisForSegment(a,b),st=elevationStatsBetween(a,b);
   const stop=(mapPlan.points||[]).find(p=>p.type==='stop'&&Math.abs(Number(p.alongKm)-b)<.001);
   const pauseMin=stop?Number(stop.pauseMin||15):0;
   stages.push({a,b,distance:b-a,pois,st,pauseMin});
 }
 $('#modalBody').innerHTML=`
 <span class="tag">🗓 Etappenplan · V3.6.0</span><h2>Deine Tour in Abschnitten</h2>
 <div class="dayHero"><div class="dayTop"><div><h3>${stages.length} Etappen</h3><small>Aus Start, Zwischenstopps und Ziel berechnet.</small></div><span class="dayBadge">${total.toFixed(1)} km GPX</span></div></div>
 ${stages.map((s,i)=>`<div class="stageCard"><h3>Etappe ${i+1} · ${s.distance.toFixed(1)} km</h3><div class="stageMeta">GPX km ${s.a.toFixed(1)} → ${s.b.toFixed(1)}</div>
 <div class="stageGrid"><div class="stageMetric"><b>${v30StageETA(s.distance,s.pauseMin)}</b><small>geschätzte Dauer</small></div>
 <div class="stageMetric"><b>+${Math.round(s.st.gain||0)} m</b><small>Aufstieg</small></div><div class="stageMetric"><b>${s.pois.length}</b><small>POIs entlang Etappe</small></div>
 <div class="stageMetric"><b>${s.pauseMin||0} Min.</b><small>Pause am Ende</small></div></div><div class="poiStrip">${v30StagePoiPills(s.pois)}</div></div>`).join('')||
 '<div class="card"><b>Noch kein vollständiger Tourplan.</b><p>Setze Start und Ziel unter „Punkte planen“.</p></div>'}
 <div class="card"><b>Mehrtagestour</b><p>Setze Zwischenstopps auf Trekking-, Biwak- oder Hüttenplätze. Trek & Sleep teilt die Route dann automatisch in Tagesabschnitte.</p></div>`;
 $('#modal').classList.remove('hidden');
}

function v30OfflinePackages(){try{return JSON.parse(localStorage.getItem(V30_OFFLINE_KEY)||'{}')}catch(e){return{}}}
function v30SaveOfflinePackages(obj){localStorage.setItem(V30_OFFLINE_KEY,JSON.stringify(obj))}
function v30OfflineKey(){
 const first=route?.[0],last=route?.at(-1);if(!first||!last)return null;
 return `${Number(first[0]).toFixed(4)},${Number(first[1]).toFixed(4)}|${Number(last[0]).toFixed(4)},${Number(last[1]).toFixed(4)}|${route.length}`;
}
function v30OfflineSnapshot(){
 return {name:$('#routeName')?.textContent||'Tour',savedAt:Date.now(),route,routeCum,elevations:routeEle,plan:JSON.parse(JSON.stringify(mapPlan||{})),
 pois:(allPois||[]).map(p=>({name:p.name,type:p.type,lat:p.lat,lon:p.lon,along:p.along,off:p.off})),version:'3.0'};
}
async function prepareOfflineTour(){
 if(!route?.length){alert('Bitte zuerst eine GPX-Route laden.');return}
 const bar=$('#offlineV30Bar'),txt=$('#offlineV30Text'),box=$('#offlineV30Progress');if(box)box.style.display='block';
 const steps=[
  ['Route & Planung',async()=>true],
  ['Höhenprofil',async()=>await ensureElevationData(false)],
  ['POIs',async()=>{if(!(allPois||[]).length&&navigator.onLine){try{await loadPois(false)}catch(e){}}return true}],
  ['App-Dateien',async()=>{try{if('caches'in window){const c=await caches.open('trek-sleep-v30-user');await c.addAll(['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./sw.js'])}}catch(e){}return true}]
 ];
 for(let i=0;i<steps.length;i++){if(txt)txt.textContent=`${steps[i][0]} wird vorbereitet …`;try{await steps[i][1]()}catch(e){}if(bar)bar.style.width=`${Math.round((i+1)/steps.length*100)}%`}
 const key=v30OfflineKey(),packs=v30OfflinePackages();packs[key]=v30OfflineSnapshot();v30SaveOfflinePackages(packs);
 if(txt)txt.textContent='Offline-Tourpaket gespeichert.';setTimeout(openOfflineTourCenter,400);
}
function openOfflineTourCenter(){
 const key=v30OfflineKey(),packs=v30OfflinePackages(),hit=key?packs[key]:null,size=hit?JSON.stringify(hit).length:0;
 $('#modalBody').innerHTML=`
 <span class="tag">📥 Offline-Tour · V3.6.0</span><h2>Tour für unterwegs vorbereiten</h2>
 <div class="offlineHero"><h3>${hit?'✓ Tourpaket vorhanden':'Noch nicht vorbereitet'}</h3><p>${hit?'Route, Planung, POIs und Höhenprofil wurden lokal gespeichert.':'Speichert die relevanten Daten dieser Tour lokal auf deinem iPhone.'}</p>
 ${hit?`<div class="offlineStatus"><b>${new Date(hit.savedAt).toLocaleString()}</b><small>${Math.round(size/1024)} KB Tourdaten · ${hit.pois?.length||0} POIs</small></div>`:''}</div>
 <div id="offlineV30Progress" class="offlineStatus" style="display:none"><b id="offlineV30Text">Vorbereitung …</b><small>Bitte Seite geöffnet lassen.</small><div class="offlineProgress"><span id="offlineV30Bar"></span></div></div>
 <button id="prepareOfflineV30" class="primary wide">${hit?'Offline-Paket aktualisieren':'Offline-Paket erstellen'}</button>
 ${hit?'<button id="removeOfflineV30" class="toolBtn warn wide">Offline-Paket löschen</button>':''}
 <div class="offlineList"><div class="offlineItem"><div><b>GPX-Route</b><small>Linie und Streckenfortschritt</small></div><strong>${route?.length||0} Punkte</strong></div>
 <div class="offlineItem"><div><b>Höhenprofil</b><small>berechnete Höhenwerte</small></div><strong>${usableElevationData(routeEle)?'bereit':'fehlt'}</strong></div>
 <div class="offlineItem"><div><b>POIs</b><small>für die aktuelle Route</small></div><strong>${allPois?.length||0}</strong></div>
 <div class="offlineItem"><div><b>Basiskarte</b><small>Browser-Cache, nicht vollständig garantiert</small></div><strong>best effort</strong></div></div>`;
 $('#modal').classList.remove('hidden');
 $('#prepareOfflineV30').onclick=prepareOfflineTour;
 if($('#removeOfflineV30'))$('#removeOfflineV30').onclick=()=>{const p=v30OfflinePackages();delete p[key];v30SaveOfflinePackages(p);openOfflineTourCenter()};
}
function v30UpdateNavHintBar(){
 const bar=$('#v30NavHintBar');
 if(!bar)return;

 // V3.6.0: niemals im Vor-Tour-/Anreisemodus anzeigen.
 const liveActive = !!navigationSession?.active && !!(typeof navLiveMode==='function' && navLiveMode());
 if(!liveActive){
   bar.classList.remove('show');
   return;
 }

 // Zusätzlich nur bei belastbarer Positions-/Routenzuordnung.
 const u = normalizeCoord?.(userPosition);
 if(!u){
   bar.classList.remove('show');
   return;
 }

 const track = nearestRouteTracking?.(u.lat,u.lon);
 if(!track || !Number.isFinite(Number(track.distanceM))){
   bar.classList.remove('show');
   return;
 }

 const h=v30NextTrailHints(1)[0];
 if(!h){
   bar.classList.remove('show');
   return;
 }

 const along=v30CurrentAlong();
 if(!Number.isFinite(Number(along))){
   bar.classList.remove('show');
   return;
 }

 const dist=Math.max(0,h.alongKm-along);

 // Nur nahe Richtungswechsel anzeigen.
 if(dist>0.45){
   bar.classList.remove('show');
   return;
 }

 bar.querySelector('.ico').textContent=h.icon;
 bar.querySelector('b').textContent=h.label;
 bar.querySelector('small').textContent=`bei km ${h.alongKm.toFixed(1)}`;
 bar.querySelector('strong').textContent=v30FormatDistKm(dist);
 bar.classList.add('show');
}

/* ===== V3.6.0: echtes Höhenprofil ===== */
const V29_ELEV_CACHE='trek_sleep_v29_elevation_cache';
let elevationDataSource='none';

function normalizeElevationArray(arr){
 if(!Array.isArray(arr))return [];
 const out=arr.map(v=>Number.isFinite(Number(v))?Number(v):null);
 let lastGood=-1;
 for(let i=0;i<out.length;i++){
   if(out[i]!=null){lastGood=i;continue}
   let next=i+1;
   while(next<out.length && out[next]==null)next++;
   if(lastGood>=0 && next<out.length){
     const a=out[lastGood],b=out[next],span=next-lastGood;
     for(let k=i;k<next;k++)out[k]=a+(b-a)*((k-lastGood)/span);
     i=next-1;
   }else if(lastGood>=0){
     out[i]=out[lastGood];
   }else if(next<out.length){
     out[i]=out[next];
   }
 }
 return out;
}

function usableElevationData(arr=routeEle){
 if(!Array.isArray(arr) || arr.length!==route.length || arr.length<2)return false;
 const vals=arr.filter(v=>Number.isFinite(Number(v))).map(Number);
 if(vals.length<Math.max(3,Math.floor(arr.length*.6)))return false;
 const min=Math.min(...vals),max=Math.max(...vals);
 // all-zero / flat placeholder data must not count as valid
 return Number.isFinite(min)&&Number.isFinite(max)&&(max-min>=2 || max>20);
}

function elevationCacheKey(){
 if(!route?.length)return null;
 const pts=[route[0],route[Math.floor(route.length/2)],route.at(-1)]
   .flat().map(v=>Number(v).toFixed(4)).join('|');
 return `${route.length}|${pts}`;
}

function loadElevationCache(){
 try{
   const key=elevationCacheKey(); if(!key)return false;
   const all=JSON.parse(localStorage.getItem(V29_ELEV_CACHE)||'{}');
   const hit=all[key];
   if(hit?.values && hit.values.length===route.length && usableElevationData(hit.values)){
     routeEle=normalizeElevationArray(hit.values);
     elevationDataSource='cache';
     return true;
   }
 }catch(e){}
 return false;
}

function saveElevationCache(){
 try{
   if(!usableElevationData(routeEle))return;
   const key=elevationCacheKey(); if(!key)return;
   const all=JSON.parse(localStorage.getItem(V29_ELEV_CACHE)||'{}');
   all[key]={values:routeEle,ts:Date.now()};
   const latest=Object.entries(all)
     .sort((a,b)=>(b[1]?.ts||0)-(a[1]?.ts||0))
     .slice(0,8);
   localStorage.setItem(V29_ELEV_CACHE,JSON.stringify(Object.fromEntries(latest)));
 }catch(e){}
}

function sampleRouteForElevation(maxPoints=100){
 if(route.length<=maxPoints)return route.map((p,i)=>({lat:Number(p[0]),lon:Number(p[1]),idx:i}));
 const out=[];
 for(let n=0;n<maxPoints;n++){
   const idx=Math.round((route.length-1)*(n/(maxPoints-1)));
   const p=route[idx];
   out.push({lat:Number(p[0]),lon:Number(p[1]),idx});
 }
 return out;
}

function expandElevationSamples(samples,vals){
 const out=new Array(route.length).fill(null);
 samples.forEach((s,i)=>{out[s.idx]=Number(vals[i])});
 for(let j=0;j<samples.length-1;j++){
   const a=samples[j],b=samples[j+1];
   const ea=Number(vals[j]),eb=Number(vals[j+1]);
   if(!Number.isFinite(ea)||!Number.isFinite(eb))continue;
   const span=Math.max(1,b.idx-a.idx);
   for(let i=a.idx;i<=b.idx;i++)out[i]=ea+(eb-ea)*((i-a.idx)/span);
 }
 return normalizeElevationArray(out);
}

async function fetchRouteElevations(){
 const samples=sampleRouteForElevation(100);
 if(!samples.length)throw Error('Keine Route');
 const lat=samples.map(p=>p.lat.toFixed(5)).join(',');
 const lon=samples.map(p=>p.lon.toFixed(5)).join(',');
 const url=`https://api.open-meteo.com/v1/elevation?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}`;
 const res=await fetchWithTimeout(url,{},18000);
 if(!res.ok)throw Error(`Höhenservice HTTP ${res.status}`);
 const data=await res.json();
 if(!Array.isArray(data?.elevation)||data.elevation.length!==samples.length)throw Error('Unvollständige Höhendaten');
 const expanded=expandElevationSamples(samples,data.elevation);
 if(!usableElevationData(expanded))throw Error('Unbrauchbare Höhendaten');
 return expanded;
}

async function ensureElevationData(force=false){
 if(!route?.length)return false;

 if(!force && usableElevationData(routeEle)){
   routeEle=normalizeElevationArray(routeEle);
   elevationDataSource=elevationDataSource==='cache'?'cache':'gpx';
   return true;
 }
 if(!force && loadElevationCache())return true;
 if(!navigator.onLine)return false;

 try{
   routeEle=await fetchRouteElevations();
   elevationDataSource='online';
   saveElevationCache();
   try{
     localStorage.setItem('trek_sleep_last_route',JSON.stringify({
       name:$('#routeName')?.textContent||'Tour',
       points:route,
       elevations:routeEle,
       ts:Date.now()
     }));
   }catch(e){}
   return true;
 }catch(e){
   console.warn('V3.6.0 Höhenprofil:',e);
   return false;
 }
}

function elevationSourceLabel(){
 if(elevationDataSource==='gpx')return 'GPX-Höhendaten';
 if(elevationDataSource==='online')return 'Höhendaten nachgeladen';
 if(elevationDataSource==='cache')return 'gespeicherte Höhendaten';
 return 'keine Höhendaten';
}

function hasElevationData(){
 return usableElevationData(routeEle);
}
function interpolateElevationAtKm(km){
 if(!hasElevationData() || !routeCum.length)return null;
 km=Math.max(0,Math.min(routeCum.at(-1)||0,km));
 let i=0;
 while(i<routeCum.length-2 && routeCum[i+1]<km)i++;
 const a=routeCum[i],b=routeCum[i+1]??a;
 const ea=routeEle[i],eb=routeEle[i+1];
 if(!Number.isFinite(ea)||!Number.isFinite(eb))return Number.isFinite(ea)?ea:Number.isFinite(eb)?eb:null;
 const t=b>a?(km-a)/(b-a):0;
 return ea+(eb-ea)*t;
}
function elevationStatsBetween(startKm=0,endKm=null){
 if(!hasElevationData())return null;
 endKm=endKm==null?(routeCum.at(-1)||0):endKm;
 startKm=Math.max(0,startKm);endKm=Math.min(routeCum.at(-1)||0,endKm);
 let gain=0,loss=0,min=Infinity,max=-Infinity,prev=null;
 for(let i=0;i<route.length;i++){
   const km=routeCum[i]||0;
   if(km<startKm || km>endKm)continue;
   const e=routeEle[i];
   if(!Number.isFinite(e))continue;
   min=Math.min(min,e);max=Math.max(max,e);
   if(prev!=null){
     const d=e-prev;
     if(d>1.5)gain+=d;
     else if(d<-1.5)loss+=Math.abs(d);
   }
   prev=e;
 }
 if(prev==null)return null;
 return {gain:Math.round(gain),loss:Math.round(loss),min:Math.round(min),max:Math.round(max)};
}
function routeDifficulty(){
 const dist=mapPlanMetrics().valid?mapPlanMetrics().distance:(routeCum.at(-1)||0);
 const m=mapPlanMetrics();
 const es=elevationStatsBetween(m.valid?m.startP.alongKm:0,m.valid?m.finishP.alongKm:null);
 const gain=es?.gain||0;
 let score=dist/8 + gain/500;
 if(score<1.8)return {label:'leicht',cls:'gradeEasy',score};
 if(score<3.5)return {label:'mittel',cls:'gradeMedium',score};
 return {label:'anspruchsvoll',cls:'gradeHard',score};
}
function elevationSvg(){
 if(!hasElevationData())return '';
 const valid=routeEle.map((e,i)=>({e,km:routeCum[i]||0})).filter(x=>Number.isFinite(x.e));
 if(valid.length<2)return '';
 const W=800,H=180,pad=18;
 const min=Math.min(...valid.map(x=>x.e)),max=Math.max(...valid.map(x=>x.e));
 const total=routeCum.at(-1)||1,range=Math.max(1,max-min);
 const pts=valid.map(x=>{
   const px=pad+(x.km/total)*(W-pad*2);
   const py=H-pad-((x.e-min)/range)*(H-pad*2);
   return `${px.toFixed(1)},${py.toFixed(1)}`;
 }).join(' ');
 return `<svg class="elevChart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Höhenprofil">
   <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="4" vector-effect="non-scaling-stroke"/>
   <line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="currentColor" opacity=".25"/>
 </svg>`;
}
function stageElevationHtml(){
 if(!hasElevationData() || !mapPlanMetrics().valid)return '';
 const stages=plannedStageData();
 return stages.map(s=>{
   const st=elevationStatsBetween(s.from.alongKm,s.to.alongKm);
   if(!st)return '';
   return `<div class="tourCheckSection"><h3>Etappe ${s.index} · ${s.distance.toFixed(1)} km</h3>
     <div class="stageElevation">
       <div><b>+${st.gain} m</b><small>Anstieg</small></div>
       <div><b>−${st.loss} m</b><small>Abstieg</small></div>
       <div><b>${st.max} m</b><small>höchster Punkt</small></div>
     </div>
   </div>`;
 }).join('');
}
async function openElevationProfile(){
 $('#modalBody').innerHTML=`<span class="tag">⛰ Höhenprofil · V3.6.0</span><h2>Höhenprofil</h2>
 <div class="profileMissing">Höhendaten werden geprüft …</div>`;
 $('#modal').classList.remove('hidden');

 const ready=await ensureElevationData(false);
 const diff=routeDifficulty();

 if(!ready || !hasElevationData()){
   $('#modalBody').innerHTML=`<span class="tag">⛰ Höhenprofil · V3.6.0</span><h2>Höhenprofil</h2>
   <div class="profileMissing">
     Diese GPX-Datei enthält keine ausreichenden Höhenwerte und es konnten gerade keine Höhendaten nachgeladen werden.
     ${navigator.onLine?'Du kannst die Abfrage erneut versuchen.':'Du bist aktuell offline.'}
   </div>
   <button id="retryElevationV29" class="primary wide">Höhendaten erneut laden</button>`;
   $('#retryElevationV29').onclick=async()=>{
     const ok=await ensureElevationData(true);
     if(ok)openElevationProfile();
     else alert('Höhendaten konnten nicht geladen werden.');
   };
   return;
 }

 const m=mapPlanMetrics();
 const st=elevationStatsBetween(m.valid?m.startP.alongKm:0,m.valid?m.finishP.alongKm:null);

 $('#modalBody').innerHTML=`<span class="tag">⛰ Höhenprofil · V3.6.0</span><h2>Tourprofil</h2>
 <div class="elevHero">
   <div class="pills"><span class="pill ok">${escapeHtml(elevationSourceLabel())}</span></div>
   <span class="gradeTag ${diff.cls}">${diff.label}</span>
   <div class="elevStats">
     <div><b>+${st.gain} m</b><small>Aufstieg</small></div>
     <div><b>−${st.loss} m</b><small>Abstieg</small></div>
     <div><b>${st.min} m</b><small>tiefster Punkt</small></div>
     <div><b>${st.max} m</b><small>höchster Punkt</small></div>
   </div>
   <div class="elevChartWrap">${elevationSvg()}<div class="elevLegend"><span>Start</span><span>${(m.valid?m.distance:(routeCum.at(-1)||0)).toFixed(1)} km</span><span>Ziel</span></div></div>
 </div>
 ${stageElevationHtml()}
 <button id="reloadElevationV29" class="primary wide">Höhendaten neu laden</button>`;

 $('#reloadElevationV29').onclick=async()=>{
   const ok=await ensureElevationData(true);
   if(ok)openElevationProfile();
   else alert('Höhendaten konnten nicht neu geladen werden.');
 };
}

function poiCategoryCount(type){
 return allPois.filter(p=>p.type===type || p.category===type || p.kind===type).length;
}
function supplyAssessment(){
 const m=mapPlanMetrics();
 const dist=m.valid?m.distance:(routeCum.at(-1)||0);
 const es=elevationStatsBetween(m.valid?m.startP.alongKm:0,m.valid?m.finishP.alongKm:null);
 const gain=es?.gain||0;

 const water=poiCategoryCount('water')+poiCategoryCount('drinking_water')+poiCategoryCount('spring');
 const sleep=poiCategoryCount('sleep')+poiCategoryCount('shelter')+poiCategoryCount('camp');
 const rescue=poiCategoryCount('rescue')+poiCategoryCount('emergency');

 let waterNeed=Math.max(1.0,dist*0.07 + gain/1500);
 let score=70;
 if(water>0)score+=10;
 if(sleep>0)score+=5;
 if(rescue>0)score+=5;
 if(!liveWarnings?.length)score+=5;
 if(dist>20)score-=8;
 if(gain>800)score-=8;
 score=Math.max(35,Math.min(100,Math.round(score)));

 const advice=[];
 advice.push(`Mindestens etwa ${waterNeed.toFixed(1)} l Start-Wasser einplanen; bei Hitze entsprechend mehr.`);
 if(water===0)advice.push('Keine Wasser-POIs geladen: Wasserstellen vor Abmarsch separat prüfen.');
 else advice.push(`${water} Wasser-/Quellpunkte sind aktuell in den geladenen POIs enthalten.`);
 if(dist>=15)advice.push('Für die Streckenlänge zusätzliche Energiereserve/Snacks einplanen.');
 if(gain>=500)advice.push('Wegen der Höhenmeter etwas mehr Zeit- und Energiereserve einplanen.');
 if(liveWarnings?.length)advice.push('Vor dem Start die aktuellen Wetter-/DWD-Hinweise nochmals prüfen.');
 if(sleep===0)advice.push('Kein Schlaf-/Hütten-POI geladen: Übernachtungsoptionen separat absichern.');

 return {score,waterNeed,water,sleep,rescue,advice};
}
function supplyAssessmentHtml(){
 const s=supplyAssessment();
 const cls=s.score>=80?'good':'warn';
 return `<div class="supplyHero">
   <div class="supplyScore"><div><b>🎒 Pack- & Versorgungscheck</b><small>automatisch aus Tourdaten abgeleitet</small></div><strong>${s.score}%</strong></div>
   <div class="supplyGrid">
     <div><b>${s.waterNeed.toFixed(1)} l</b><small>empfohlenes Start-Wasser</small></div>
     <div><b>${s.water}</b><small>Wasser-/Quell-POIs</small></div>
     <div><b>${s.sleep}</b><small>Schlaf-/Hütten-POIs</small></div>
     <div><b>${s.rescue}</b><small>Rettungs-/Notfall-POIs</small></div>
   </div>
   <div class="supplyAdvice ${cls}">${s.advice.map(x=>`• ${x}`).join('<br>')}</div>
 </div>`;
}

function tourCheckData(){
 const m=mapPlanMetrics();
 const dist=m.valid?m.distance:(routeCum.at(-1)||0);
 const diff=routeDifficulty();
 const es=elevationStatsBetween(m.valid?m.startP.alongKm:0,m.valid?m.finishP.alongKm:null);
 const stages=m.valid?plannedStageData().length:0;
 const stops=m.valid?orderedPlanPoints().filter(p=>p.type==='stop').length:0;
 const poiCount=allPois.length;
 const weatherOk=!liveWarnings?.length;
 let readiness=50;
 if(route.length>1)readiness+=15;
 if(m.valid)readiness+=15;
 if(poiCount>0)readiness+=8;
 if(weatherOk)readiness+=7;
 if(hasElevationData())readiness+=5;
 readiness=Math.min(100,readiness);
 return {dist,diff,es,stages,stops,poiCount,weatherOk,readiness};
}
function openTourOverview(){
 const d=tourCheckData();
 $('#modalBody').innerHTML=`<span class="tag">🧭 Tour-Check · V3.6.0</span><h2>Tour-Zusammenfassung</h2>
 <div class="tourCheckHero">
   <div class="tourCheckScore"><div><b>Vorbereitung</b><small>${d.readiness>=85?'sehr gut':d.readiness>=70?'gut':'noch ergänzen'}</small></div><strong>${d.readiness}%</strong></div>
   <div class="tourCheckCards">
     <div><b>${d.dist.toFixed(1)} km</b><small>geplante Strecke</small></div>
     <div><b><span class="gradeTag ${d.diff.cls}">${d.diff.label}</span></b><small>Tourbelastung</small></div>
     <div><b>${d.stages||'—'}</b><small>Etappen</small></div>
     <div><b>${d.stops}</b><small>Zwischenstopps</small></div>
     <div><b>${d.poiCount}</b><small>geladene POIs</small></div>
     <div><b>${d.weatherOk?'✓':'⚠'}</b><small>${d.weatherOk?'keine aktuelle DWD-Warnung':'Warnungen prüfen'}</small></div>
   </div>
 </div>
 <div class="tourCheckSection"><h3>⛰ Höhenlage</h3><p>${d.es?`Aufstieg +${d.es.gain} m, Abstieg −${d.es.loss} m, höchste Lage ${d.es.max} m.`:'Keine ausreichenden Höhenwerte in der aktuellen GPX-Datei.'}</p></div>
 <div class="tourCheckSection"><h3>📍 Navigation</h3><p>${mapPlanMetrics().valid?'Start und Ziel sind gesetzt. Die Live-Navigation kann gestartet werden.':'Für die Live-Navigation fehlen noch ein gültiger Start- und Zielpunkt.'}</p></div>
 <div class="tourCheckSection"><h3>🌦 Sicherheit</h3><p>${d.weatherOk?'Aktuell keine passende amtliche DWD-Warnung für den erkannten Tourbereich.':'Es liegen passende Warnhinweise vor. Öffne vor dem Start das Sicherheitscenter.'}</p></div>
 ${supplyAssessmentHtml()}
 ${stageElevationHtml()}`;
 $('#modal').classList.remove('hidden');
}

function openTourPlanner(){
 const t=planTimes(); const stagePause=mapPlanMetrics().valid?stageTotalPause():Number(tourPlan.pauseMinutes||0);
 $('#modalBody').innerHTML=`<span class="tag">🗓 Tourplaner · V2.4.1</span><h2>Tour planen</h2>
 <div class="plannerGrid">
  <div class="plannerField"><label>Startzeit</label><input id="planStart" type="datetime-local" value="${formatDateTimeLocalInput(plannedStartDate())}"></div>
  <div class="plannerField"><label>Gehgeschwindigkeit</label><select id="planSpeed">${[3,4,5,6].map(v=>`<option value="${v}" ${Number(tourPlan.speed)===v?'selected':''}>${v} km/h</option>`).join('')}</select></div>
  <div class="plannerField"><label>Gesamtpausen</label><select id="planPause">${[0,10,20,30,45,60].map(v=>`<option value="${v}" ${Number(tourPlan.pauseMinutes)===v?'selected':''}>${v} Min.</option>`).join('')}</select></div>
  <div class="plannerField"><label>Pause um Streckenmitte</label><select id="planHalf"><option value="1" ${tourPlan.pauseAtHalf?'selected':''}>Ja</option><option value="0" ${!tourPlan.pauseAtHalf?'selected':''}>Nein</option></select></div>
 </div>
 <div class="planSummary"><b>${mapPlanMetrics().valid?mapPlanMetrics().distance.toFixed(1):(routeCum.at(-1)||0).toFixed(1)} km · ca. ${t.totalH.toFixed(1)} Std.</b><small>${mapPlanMetrics().valid?stageTotalPause()+' Min. Pause aus Kartenstopps':Number(tourPlan.pauseMinutes||0)+' Min. Gesamtpause'}</small><small>${mapPlan.points.length?mapPlan.points.length+" Kartenpunkte geplant":"Noch keine Kartenpunkte geplant"}</small><small>Diese Zeiten steuern Wetter- und Sicherheitsprognose.</small>${plannerTimelineHtml()}</div>
 <button id="savePlan" class="savePlanBtn">Plan übernehmen</button>`;
 $('#modal').classList.remove('hidden');
 $('#savePlan').onclick=async()=>{
   const val=$('#planStart').value;
   const d=val?new Date(val):new Date();
   tourPlan={startTime:d.toISOString(),speed:Number($('#planSpeed').value||4),pauseMinutes:Number($('#planPause').value||0),pauseAtHalf:$('#planHalf').value==='1'};
   hikingSpeedKmh=tourPlan.speed;localStorage.setItem('trek_sleep_speed',hikingSpeedKmh);saveTourPlanLocal();
   $('#paceBtn').textContent=`🚶 ${hikingSpeedKmh.toFixed(1).replace('.',',')} km/h`;
   $('#plannerBtn').textContent='🗓 geplant';$('#modal').classList.add('hidden');await refreshWarnings();
 };
}

function openPaceSettings(){
 $('#modalBody').innerHTML=`<span class="tag">🚶 Gehgeschwindigkeit · V1.7</span>
 <h2>Wann erreichst du den Abschnitt?</h2>
 <p>Die Wetterprognose entlang der Route wird auf deine voraussichtliche Ankunftszeit abgestimmt.</p>
 <div class="paceGrid">
  ${[3,4,5,6].map(v=>`<button class="${Math.abs(hikingSpeedKmh-v)<0.1?'active':''}" data-speed="${v}">${v} km/h</button>`).join('')}
 </div>
 <div class="warning">Die Zeit ist eine Schätzung ohne Pausen und Höhenprofil. Später kann Trek & Sleep deine echte Gehgeschwindigkeit und Höhenmeter automatisch berücksichtigen.</div>`;
 $('#modal').classList.remove('hidden');
 $$('.paceGrid button').forEach(b=>b.onclick=async()=>{
   hikingSpeedKmh=Number(b.dataset.speed);
   localStorage.setItem('trek_sleep_speed',hikingSpeedKmh);
   $('#paceBtn').textContent=`🚶 ${hikingSpeedKmh.toFixed(1).replace('.',',')} km/h`;
   $('#modal').classList.add('hidden');
   await refreshWarnings();
 });
}

function regionalFireGuidance(){
 const st=(routeGeoContext?.state||'').toLowerCase();
 if(st.includes('rheinland-pfalz')||st.includes('rheinland pfalz')){
   return {
     region:'Rheinland-Pfalz',
     text:'Landesforsten Rheinland-Pfalz verweist für die aktuelle Waldbrandgefahr auf den DWD-Waldbrandgefahrenindex. Unabhängig von der Gefahrenstufe sind Rauchen und offenes Feuer im Wald grundsätzlich verboten. Trek & Sleep zeigt eine konkrete WBI-Stufe nur dann als amtlich an, wenn eine belastbare lokale Zuordnung vorliegt.',
     source:'Landesforsten Rheinland-Pfalz',
     url:'https://www.wald.rlp.de/bewahren/waldschutz-schutz-vor-gegenspielern/waldbrand'
   };
 }
 return null;
}


function weatherFireScorePoint(h){
 // Conservative non-official route-weather indicator.
 // This is not presented as DWD WBI.
 let score=1;
 if(h.temp>=25 && h.rain<0.2)score=Math.max(score,2);
 if(h.temp>=28 && h.rain<0.1 && h.wind>=15)score=Math.max(score,3);
 if(h.temp>=32 && h.rain<0.1 && h.gust>=30)score=Math.max(score,4);
 if(h.temp>=35 && h.rain<0.1 && h.gust>=40)score=Math.max(score,5);
 return score;
}

function routeWeatherFireIndicator(){
 if(!routeHazards?.length && !weatherSnapshot)return null;
 const scores=[];
 routeHazards.forEach(h=>scores.push(weatherFireScorePoint(h)));
 if(weatherSnapshot && !weatherSnapshot.error){
   scores.push(weatherFireScorePoint({
     temp:Number(weatherSnapshot.temperature_2m||0),
     rain:Number(weatherSnapshot.precipitation||0),
     wind:Number(weatherSnapshot.wind_speed_10m||0),
     gust:Number(weatherSnapshot.wind_gusts_10m||0)
   }));
 }
 if(!scores.length)return null;
 return Math.max(...scores);
}

function fireLevelText(level){
 return ({1:'sehr gering',2:'gering',3:'mittel',4:'hoch',5:'sehr hoch'})[level]||'unbekannt';
}

async function loadRegionalFireRisk(){
 // V1.7 combines three layers:
 // 1) official local DWD-WBI if a valid local assignment exists,
 // 2) official regional rules from the state/forestry authority,
 // 3) a clearly-labelled weather-only route tendency if no local WBI is available.
 const guidance=regionalFireGuidance();
 const weatherLevel=routeWeatherFireIndicator();

 if(fireDanger?.localMatch && Number(fireDanger.level)>=1){
   regionalFireRisk={
     level:Number(fireDanger.level),
     label:fireLevelText(Number(fireDanger.level)),
     official:true,
     source:'DWD WBI · lokal zugeordnet',
     basis:'Lokale DWD-WBI-Zuordnung',
     note:fireDanger.text,
     rules:guidance?.text||'Örtliche Feuer- und Waldregeln beachten.'
   };
   return;
 }

 regionalFireRisk={
   level:weatherLevel||null,
   label:weatherLevel?fireLevelText(weatherLevel):'nicht bestimmbar',
   official:false,
   source:guidance?.source||'Wetterbasierte Streckenbewertung',
   basis:guidance?'Amtliche Landesregel + Wettertendenz':'Wettertendenz entlang der Route',
   note:weatherLevel
      ?`Keine belastbare lokale DWD-WBI-Stufe verfügbar. Die wetterbasierte Streckentendenz entspricht ungefähr Stufe ${weatherLevel}/5 und ist ausdrücklich keine amtliche WBI-Stufe.`
      :'Keine belastbare lokale DWD-WBI-Stufe und keine ausreichenden Wetterdaten verfügbar.',
   rules:guidance?.text||'Örtliche Feuer- und Waldregeln prüfen.'
 };
}

function regionalFireCardHtml(){
 const r=regionalFireRisk;
 if(!r)return '';
 const cls=r.level>=4?'high':r.level===3?'medium':'';
 const levelText=r.level?`Stufe ${r.level}/5 · ${r.label}`:'keine lokale Stufe';
 return `<div class="fireRegionalCard ${cls}">
   <div class="fireRegionalHead">
     <div>
       <b>🔥 Waldbrandlage entlang der Tour</b>
       <small>${escapeHtml(r.basis||'Regionale Bewertung')}</small>
     </div>
     <span class="fireRegionalLevel">${escapeHtml(levelText)}</span>
   </div>
   <div class="fireRegionalGrid">
     <div><b>${r.official?'amtlich':'nicht amtlich'}</b><small>Status der Gefahrenstufe</small></div>
     <div><b>${routeGeoContext?.state?escapeHtml(routeGeoContext.state):'Tourregion'}</b><small>Gebiet</small></div>
   </div>
   <div class="fireRegionalNote">${escapeHtml(r.note||'')}</div>
   <div class="fireRegionalNote"><b>Regelhinweis:</b> ${escapeHtml(r.rules||'')}</div>
   <div class="fireRegionalSource">Quelle/Basis: ${escapeHtml(r.source||'')}</div>
 </div>`;
}


function forecastAtOffset(hours){
 const h=weatherForecast;if(!h?.time?.length)return null;
 const target=Date.now()+hours*3600000;let idx=0,best=Infinity;
 h.time.forEach((t,i)=>{const d=Math.abs(new Date(t).getTime()-target);if(d<best){best=d;idx=i}});
 const x={temp:Number(h.temperature_2m?.[idx]||0),rainProb:Number(h.precipitation_probability?.[idx]||0),rain:Number((h.precipitation||h.rain)?.[idx]||0),code:Number(h.weather_code?.[idx]||0),wind:Number(h.wind_speed_10m?.[idx]||0),gust:Number(h.wind_gusts_10m?.[idx]||0)};
 return {...x,...hazardSeverity(x),time:h.time[idx]};
}
function temporalSafetyHtml(){
 const slots=[{h:0,l:'Jetzt'},{h:6,l:'In 6 Std.'},{h:12,l:'In 12 Std.'},{h:24,l:'Morgen'}];
 if(!weatherForecast)return `<div class="timeSafety"><div class="timeSafetyHead"><b>⏱ Sicherheitsprognose</b><small>zeitlicher Verlauf</small></div><div class="timeNoData">Prognosedaten derzeit nicht verfügbar.</div></div>`;
 const cards=slots.map(o=>{const f=forecastAtOffset(o.h);if(!f)return '';
   let cls='good',icon='🟢',txt='unauffällig';if(f.level>=3){cls='critical';icon='🔴';txt='kritisch'}else if(f.level>=2){cls='attention';icon='🟡';txt='beachten'};
   return `<div class="timeSlot ${cls}"><b>${icon} ${o.l}</b><strong>${txt}</strong><small>${Math.round(f.temp)} °C · Böen ${Math.round(f.gust)} km/h · Regen ${Math.round(f.rainProb)} %</small></div>`;
 }).join('');
 return `<div class="timeSafety"><div class="timeSafetyHead"><b>⏱ Sicherheitsprognose</b><small>Wetterentwicklung am Tourbereich</small></div><div class="timeSlots">${cards}</div><div class="timeHint">Die Zeitprognose ergänzt amtliche Warnungen. Sie ersetzt keine DWD-Warnung und wird bei neuen Wetterdaten aktualisiert.</div></div>`;
}
function tourSafetyVerdict(){
 const warnings=(liveWarnings||[]).filter(w=>!w.error);
 const hazards=hazardsAhead();
 const maxWarn=warnings.reduce((m,w)=>Math.max(m,Number(w.level)||0),0);
 const maxHaz=hazards.reduce((m,h)=>Math.max(m,Number(h.level)||0),0);
 const fire=regionalFireRisk;
 let score=0;
 if(maxWarn>=4)score+=5; else if(maxWarn===3)score+=4; else if(maxWarn===2)score+=2; else if(maxWarn===1)score+=1;
 if(maxHaz>=3)score+=3; else if(maxHaz===2)score+=1;
 if(fire?.official && fire.level>=5)score+=4; else if(fire?.official && fire.level===4)score+=3; else if(fire?.official && fire.level===3)score+=1;
 if(Number(weatherSnapshot?.wind_gusts_10m||0)>=70)score+=3; else if(Number(weatherSnapshot?.wind_gusts_10m||0)>=50)score+=1;
 let state='good',label='Tourlage: gut',icon='🟢',advice='Aktuell sind keine erhöhten Gefahren für die geplante Route erkannt. Wetter und amtliche Hinweise unterwegs trotzdem weiter beobachten.';
 if(score>=5){state='critical';label='Tourlage: kritisch';icon='🔴';advice='Für die Route liegen deutliche Risikosignale vor. Details unten prüfen und die Tour gegebenenfalls verschieben, verkürzen oder anpassen.';}
 else if(score>=2){state='attention';label='Erhöhte Aufmerksamkeit';icon='🟡';advice='Es gibt relevante Hinweise entlang der Route. Prüfe die betroffenen Abschnitte und behalte Aktualisierungen während der Tour im Blick.';}
 const factors=[];
 factors.push({t:warnings.length?`${warnings.length} DWD-Warnung${warnings.length===1?'':'en'}`:'DWD: keine relevante Warnung',c:maxWarn>=3?'bad':maxWarn?'warn':''});
 factors.push({t:hazards.length?`${hazards.length} Strecken-Wetterhinweis${hazards.length===1?'':'e'}`:'Streckenwetter: unauffällig',c:maxHaz>=3?'bad':maxHaz?'warn':''});
 factors.push({t:fire?.official&&fire.level?`WBI ${fire.level}/5 amtlich`:'Waldbrand: lokal nicht vollständig bewertbar',c:fire?.official&&fire.level>=4?'bad':fire?.official&&fire.level===3?'warn':'unknown'});
 return {state,label,icon,advice,factors};
}
function safetyVerdictHtml(){
 const v=tourSafetyVerdict();
 return `<div class="safetyVerdict ${v.state}"><div class="safetyVerdictHead"><b>${v.icon} ${v.label}</b><span class="safetyVerdictBadge">${v.state==='good'?'OK':v.state==='attention'?'PRÜFEN':'ACHTUNG'}</span></div><p>${escapeHtml(v.advice)}</p><div class="safetyFactors">${v.factors.map(f=>`<span class="safetyFactor ${f.c}">${escapeHtml(f.t)}</span>`).join('')}</div></div>`;
}


function stagePoints(){
 if(!route?.length)return [];
 const last=route.length-1;
 const stages=[
   {key:'start',label:'Start',idx:0,progress:0},
   {key:'mid',label:'Streckenmitte',idx:Math.round(last/2),progress:0.5},
   {key:'finish',label:'Ziel',idx:last,progress:1}
 ];
 return stages.map(s=>({...s,point:route[s.idx],alongKm:routeCum[s.idx]||0}));
}

function weatherRiskLevel(x){
 let level=0,reasons=[];
 const gust=Number(x.gust||0),rainProb=Number(x.rainProb||0),rain=Number(x.rain||0),temp=Number(x.temp||0),code=Number(x.code||0);
 if(gust>=65){level=Math.max(level,3);reasons.push('starke Sturmböen')}
 else if(gust>=45){level=Math.max(level,2);reasons.push('starke Böen')}
 if([95,96,99].includes(code)){level=Math.max(level,3);reasons.push('Gewitter')}
 else if(rainProb>=80&&rain>=4){level=Math.max(level,3);reasons.push('Starkregen')}
 else if(rainProb>=60&&rain>=2){level=Math.max(level,2);reasons.push('kräftiger Regen')}
 if(temp>=32){level=Math.max(level,2);reasons.push('Hitze')}
 if(temp<=2){level=Math.max(level,2);reasons.push('Kälte')}
 return {level,reasons:[...new Set(reasons)]};
}

async function fetchForecastAt(lat,lon,eta){
 const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,rain,weather_code,wind_speed_10m,wind_gusts_10m&forecast_days=2&timezone=auto`;
 const r=await fetch(url); if(!r.ok)throw Error('Forecast HTTP '+r.status);
 const d=await r.json(),h=d.hourly||{},times=h.time||[];
 let idx=0,best=Infinity;
 times.forEach((t,i)=>{const diff=Math.abs(new Date(t)-eta);if(diff<best){best=diff;idx=i}});
 const x={
   temp:Number(h.temperature_2m?.[idx]||0),
   rainProb:Number(h.precipitation_probability?.[idx]||0),
   rain:Number(h.rain?.[idx]||0),
   code:Number(h.weather_code?.[idx]||0),
   wind:Number(h.wind_speed_10m?.[idx]||0),
   gust:Number(h.wind_gusts_10m?.[idx]||0),
   time:times[idx]||''
 };
 return {...x,...weatherRiskLevel(x)};
}

async function loadRouteStageForecast(){
 routeStageForecast=[];startTimeAdvice=null;if(!route?.length)return;
 const stages=stagePoints(),pt=planTimes(),etaMap={start:pt.start,mid:pt.half,finish:pt.finish};
 for(const s of stages){
   const eta=etaMap[s.key]||etaForAlong(s.alongKm);
   try{const f=await fetchForecastAt(s.point[0],s.point[1],eta);routeStageForecast.push({...s,eta:eta.toISOString(),...f});await new Promise(r=>setTimeout(r,120))}catch(e){}
 }
 startTimeAdvice=await computeBestStartAdvice();
}
async function computeBestStartAdvice(){
 if(!route?.length)return null;
 const durationH=(routeCum.at(-1)||0)/Math.max(1,hikingSpeedKmh);
 const ref=route[Math.floor(route.length/2)];
 const url=`https://api.open-meteo.com/v1/forecast?latitude=${ref[0]}&longitude=${ref[1]}&hourly=temperature_2m,precipitation_probability,rain,weather_code,wind_gusts_10m&forecast_days=2&timezone=auto`;
 try{
   const r=await fetch(url);if(!r.ok)throw Error('Startzeit HTTP '+r.status);
   const d=await r.json(),h=d.hourly||{},times=h.time||[];
   const now=new Date();
   const candidates=[];
   for(let offset=0;offset<=12;offset++){
     const candidate=new Date(now.getTime()+offset*3600000);
     let worst=0,reasons=[];
     const checkpoints=[0,0.5,1].map(fr=>new Date(candidate.getTime()+durationH*fr*3600000));
     for(const cp of checkpoints){
       let idx=0,best=Infinity;
       times.forEach((t,i)=>{const diff=Math.abs(new Date(t)-cp);if(diff<best){best=diff;idx=i}});
       const x={
         temp:Number(h.temperature_2m?.[idx]||0),
         rainProb:Number(h.precipitation_probability?.[idx]||0),
         rain:Number(h.rain?.[idx]||0),
         code:Number(h.weather_code?.[idx]||0),
         gust:Number(h.wind_gusts_10m?.[idx]||0)
       };
       const risk=weatherRiskLevel(x);
       worst=Math.max(worst,risk.level);
       reasons.push(...risk.reasons);
     }
     candidates.push({time:candidate,level:worst,reasons:[...new Set(reasons)]});
   }
   candidates.sort((a,b)=>a.level-b.level || a.time-b.time);
   const best=candidates[0];
   const nowRisk=candidates.find(c=>Math.abs(c.time-now)<1800000) || candidates[0];
   return {
     time:best.time.toISOString(),
     level:best.level,
     reasons:best.reasons,
     improvement:Math.max(0,(nowRisk?.level||0)-best.level),
     immediate:Math.abs(best.time-now)<3600000
   };
 }catch(e){
   return null;
 }
}

function routeStageForecastHtml(){
 if(!routeStageForecast.length)return '';
 return `<div class="routeWarningSummary">
   <b>🗺 Wetter entlang deiner Tour</b>
   <small>Start, Streckenmitte und Ziel zur voraussichtlichen Ankunftszeit.</small>
   <div class="routeForecastGrid">
    ${routeStageForecast.map(s=>`<div class="routeForecastCard ${s.level>=3?'high':s.level===2?'medium':''}">
      <div class="routeForecastIcon">${s.key==='start'?'🥾':s.key==='mid'?'🧭':'🏁'}</div>
      <b>${escapeHtml(s.label)}</b>
      <small>gegen ${formatEta(new Date(s.eta))}</small>
      <div class="routeForecastMeta">${Math.round(s.temp)} °C · Böen ${Math.round(s.gust)} km/h · Regen ${Math.round(s.rainProb)} %</div>
      ${s.reasons.length?`<div class="warningBody">${escapeHtml(s.reasons.join(', '))}</div>`:''}
    </div>`).join('')}
   </div>
 </div>`;
}

function startAdviceHtml(){
 const a=startTimeAdvice;
 if(!a)return '';
 const cls=a.level>=3?'high':a.level===2?'medium':'';
 const when=a.immediate?'jetzt':new Date(a.time).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
 const title=a.level===0?'Gute Startbedingungen':a.level===1?'Startzeit unauffällig':a.level===2?'Startzeit mit Vorsicht':'Startzeit kritisch';
 const reason=a.reasons?.length?a.reasons.join(', '):'keine erhöhten Wetterrisiken erkannt';
 return `<div class="startAdvice ${cls}">
   <div class="startAdviceHead">
     <div><b>⏰ Beste Startzeit</b><small>Wettervergleich der nächsten Stunden</small></div>
     <span class="startBadge">${escapeHtml(when)}</span>
   </div>
   <div class="startReason"><b>${escapeHtml(title)}.</b> ${escapeHtml(reason)}.</div>
 </div>`;
}

function openWarningCenter(){
 const w=weatherSnapshot;
 const weatherHtml=w&&!w.error?`
 <div class="warningCard ok">
  <div class="warningTitle"><div><b>🌦 Wetter am Tourbereich</b><small>Live-Wetterdaten</small></div><span class="warningLevel">Aktuell</span></div>
  <div class="weatherGrid">
   <div><b>${Math.round(w.temperature_2m??0)} °C</b><small>Temperatur</small></div>
   <div><b>${Math.round(w.apparent_temperature??0)} °C</b><small>Gefühlt</small></div>
   <div><b>${Math.round(w.wind_speed_10m??0)} km/h</b><small>Wind</small></div>
   <div><b>${Math.round(w.wind_gusts_10m??0)} km/h</b><small>Böen</small></div>
  </div>
 </div>`:`<div class="warningCard medium"><div class="warningTitle"><b>🌦 Wetterdaten</b><span class="warningLevel">nicht geladen</span></div></div>`;

 const dwdHtml=liveWarnings.map(w=>`
 <div class="warningCard ${w.level>=3?'high':w.level>=2?'medium':w.error?'medium':'ok'}">
  <div class="warningTitle"><div><b>⚠ ${escapeHtml(w.title)}</b><small>${escapeHtml(w.region||'DWD')}</small></div><span class="warningLevel">${w.error?'offline':'Stufe '+w.level}</span></div>
  <div class="warningBody">${escapeHtml((w.text||'').slice(0,500))}</div>
  ${w.error?'':'<span class="warningRegionMatch">✓ Tourgebiet</span>'}
 </div>`).join('');


 const upcomingHazards=hazardsAhead();
 const hazardHtml=upcomingHazards.length?upcomingHazards.map(h=>`
 <div class="hazardCard ${h.level>=3?'high':'medium'}">
   <div class="warningTitle"><div><b>⚠ ${escapeHtml(h.types.join(' / '))}</b><small>Wetterpunkt entlang deiner GPX-Route</small></div><span class="warningLevel">${h.level>=3?'hoch':'erhöht'}</span></div>
   <div class="hazardRouteInfo">Streckenposition: km ${h.alongKm.toFixed(1)}</div>
   <div class="hazardDistance">${h.aheadKm<1?Math.round(h.aheadKm*1000)+' m':h.aheadKm.toFixed(1)+' km'} voraus</div>
   <div class="hazardTime">voraussichtlich gegen ${formatEta(new Date(h.eta))}</div>
   <span class="etaTag">Prognose zur Ankunftszeit</span>
   <div class="weatherGrid"><div><b>${Math.round(h.gust)} km/h</b><small>Böen</small></div><div><b>${Math.round(h.rainProb)} %</b><small>Regenrisiko</small></div><div><b>${h.rain.toFixed(1)} mm</b><small>Regen/h</small></div><div><b>${Math.round(h.temp)} °C</b><small>Temperatur</small></div></div>
 </div>`).join(''):`<div class="warningCard ok"><div class="warningTitle"><div><b>✓ Keine erhöhte Wettergefahr entlang der Route</b><small>mehrere Punkte der GPX-Strecke geprüft</small></div><span class="warningLevel">OK</span></div></div>`;

 const regionalFire=regionalFireGuidance();
 const fd=fireDanger;
 const fireClass=fd?.level>=4?'high':fd?.level===3?'medium':'ok';
 const scale=fd?.level?`<div class="wbiScale">${[1,2,3,4,5].map(n=>`<div class="wbiStep ${n===fd.level?'active':''}" data-level="${n}">${n}<br><small>${['','sehr gering','gering','mittel','hoch','sehr hoch'][n]}</small></div>`).join('')}</div>`:'';
 const fireHtml=`<div class="warningCard ${fireClass} wbiCard">
  <div class="warningTitle">
   <div><b>🔥 Waldbrandgefahr</b><small>${escapeHtml(fd?.source||'DWD WBI')}</small></div>
   <span class="warningLevel">${escapeHtml(fd?.tendency||'Prüfen')}</span>
  </div>
  ${fd?.official?`<span class="wbiOfficial">✓ offizieller DWD-WBI</span>`:''}
  <div class="warningBody">${escapeHtml(fd?.text||'Noch nicht geladen.')}</div>
  ${scale}
  ${fd?.advice?`<div class="wbiAdvice"><b>Für deine Tour:</b> ${escapeHtml(fd.advice)}</div>`:''}
  ${fd?.station?`<div class="wbiMeta">Bezugsstation: ${escapeHtml(fd.station)} · ${fd.distanceKm.toFixed(1)} km zur Route${fd.date?' · Stand '+escapeHtml(fd.date):''}${fd.state?' · '+escapeHtml(fd.state):''}</div>`:''}
  ${fd?.sampleCount?`<div class="wbiRouteSamples">Für die Zuordnung wurden ${fd.sampleCount} Punkte entlang deiner GPX-Route berücksichtigt.${fd.localMatch?' Nur ausreichend nahe Stationen wurden verwendet.':' Keine ausreichend nahe Station wurde als lokal akzeptiert.'}</div>`:''}
  ${fd?.localMatch===false?`<div class="wbiDistanceWarn">Eine weit entfernte WBI-Station wird bewusst nicht mehr als lokale Waldbrandstufe angezeigt.</div>`:''}
 </div>`;

 const routeWarnings=liveWarnings.filter(w=>!w.error);
 const areaLabel=[routeGeoContext.county,routeGeoContext.city,routeGeoContext.state].filter(Boolean).join(' · ')||'Tourbereich';
 const geoTokens=routeAdminTokens();
 const summaryClass=routeWarnings.length?'routeWarningSummary alert':'routeWarningSummary';
 const summaryText=routeWarnings.length
   ?`${routeWarnings.length} amtliche DWD-Warnung${routeWarnings.length===1?'':'en'} passen zum Gebiet deiner Route.`
   :'Keine passende amtliche DWD-Warnung für den erkannten Tourbereich.';

 $('#modalBody').innerHTML=`<span class="tag">⚠ Warncenter · V2.4.1</span><h2>Tour-Sicherheitscenter</h2>${safetyVerdictHtml()}${temporalSafetyHtml()}
 <div class="${summaryClass}">
   <b>${summaryText}</b>
   <small>Deutschlandweite Warnungen werden ausgeblendet.</small>
   <span class="routeAreaTag">${escapeHtml(areaLabel)}</span>
   <div class="geoDebug">Geo-Filter aktiv: ${geoTokens.length?geoTokens.map(x=>escapeHtml(x)).join(' · '):'keine verwertbaren Gebietskennungen'}</div>
 </div>
 ${`<div class="planSummary"><b>🗓 Geplanter Tourverlauf</b><small>${Number(tourPlan.speed||4).toFixed(1).replace('.',',')} km/h · ${Number(tourPlan.pauseMinutes||0)} Min. Pause</small>${plannerTimelineHtml()}<span class="planStatus">Wetterprognose nutzt diese Zeiten</span></div>`}
 ${startAdviceHtml()}
 ${routeStageForecastHtml()}
 ${liveStageHtml()}
 ${stagePlannerHtml(window.__stageWeather||[])}
 <div class="${upcomingHazards.length?'hazardSummary alert':'hazardSummary'}"><b>${upcomingHazards.length?`${upcomingHazards.length} Wetterhinweis${upcomingHazards.length===1?'':'e'} entlang der Route`:'Keine erhöhte Wettergefahr entlang der Route erkannt'}</b><small>Mehrere Punkte deiner GPX-Strecke werden ausgewertet.</small></div>
 <div class="warningCenter">${weatherHtml}${dwdHtml||'<div class="warningCard ok"><div class="warningTitle"><div><b>✓ Keine relevante DWD-Warnung</b><small>für den erkannten Tourbereich</small></div><span class="warningLevel">OK</span></div></div>'}${hazardHtml}${regionalFireCardHtml()}</div>
 <div class="warning">DWD-Wetterwarnungen werden mit einem strengen Kreis-/Ortsabgleich auf den Tourbereich gefiltert. Die Waldbrandlage wird in V2.4.1 flächenbezogen entlang der GPX-Route bewertet und klar zwischen amtlicher WBI-Stufe, amtlicher Landesregel und nichtamtlicher Wettertendenz getrennt. Der Waldbrandgefahrenindex wird aus aktuellen DWD-Indexdaten regional zur GPX-Route zugeordnet. Weit entfernte Stationen werden nicht als lokal verwendet. Der WBI beschreibt das meteorologische Gefahrenpotenzial; örtliche Behörden können abweichende Regeln oder Warnstufen festlegen.</div>
 <button id="refreshWarningModal" class="refreshWarnings">Warnungen aktualisieren</button>`;
 $('#modal').classList.remove('hidden');
 $('#refreshWarningModal').onclick=async()=>{await refreshWarnings();openWarningCenter()};
 if($('#regionalFireSource')&&regionalFire){
   $('#regionalFireSource').onclick=()=>window.open(regionalFire.url,'_blank');
 }
}

function importGPX(e){
 const f=e.target.files[0];
 if(!f)return;
 const rd=new FileReader();
 rd.onload=()=>{
   try{
     const xml=new DOMParser().parseFromString(rd.result,'text/xml');
     if(xml.querySelector('parsererror'))throw Error('GPX-Datei konnte nicht gelesen werden');
     let nodes=[...xml.querySelectorAll('trkpt')];
     if(nodes.length<2)nodes=[...xml.querySelectorAll('rtept')];
     const rawPts=nodes.map(n=>({
       p:[Number(n.getAttribute('lat')),Number(n.getAttribute('lon'))],
       ele:n.querySelector('ele')?Number(n.querySelector('ele').textContent):null
     })).filter(x=>Number.isFinite(x.p[0])&&Number.isFinite(x.p[1]));

     if(rawPts.length<2)throw Error('Keine Trackpunkte gefunden');
     const step=Math.max(1,Math.floor(rawPts.length/2200));
     const sampled=rawPts.filter((_,i)=>i%step===0 || i===rawPts.length-1);
     const elevations=normalizeElevationArray(sampled.map(x=>x.ele));
     elevationDataSource=usableElevationData(elevations)?'gpx':'none';

     setRoute(sampled.map(x=>x.p),f.name.replace(/\.gpx$/i,''),true,elevations);
     $('#poiState').textContent='GPX gespeichert · POIs neu laden';

     if(!usableElevationData(routeEle)){
       ensureElevationData(false).then(ok=>{
         if(ok)$('#routeMeta').textContent=`${routeCum.at(-1).toFixed(1)} km · Höhenprofil verfügbar`;
       });
     }
   }catch(err){
     alert('GPX-Fehler: '+err.message);
   }
 };
 rd.readAsText(f);
}

function bbox(){
 const lats=route.map(x=>x[0]),lons=route.map(x=>x[1]),pad=.018;
 return [Math.min(...lats)-pad,Math.min(...lons)-pad,Math.max(...lats)+pad,Math.max(...lons)+pad];
}

function routeCacheKey(){
 const [s,w,n,e]=bbox();
 return `trek_sleep_v05_pois_${s.toFixed(3)}_${w.toFixed(3)}_${n.toFixed(3)}_${e.toFixed(3)}_${route.length}`;
}

function restorePoiCache(){
 try{
   const raw=localStorage.getItem(routeCacheKey());
   if(!raw)return false;
   const x=JSON.parse(raw);
   if(Date.now()-(x.ts||0)>7*24*3600*1000)return false;
   allPois=x.pois||[];
   recalcPoiMetrics();
   $('#poiState').textContent=`${allPois.length} POIs aus Cache`;
   return true;
 }catch(e){return false}
}

function savePoiCache(){
 try{
   const clean=allPois.map(({off,along,direction,score,...rest})=>rest);
   localStorage.setItem(routeCacheKey(),JSON.stringify({ts:Date.now(),pois:clean}));
 }catch(e){}
}

async function fetchWithTimeout(url,opts={},timeout=18000){
 const ctrl=new AbortController();
 const t=setTimeout(()=>ctrl.abort(),timeout);
 try{return await fetch(url,{...opts,signal:ctrl.signal})}
 finally{clearTimeout(t)}
}

async function loadPois(force=false){
 if(!route.length)return [];
 if(!force && restorePoiCache()){renderPois();return allPois}

 $('#poiList').innerHTML='<div class="loading">Echte OSM-Punkte werden geladen …</div>';

 const [s,w,n,e]=bbox();
 const q=`[out:json][timeout:25];
 (
 nwr["amenity"="drinking_water"](${s},${w},${n},${e});
 nwr["natural"="spring"](${s},${w},${n},${e});
 nwr["man_made"="water_well"](${s},${w},${n},${e});
 nwr["tourism"="wilderness_hut"](${s},${w},${n},${e});
 nwr["amenity"="shelter"](${s},${w},${n},${e});
 nwr["tourism"="camp_site"](${s},${w},${n},${e});
 nwr["tourism"="camp_pitch"](${s},${w},${n},${e});
 nwr["amenity"="parking"](${s},${w},${n},${e});
 nwr["highway"="emergency_access_point"](${s},${w},${n},${e});
 );
 out center tags;`;

 let lastErr=null;

 for(let i=0;i<OVERPASS_ENDPOINTS.length;i++){
   $('#poiState').textContent=`Server ${i+1}/${OVERPASS_ENDPOINTS.length} …`;
   try{
     const res=await fetchWithTimeout(OVERPASS_ENDPOINTS[i],{
       method:'POST',
       headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
       body:'data='+encodeURIComponent(q)
     });
     if(!res.ok)throw Error('HTTP '+res.status);
     const data=await res.json();

     const osmPois=(data.elements||[]).map(osmToPoi).filter(Boolean);
     allPois=[...osmPois,...LEGAL_DEMO];
     recalcPoiMetrics();
     allPois=allPois.filter(p=>p.off<=3.0);

     savePoiCache();
     $('#poiState').textContent=`${allPois.length} Punkte · präzise Route · Server ${i+1}`;
     renderPois();
     return allPois;
   }catch(err){lastErr=err}
 }

 if(restorePoiCache()){
   $('#poiState').textContent='Live fehlgeschlagen · Cache aktiv';
   renderPois();
   return allPois;
 }

 $('#poiState').textContent='Alle Server fehlgeschlagen';
 $('#poiList').innerHTML=`<div class="empty"><b>Live-Abfrage derzeit nicht erreichbar.</b><br><br>${escapeHtml(lastErr?.message||'Unbekannt')}<br><br>Bereits geladene Daten bleiben künftig lokal gespeichert.</div>`;
 return [];
}

function osmToPoi(x){
 const t=x.tags||{};
 const lat=x.lat??x.center?.lat,lon=x.lon??x.center?.lon;
 if(!isFinite(lat)||!isFinite(lon))return null;

 let type=null;
 if(t.amenity==='drinking_water')type='drinking_water';
 else if(t.natural==='spring'||t.man_made==='water_well')type='water_source';
 else if(t.tourism==='wilderness_hut'||t.amenity==='shelter')type='shelter';
 else if(t.tourism==='camp_site'||t.tourism==='camp_pitch')type='camp';
 else if(t.amenity==='parking')type='parking';
 else if(t.highway==='emergency_access_point')type='emergency';
 if(!type)return null;

 if(type==='water_source' && (t.drinking_water==='yes'||t.potable==='yes'))type='drinking_water';

 const defaultName={
   drinking_water:'Trinkwasser',
   water_source:'Quelle / Wasserstelle',
   shelter:'Schutzhütte',
   camp:'Camping-/Trekkingplatz',
   parking:'Parkplatz',
   emergency:'Rettungspunkt'
 }[type];

 return {id:`${x.type}/${x.id}`,type,name:t.name||defaultName,lat,lon,tags:t};
}

function recalcPoiMetrics(){
 const userAlong=userPosition?nearestOnRoute(userPosition).along:null;

 allPois=allPois.map(p=>{
   const n=nearestOnRoute([p.lat,p.lon]);
   let direction='unknown';
   if(userAlong!=null){
     const delta=n.along-userAlong;
     direction=Math.abs(delta)<.25?'near':(delta>0?'ahead':'behind');
   }
   const base=TYPE[p.type]?.base||1;
   const detour=n.off*2;
   let score=base-(detour*2.2);
   if(direction==='ahead')score+=4;
   if(direction==='near')score+=2;
   if(direction==='behind')score-=8;
   if(p.type==='drinking_water')score+=2;
   if(p.type==='emergency')score+=3;
   return {...p,off:n.off,along:n.along,direction,score,projected:n.point};
 });

 allPois.sort((a,b)=>b.score-a.score || a.along-b.along);
}

function renderPois(){
 renderMapTourStatus();
 clusterLayer.clearLayers();

 let arr=allPois.filter(p=>filter==='all'||p.type===filter);
 const userAlong=userPosition?nearestOnRoute(userPosition).along:null;

 $('#poiList').innerHTML=arr.length
 ? arr.slice(0,70).map((p,i)=>{
   const m=TYPE[p.type],det=p.off*2;
   let dir='';
   if(userAlong!=null){
     const label=p.direction==='ahead'?'VOR DIR':p.direction==='behind'?'HINTER DIR':'IN DEINER NÄHE';
     dir=`<span class="direction ${p.direction}">${label}</span>`;
   }
   const waterNote=waterStatusText(p);
   return `<div class="poi" data-i="${i}">
     <div class="ico">${m.icon}</div>
     <div>
       <b>${escapeHtml(p.name)}</b>
       <small>${m.label} · ${p.off<.05?'direkt an Route':Math.round(p.off*1000)+' m abseits'}</small>
       ${waterNote?`<small class="${p.type==='drinking_water'?'water-safe':'water-unknown'}">${waterNote}</small>`:''}
       ${dir}
     </div>
     <div class="dist">
       ${p.along.toFixed(1)} km
       <span class="detour">+${det.toFixed(1)} km</span>
       <span class="score">Relevanz ${Math.max(0,p.score).toFixed(0)}</span>
     </div>
   </div>`;
 }).join('')
 : '<div class="empty">Keine passenden Punkte. Tippe auf <b>POIs laden</b>.</div>';

 arr.slice(0,120).forEach(p=>{
   const m=L.marker([p.lat,p.lon],{title:p.name});
   m.on('click',()=>showPoi(p));
   clusterLayer.addLayer(m);
 });

 $$('.poi[data-i]').forEach(el=>el.onclick=()=>showPoi(arr[+el.dataset.i]));
}

function waterStatusText(p){
 if(p.type==='drinking_water')return 'OSM als Trinkwasser gekennzeichnet';
 if(p.type==='water_source'){
   if(p.tags?.drinking_water==='no'||p.tags?.potable==='no')return 'Nicht als Trinkwasser geeignet markiert';
   return 'Trinkbarkeit nicht bestätigt';
 }
 return '';
}

function showPoi(p){
 const m=TYPE[p.type],t=p.tags||{},det=p.off*2;
 let extra='';

 if(p.type==='legal'){
   const l=p.legal||{};
   extra=`<div class="legalBox">
     <div class="legalHead">⚖ Rechtslage · Demo</div>
     <div class="legalRow"><span>Zelt</span><b>${escapeHtml(l.tent||'Unklar')}</b></div>
     <div class="legalRow"><span>Hängematte</span><b>${escapeHtml(l.hammock||'Unklar')}</b></div>
     <div class="legalRow"><span>Biwak</span><b>${escapeHtml(l.bivouac||'Unklar')}</b></div>
     <div class="legalRow"><span>Feuer</span><b>${escapeHtml(l.fire||'Unklar')}</b></div>
   </div>
   <div class="warning">Dieser Rechts-Layer ist in V1.7 nur die technische Struktur. Noch keine amtlich verifizierte Rechtsauskunft.</div>`;
 }else{
   extra=`<div class="warning">OpenStreetMap ist Community-Datenquelle. Wasserqualität, Zugänglichkeit, Rettungsfunktion und Übernachtungserlaubnis müssen bei sicherheits- oder rechtsrelevanter Nutzung separat geprüft werden.</div>`;
 }

 $('#modalBody').innerHTML=`
 <span class="tag">${m.icon} ${m.label}</span>
 <h2>${escapeHtml(p.name)}</h2>
 <div class="detail"><span>Position auf Route</span><b>${p.along.toFixed(2)} km</b></div>
 <div class="detail"><span>Abstand zur Route</span><b>${Math.round(p.off*1000)} m</b></div>
 <div class="detail"><span>Geschätzter Hin-/Rück-Umweg</span><b>+${det.toFixed(2)} km</b></div>
 ${userPosition?`<div class="detail"><span>Relativ zu dir</span><b>${p.direction==='ahead'?'Vor dir':p.direction==='behind'?'Hinter dir':'In deiner Nähe'}</b></div>`:''}
 ${p.type==='drinking_water'||p.type==='water_source'?`<div class="detail"><span>Wasserstatus</span><b>${escapeHtml(waterStatusText(p))}</b></div>`:''}
 ${t.access?`<div class="detail"><span>Zugang</span><b>${escapeHtml(t.access)}</b></div>`:''}
 ${t.ref?`<div class="detail"><span>Referenz</span><b>${escapeHtml(t.ref)}</b></div>`:''}
 ${extra}
 <div class="source">${p.type==='legal'?'Quelle: Demo-Rechtsdatensatz':'Quelle: OpenStreetMap · OSM-ID '+escapeHtml(p.id)}</div>`;

 $('#modal').classList.remove('hidden');
}




function cleanPoisForStorage(pois){
 return (pois||[]).map(({off,along,direction,score,projected,...rest})=>rest);
}

function poiStats(pois){
 const s={drinking_water:0,water_source:0,shelter:0,camp:0,parking:0,emergency:0,legal:0};
 (pois||[]).forEach(p=>{if(s[p.type]!==undefined)s[p.type]++});
 return s;
}

async function ensurePoisForOffline(){
 if(allPois.length){
   return cleanPoisForStorage(allPois);
 }
 if(restorePoiCache() && allPois.length){
   return cleanPoisForStorage(allPois);
 }
 const loaded=await loadPois(false);
 return cleanPoisForStorage(loaded||allPois||[]);
}

function savedTours(){
 try{return JSON.parse(localStorage.getItem('trek_sleep_tours_v09')||localStorage.getItem('trek_sleep_tours_v07')||'[]')}
 catch(e){return []}
}
function saveTours(x){
 localStorage.setItem('trek_sleep_tours_v09',JSON.stringify(x));
 /* Keep backwards compatibility with V0.7/V0.8 while testing on the same origin. */
 try{localStorage.setItem('trek_sleep_tours_v07',JSON.stringify(x))}catch(e){}
}

async function saveCurrentTour(){
 if(!route.length)return;
 $('#modalBody').innerHTML=`<div class="savingOverlay"><span class="tag">📥 Offline · V3.6.0</span><h2>Tour wird vorbereitet</h2><b>POIs werden automatisch gesichert …</b><span class="muted">Du musst „POIs laden“ vorher nicht mehr antippen.</span></div>`;
 $('#modal').classList.remove('hidden');

 let offlinePois=[];
 try{offlinePois=await ensurePoisForOffline()}catch(e){offlinePois=[]}

 const stats=poiStats(offlinePois);
 let tours=savedTours();
 const name=$('#routeName').textContent||'Gespeicherte Tour';
 const existing=tours.find(t=>t.name===name);

 const item={
   id:existing?.id||('tour_'+Date.now()),
   name,
   points:route,
   km:routeCum.at(-1)||0,
   savedAt:existing?.savedAt||new Date().toISOString(),
   updatedAt:new Date().toISOString(),
   pois:offlinePois,
   poiCount:offlinePois.length,
   poiStats:stats,
   legalData:LEGAL_DEMO,
   offline:true,
   offlineMode:'route+pois+legal+app',
   offlineSavedAt:new Date().toISOString()
 };

 tours=tours.filter(t=>t.name!==name);
 tours.unshift(item);
 tours=tours.slice(0,20);
 saveTours(tours);

 $('#saveTourBtn').textContent='♥';

 const pct=offlinePois.length?100:75;
 $('#modalBody').innerHTML=`<span class="tag">✓ Offline gespeichert · V3.6.0</span>
 <h2>${escapeHtml(name)}</h2>
 <div class="offlineCheck">
   <div class="offlineCheckTitle"><span>Offline-Bereitschaft</span><strong class="${offlinePois.length?'offlineReady':'offlineWarn'}">${pct}%</strong></div>
   <div class="offlineProgress"><i style="width:${pct}%"></i></div>
   <small>${offlinePois.length?`${offlinePois.length} POIs wurden automatisch zusammen mit der Tour gesichert.`:'Route und App sind gespeichert. POIs konnten bei dieser Speicherung nicht online geladen werden.'}</small>
 </div>
 <div class="poiOfflineSummary">
   <span>💧 Trinkwasser <b>${stats.drinking_water}</b></span>
   <span>🌊 Quellen <b>${stats.water_source}</b></span>
   <span>🏠 Hütten <b>${stats.shelter}</b></span>
   <span>⛺ Schlaf <b>${stats.camp}</b></span>
   <span>✚ Rettung <b>${stats.emergency}</b></span>
   <span>⚖ Recht <b>${stats.legal}</b></span>
 </div>
 <div class="warning">Kartenkacheln bleiben weiterhin ausgenommen. V3.6.0 speichert Route, POIs, Rechtsdaten und App-Oberfläche offline.</div>`;
}

function openTourLibrary(){
 const tours=savedTours();
 $('#modalBody').innerHTML=`<span class="tag">↗ Touren · V3.6.0</span><h2>Meine Touren</h2>
 ${tours.length?tours.map(t=>{
   const ready=(t.points?.length&&t.pois?.length)?'✓ Offline bereit':'◐ Offline teilweise';
   const cls=(t.points?.length&&t.pois?.length)?'offlineBadge':'offlineBadge partial';
   return `<div class="tourCard">
     <div class="tourTop"><div>
       <b>${escapeHtml(t.name)}</b>
       <div class="tourMeta">${(+t.km).toFixed(1)} km · ${t.poiCount||t.pois?.length||0} Offline-POIs</div>
       <div class="tourOverview">
        <div class="tourMetric"><b>${t.poiStats?.drinking_water||0}</b><small>Trinkwasser</small></div>
        <div class="tourMetric"><b>${t.poiStats?.emergency||0}</b><small>Rettung</small></div>
       </div>
       <span class="${cls}">${ready}</span>
     </div><span>📱</span></div>
     <div class="tourActions">
       <button class="openTour" data-id="${t.id}">Öffnen</button>
       <button class="offlineTour" data-id="${t.id}">Offline</button>
       <button class="deleteTour" data-id="${t.id}">Löschen</button>
     </div>
   </div>`;
 }).join(''):'<div class="empty">Noch keine Tour gespeichert. Öffne eine GPX-Datei und tippe auf ♡.</div>'}
 <div class="warning">V1.7 sichert beim Speichern automatisch die POIs entlang der Route. Ein vorheriges manuelles Laden ist nicht mehr nötig.</div>`;

 $('#modal').classList.remove('hidden');
 $$('.openTour').forEach(b=>b.onclick=()=>loadSavedTour(b.dataset.id));
 $$('.offlineTour').forEach(b=>b.onclick=()=>openOfflineManager(b.dataset.id));
 $$('.deleteTour').forEach(b=>b.onclick=()=>deleteSavedTour(b.dataset.id));
}

function loadSavedTour(id){
 const t=savedTours().find(x=>x.id===id);
 if(!t)return;

 setRoute(t.points,t.name,true);

 if(Array.isArray(t.pois)&&t.pois.length){
   allPois=t.pois;
   recalcPoiMetrics();
   updateNavigationStatus();
   updateTurnInstruction();
   refreshWarnings();
   renderPois();
   $('#poiState').textContent=`${allPois.length} Offline-POIs aus Tour`;
   updateNavigationStatus();
 }

 $('#modal').classList.add('hidden');
 $('#saveTourBtn').textContent='♥';
}

function deleteSavedTour(id){
 saveTours(savedTours().filter(x=>x.id!==id));
 openTourLibrary();
}

async function prepareOfflineTour(id){
 let tours=savedTours();
 const t=tours.find(x=>x.id===id);
 if(!t)return;

 /* Load the selected route temporarily, then fetch/cache its POIs. */
 const oldRoute=route;
 const oldName=$('#routeName').textContent;
 setRoute(t.points,t.name,true);

 let pois=[];
 try{pois=await ensurePoisForOffline()}catch(e){pois=[]}
 const clean=cleanPoisForStorage(pois);
 t.pois=clean;
 t.poiCount=clean.length;
 t.poiStats=poiStats(clean);
 t.legalData=LEGAL_DEMO;
 t.offline=true;
 t.offlineMode='route+pois+legal+app';
 t.offlineSavedAt=new Date().toISOString();
 saveTours(tours);

 openOfflineManager(id);
}

function offlineChecks(t){
 return {
   route:!!(t.points?.length),
   pois:!!(t.pois?.length),
   legal:!!(t.legalData?.length),
   app:('serviceWorker' in navigator)
 };
}

function openOfflineManager(id){
 const t=savedTours().find(x=>x.id===id);
 if(!t)return;

 const c=offlineChecks(t);
 const passed=Object.values(c).filter(Boolean).length;
 const pct=Math.round((passed/4)*100);
 const stats=t.poiStats||poiStats(t.pois||[]);

 $('#modalBody').innerHTML=`<span class="tag">📥 Offline · V3.6.0</span>
 <h2>${escapeHtml(t.name)}</h2>

 <div class="offlineCheck">
   <div class="offlineCheckTitle"><span>Offline-Datenprüfung</span><strong class="${pct===100?'offlineReady':'offlineWarn'}">${pct}%</strong></div>
   <div class="offlineProgress"><i style="width:${pct}%"></i></div>
   <small>${pct===100?'Route, POIs, Rechtsdaten und App-Grundgerüst sind lokal vorhanden.':'Ein Teil der Offline-Daten fehlt noch und kann aktualisiert werden.'}</small>
 </div>

 <div class="offlineBox">
   <div class="offlineRow"><span>GPX-Route</span><b class="${c.route?'offlineReady':'offlineBad'}">${c.route?'✓ '+t.points.length+' Punkte':'✕ fehlt'}</b></div>
   <div class="offlineRow"><span>POIs</span><b class="${c.pois?'offlineReady':'offlineWarn'}">${c.pois?'✓ '+t.pois.length+' gespeichert':'◐ fehlen'}</b></div>
   <div class="offlineRow"><span>Rechtsinformationen</span><b class="${c.legal?'offlineReady':'offlineWarn'}">${c.legal?'✓ lokal':'◐ fehlen'}</b></div>
   <div class="offlineRow"><span>App-Oberfläche</span><b class="${c.app?'offlineReady':'offlineWarn'}">${c.app?'✓ Service Worker':'◐ Browser'}</b></div>
   <div class="offlineRow"><span>Kartenkacheln</span><b class="offlineWarn">nur normaler Cache</b></div>
 </div>

 <div class="poiOfflineSummary">
   <span>💧 Trinkwasser <b>${stats.drinking_water||0}</b></span>
   <span>🌊 Quellen <b>${stats.water_source||0}</b></span>
   <span>🏠 Hütten <b>${stats.shelter||0}</b></span>
   <span>⛺ Schlaf <b>${stats.camp||0}</b></span>
   <span>✚ Rettung <b>${stats.emergency||0}</b></span>
   <span>⚖ Recht <b>${stats.legal||0}</b></span>
 </div>

 <button id="prepareOffline" class="prepareBtn">Offline-Daten aktualisieren</button>
 <button id="testOffline" class="testBtn">Gespeicherte Daten testen</button>

 <div class="warning">V3.6.0 speichert POIs jetzt automatisch mit der Tour. Die eigentliche Kartenfläche benötigt für einen vollständigen Offline-Modus später eine Kartenquelle, die Offline-Pakete ausdrücklich erlaubt.</div>`;

 $('#modal').classList.remove('hidden');

 $('#prepareOffline').onclick=async()=>{
   $('#prepareOffline').textContent='POIs werden geladen …';
   $('#prepareOffline').disabled=true;
   await prepareOfflineTour(id);
 };

 $('#testOffline').onclick=()=>{
   const fresh=savedTours().find(x=>x.id===id);
   const ok=fresh?.points?.length && fresh?.pois?.length && fresh?.legalData?.length;
   alert(ok
     ? `Offline-Test bestanden: ${fresh.points.length} Routenpunkte, ${fresh.pois.length} POIs und Rechtsdaten sind lokal gespeichert.`
     : 'Offline-Test unvollständig: Mindestens ein Datenteil fehlt noch.');
 };
}

function setSheet(mode){
 const d=$('#drawer');
 d.classList.remove('drawer-compact','drawer-half','drawer-full');
 d.classList.add('drawer-'+mode);
 ['Compact','Half','Full'].forEach(x=>{
   const b=$('#sheet'+x); if(b)b.classList.remove('active');
 });
 const active={compact:'#sheetCompact',half:'#sheetHalf',full:'#sheetFull'}[mode];
 if(active)$(active).classList.add('active');
 setTimeout(()=>map.invalidateSize(),230);
}


function openNavigationSettings(){
 $('#modalBody').innerHTML=`
 <span class="tag">🧭 Navigation · V3.6.0</span>
 <h2>Tourführung</h2>
 <div class="priorityBox">
   <div class="priorityRow"><span>Warnung „Route verlassen“</span><b>${NAV_PREFS.offRouteWarnM} m</b></div>
   <div class="priorityRow"><span>Trinkwasser-Hinweis</span><b>${NAV_PREFS.waterWarnKm} km</b></div>
   <div class="priorityRow"><span>Schlafplatz-Hinweis</span><b>${NAV_PREFS.sleepWarnKm} km</b></div>
   <div class="priorityRow"><span>Wichtige Punkte voraus</span><b>${NAV_PREFS.importantWithinKm} km</b></div>
 </div>
 <div class="warning">V3.6.0 bietet GPS-basierte Tourführung und Warnungen, aber noch keine sprachgeführte Abbiege-Navigation. Sie folgt weiterhin dem importierten GPX-Track.</div>`;
 $('#modal').classList.remove('hidden');
}

function openLegalOverview(){
 $('#modalBody').innerHTML=`
 <span class="tag">⚖ Rechts-Layer · V3.6.0</span>
 <h2>Pfälzerwald</h2>
 <div class="zoneBadge">Rheinland-Pfalz · Quellenstand 22.08.2026</div>
 <div class="legalBox">
  <div class="legalHead">Übernachten & Nutzung</div>
  <div class="legalRow"><span>Zelt / Camping</span><span class="ruleStatus red">nur ausgewiesen</span></div>
  <div class="legalRow"><span>Hängematte</span><span class="ruleStatus unknown">nicht separat geklärt</span></div>
  <div class="legalRow"><span>Biwak / Lagern</span><span class="ruleStatus red">außerhalb nicht freigegeben</span></div>
  <div class="legalRow"><span>Feuer / Grillen</span><span class="ruleStatus red">grundsätzlich verboten</span></div>
  <div class="legalRow"><span>Trekkingplatz</span><span class="ruleStatus green">mit Buchung</span></div>
 </div>
 <div class="warning">Die regionalen Grundregeln sind jetzt mit offiziellen Quellen hinterlegt. Für einen konkreten Punkt können zusätzliche Schutzgebiets-, Eigentümer-, Platz- oder Waldbrandregeln gelten. Bei der Hängematte zeigt die App deshalb bewusst keine pauschale Erlaubnis an.</div>
 <div class="source">Quellen: Landesforsten Rheinland-Pfalz; Biosphärenreservat Pfälzerwald. Stand: 22.08.2026.</div>`;
 $('#modal').classList.remove('hidden');
}


/* ===== V3.6.0 Tour-Cockpit / Anreise / Backup / Werkzeuge ===== */

function v28RouteName(){
 return $('#routeName')?.textContent || 'Tour';
}
function v28RouteKm(){
 const n=Number(routeCum?.at(-1));
 return Number.isFinite(n)?n:0;
}
function v28NetworkStatus(){
 return navigator.onLine ? {label:'Online',cls:''} : {label:'Offline',cls:'offline'};
}
function v28PlanStatus(){
 const m=mapPlanMetrics();
 if(m.valid)return {label:'Route geplant',detail:`${m.distance.toFixed(1)} km · ${m.active.filter(p=>p.type==='stop').length} Stopps`};
 return {label:'Noch kein kompletter Tourplan',detail:'Start und Ziel können unter „Punkte planen“ gesetzt werden.'};
}
function v28NearestPoi(type){
 if(!allPois?.length)return null;
 const list=allPois.filter(p=>!type || p.type===type).filter(p=>Number.isFinite(Number(p.along)));
 if(!list.length)return null;
 const along=navLiveMode()?currentPlanAlongKm():null;
 const candidates=along==null?list:list.filter(p=>Number(p.along)>=along-.15);
 return (candidates.length?candidates:list).slice().sort((a,b)=>{
   if(along==null)return Number(a.along)-Number(b.along);
   return Math.abs(Number(a.along)-along)-Math.abs(Number(b.along)-along);
 })[0]||null;
}
function v28PoiMini(p){
 if(!p)return '<div class="cockpitPoi"><div class="ico">·</div><div><b>Noch keine Daten</b><small>POIs laden, um Empfehlungen entlang der Route zu sehen.</small></div><strong>—</strong></div>';
 const t=TYPE[p.type]||{icon:'•',label:'POI'};
 const off=Number.isFinite(Number(p.off))?`${Math.round(Number(p.off)*1000)} m abseits`:'';
 return `<div class="cockpitPoi">
   <div class="ico">${t.icon}</div>
   <div><b>${escapeHtml(p.name)}</b><small>${escapeHtml(t.label)}${off?' · '+off:''}</small></div>
   <strong>${Number(p.along).toFixed(1)} km</strong>
 </div>`;
}
function openTourCockpit(){
 const km=v28RouteKm();
 const m=mapPlanMetrics();
 const net=v28NetworkStatus();
 const mode=navigationSession.active?navMode():'idle';
 const modeText=mode==='arrival'?'Anreise':mode==='live'?'Navigation aktiv':mode==='gps_pending'?'GPS wird bestimmt':'Tour bereit';
 const plan=v28PlanStatus();
 const water=v28NearestPoi('drinking_water')||v28NearestPoi('water_source');
 const shelter=v28NearestPoi('shelter');
 const emergency=v28NearestPoi('emergency');
 const saved=savedTours().length;
 const distStart=navigationSession.active?distanceToTourStartKm():null;

 $('#modalBody').innerHTML=`
 <span class="tag">🎛 Tour-Cockpit · V3.6.0</span>
 <h2>${escapeHtml(v28RouteName())}</h2>

 <div class="cockpitHero">
   <div class="cockpitHeroTop">
     <div><h3>${escapeHtml(modeText)}</h3><small>${escapeHtml(plan.label)} · ${escapeHtml(plan.detail)}</small></div>
     <span class="cockpitState">${mode==='arrival'?'Vor-Tour':mode==='live'?'LIVE':'Bereit'}</span>
   </div>
   <div class="cockpitGrid">
     <div class="cockpitMetric"><b>${km.toFixed(1)} km</b><small>GPX-Gesamtlänge</small></div>
     <div class="cockpitMetric"><b>${m.valid?m.distance.toFixed(1)+' km':'—'}</b><small>geplante Strecke</small></div>
     <div class="cockpitMetric"><b>${allPois.length}</b><small>geladene POIs</small></div>
     <div class="cockpitMetric"><b>${saved}</b><small>gespeicherte Touren</small></div>
   </div>
   <span class="networkBadge ${net.cls}">${navigator.onLine?'●':'○'} ${net.label}</span>
   ${Number.isFinite(distStart)?`<div class="backupStatus">🚗 Entfernung zum Tourstart: <b>${distStart.toFixed(1)} km Luftlinie</b></div>`:''}
 </div>

 <div class="cockpitSection">
   <h3>⚡ Schnellaktionen</h3>
   <div class="cockpitActions">
     <button id="cpPois" class="primary">POIs laden</button>
     <button id="cpPlan">Punkte planen</button>
     <button id="cpSafety">Warncenter</button>
     <button id="cpProfile">Höhenprofil</button>
     <button id="cpTrail">Trail-Navigation</button>
     <button id="cpStages">Etappenplan</button>
     <button id="cpOffline">Offline-Tour</button>
     <button id="cpAssist">Navigationsassistenz</button>
     <button id="cpLive">Live-Navigation</button>
     <button id="cpSim">Simulator</button>
     <button id="cpTrack">Track-Aufzeichnung</button>
     <button id="cpHunt">Jagd & Sicherheit</button>
     ${navigationSession.active && mode==='arrival'?'<button id="cpArrival" class="primary">🚗 Zum Start navigieren</button>':''}
     <button id="cpTools">Werkzeuge</button>
   </div>
 </div>

 <div class="cockpitSection">
   <h3>📍 Wichtige Punkte</h3>
   ${v28PoiMini(water)}
   ${v28PoiMini(shelter)}
   ${v28PoiMini(emergency)}
 </div>`;

 $('#modal').classList.remove('hidden');
 $('#cpPois').onclick=async()=>{ $('#modal').classList.add('hidden'); await loadPois(false); };
 $('#cpPlan').onclick=openMapPlanner;
 $('#cpSafety').onclick=openWarningCenter;
 $('#cpProfile').onclick=openElevationProfile;
 $('#cpTrail').onclick=openTrailGuide;
 $('#cpStages').onclick=openDayStagePlanner;
 $('#cpOffline').onclick=openOfflineTourCenter;
 $('#cpAssist').onclick=openNavAssistSettings;
 $('#cpLive').onclick=openLiveNavCenter;
 $('#cpSim').onclick=openSimulatorCenter;
 $('#cpTrack').onclick=openTrackCenter;
 $('#cpHunt').onclick=openHuntingCenter;
 $('#cpTools').onclick=openV28Tools;
 if($('#cpArrival'))$('#cpArrival').onclick=openRouteToStart;
}
function openRouteToStart(){
 const s=planStartPoint();
 if(!s){alert('Bitte zuerst Start und Ziel unter „Punkte planen“ festlegen.');return}
 const lat=finiteNumber(s.lat ?? s[0]),lon=finiteNumber(s.lon ?? s.lng ?? s[1]);
 if(lat==null||lon==null){alert('Der Tourstart konnte nicht eindeutig bestimmt werden.');return}
 const dest=encodeURIComponent(`${lat},${lon}`);
 const label=encodeURIComponent(v28RouteName()+' – Tourstart');
 // iPhone/Safari: Apple Maps. Other systems can still handle the HTTPS URL.
 window.open(`https://maps.apple.com/?daddr=${dest}&dirflg=d&q=${label}`,'_blank');
}
function reverseCurrentRoute(){
 if(!route?.length || route.length<2){alert('Keine Route geladen.');return}
 if(!confirm('GPX-Richtung wirklich umkehren? Start und Ziel werden dabei ebenfalls getauscht.'))return;

 route=[...route].reverse();
 routeEle=Array.isArray(routeEle)?[...routeEle].reverse():[];
 routeCum=[0];
 for(let i=1;i<route.length;i++)routeCum[i]=routeCum[i-1]+hav(route[i-1],route[i]);

 const total=routeCum.at(-1)||0;
 mapPlan.points=(mapPlan.points||[]).map(p=>{
   const type=p.type==='start'?'finish':p.type==='finish'?'start':p.type;
   const along=finiteNumber(p.alongKm);
   const nextAlong=along==null?null:Math.max(0,total-along);
   const nearest=nextAlong==null?null:route[Math.max(0,routeCum.findIndex(v=>v>=nextAlong))];
   return {
     ...p,type,alongKm:nextAlong,
     lat:nearest?.[0]??p.lat,lon:nearest?.[1]??p.lon
   };
 }).sort((a,b)=>(finiteNumber(a.alongKm)??999999)-(finiteNumber(b.alongKm)??999999));

 if(routeLayer)map.removeLayer(routeLayer);
 routeLayer=L.polyline(route,{color:'#ff5e55',weight:6,opacity:.95}).addTo(map);
 try{map.fitBounds(routeLayer.getBounds(),{padding:[35,35]})}catch(e){}
 saveMapPlan();drawMapPlan();
 try{localStorage.setItem('trek_sleep_last_route',JSON.stringify({name:v28RouteName(),points:route,elevations:routeEle,ts:Date.now()}))}catch(e){}
 $('#routeMeta').textContent=`${total.toFixed(1)} km · Richtung umgekehrt`;
 renderMapTourStatus();renderPois();
 openV28Tools('Die GPX-Richtung wurde umgekehrt.');
}
function v28BackupPayload(){
 const keys=[];
 for(let i=0;i<localStorage.length;i++){
   const k=localStorage.key(i);
   if(k && (k.startsWith('trek_sleep_') || k.startsWith('ts_')))keys.push(k);
 }
 const data={};
 keys.sort().forEach(k=>data[k]=localStorage.getItem(k));
 return {
   app:'Trek & Sleep',
   version:'2.8',
   exportedAt:new Date().toISOString(),
   storage:data
 };
}
function exportV28Backup(){
 const payload=v28BackupPayload();
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');
 a.href=url;
 a.download=`trek-and-sleep-backup-${new Date().toISOString().slice(0,10)}.json`;
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2500);
}
function importV28Backup(){
 const input=document.createElement('input');
 input.type='file';input.accept='.json,application/json';
 input.onchange=async()=>{
   const f=input.files?.[0];if(!f)return;
   try{
     const obj=JSON.parse(await f.text());
     if(obj?.app!=='Trek & Sleep'||!obj?.storage||typeof obj.storage!=='object')throw new Error('Ungültiges Backup');
     const count=Object.keys(obj.storage).length;
     if(!confirm(`${count} gespeicherte App-Einträge wiederherstellen? Vorhandene Werte können überschrieben werden.`))return;
     Object.entries(obj.storage).forEach(([k,v])=>{
       if((k.startsWith('trek_sleep_')||k.startsWith('ts_')) && typeof v==='string')localStorage.setItem(k,v);
     });
     alert('Backup wiederhergestellt. Die App wird jetzt neu geladen.');
     location.reload();
   }catch(e){alert('Backup konnte nicht gelesen werden.')}
 };
 input.click();
}
function openV28Tools(message=''){
 const net=v28NetworkStatus();
 const backups=Object.keys(v28BackupPayload().storage).length;
 $('#modalBody').innerHTML=`
 <span class="tag">🧰 Werkzeuge · V3.6.0</span>
 <h2>App & Route</h2>
 ${message?`<div class="backupStatus">${escapeHtml(message)}</div>`:''}
 <div class="toolCard">
   <b>💾 Daten-Backup</b>
   <small>Sichert deine lokalen Trek-&-Sleep-Daten in einer einzelnen JSON-Datei: gespeicherte Touren, Tourplanung und Einstellungen.</small>
   <div class="cockpitActions">
     <button id="backupExport" class="primary">Backup exportieren</button>
     <button id="backupImport">Backup einlesen</button>
   </div>
   <div class="backupStatus">${backups} lokale App-Einträge · <span class="networkBadge ${net.cls}">${net.label}</span></div>
 </div>

 <div class="toolCard">
   <b>↕ GPX-Richtung</b>
   <small>Wenn eine GPX-Datei in der falschen Laufrichtung importiert wurde, kannst du Start und Ziel samt Trackrichtung umkehren.</small>
   <button id="routeReverse" class="toolBtn warn">Route umkehren</button>
 </div>

 <div class="toolCard">
   <b>🧭 Navigation</b>
   <small>Zeigt die aktuellen Grenzwerte für Routenabweichung und Hinweise an.</small>
   <button id="navSettingsV28" class="toolBtn">Navigationseinstellungen</button>
 </div>

 <div class="toolCard">
   <b>📥 Offline-Tour</b>
   <small>Bereitet Route, Planung, POIs, Höhenprofil und App-Dateien für diese Tour lokal vor.</small>
   <button id="offlineV30" class="toolBtn primary">Offline-Tour verwalten</button>
 </div>
 <div class="toolCard">
   <b>⚖ Regeln & Sicherheit</b>
   <small>Öffnet die regionalen Übernachtungs- und Waldregeln beziehungsweise das Warncenter.</small>
   <div class="cockpitActions">
     <button id="legalV28">Rechts-Layer</button>
     <button id="warningV28">Warncenter</button>
   </div>
 </div>`;
 $('#modal').classList.remove('hidden');
 $('#backupExport').onclick=exportV28Backup;
 $('#backupImport').onclick=importV28Backup;
 $('#routeReverse').onclick=reverseCurrentRoute;
 $('#navSettingsV28').onclick=openNavigationSettings;
 $('#legalV28').onclick=openLegalOverview;
 $('#offlineV30').onclick=openOfflineTourCenter;
 $('#warningV28').onclick=openWarningCenter;
}

function escapeHtml(s){
 return String(s??'').replace(/[&<>"']/g,c=>({
   '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[c]);
}

document.addEventListener('DOMContentLoaded',init);

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
