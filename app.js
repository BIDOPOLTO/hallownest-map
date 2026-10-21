(() => {
'use strict';

const MAPS={
  screenshot:{
    label:'Screenshot',
    url:(z,x,y)=>`maps/hk_v5/${z}_${x}_${y}.webp`,
    dimW:131072,dimH:65536,contentW:72622,contentH:61440,
    crop:1024,maxNative:6,digitalZoom:1
  },
  sketch:{
    label:'Sketch',
    url:(z,x,y)=>`maps/hk_sketch_v3/${z}_${x}_${y}.webp`,
    dimW:8192,dimH:8192,contentW:5120,contentH:5120,
    crop:1024,maxNative:2,digitalZoom:1
  }
};
for(const m of Object.values(MAPS)){
  m.worldW=m.contentW/Math.pow(2,m.maxNative);
  m.worldH=m.contentH/Math.pow(2,m.maxNative);
  m.fullWorldW=m.dimW/Math.pow(2,m.maxNative);
  m.fullWorldH=m.dimH/Math.pow(2,m.maxNative);
  m.maxScale=Math.pow(2,m.maxNative+m.digitalZoom);
}

const markers=(window.HK_MARKERS||[]).map((m,i)=>({...m,id:i}));

// Baseline imported from Federico's MapGenie 112% checklist report dated 2026-10-21.
// These 12 IDs are the checklist rows explicitly marked Found (X) in the report.
const MAPGENIE_BASELINE_20261021=[339,470,473,394,406,397,433,435,437,430,419,420];
const MAPGENIE_BASELINE_KEY='hallownest-map-mapgenie-baseline-20261021';
const SYNC_API='https://hallownest-map-sync-api.onrender.com';
const SYNC_TOKEN_KEY='hallownest-map-sync-token';
const STATE_TS_KEY='hallownest-map-state-updated-at';
const sketchPos=window.HK_SKETCH_POS||{};

const GROUPS=[
  {name:'Panchine & Trasporti',cats:['bench','stagStation','tram']},
  {name:'Mappa & Scorciatoie',cats:['map','mapMisc','shortcut']},
  {name:'Abilità & Amuleti',cats:['abilities','charm','notch']},
  {name:'Potenziamenti',cats:['maskShard','upgrades','nail']},
  {name:'Boss & Combattimenti',cats:['boss','battle','godhome']},
  {name:'Collezionabili',cats:['grub','item']},
  {name:'NPC & Quest',cats:['npc','quest']},
  {name:'Geo',cats:['geo']},
  {name:"Diario del Cacciatore",cats:['huntersJournal']},
  {name:'Altro',cats:['permFlags']}
];
const LABELS={
  bench:'Panchine',stagStation:'Stazioni Cervo',tram:'Tram',
  map:'Mappe',mapMisc:'Mappa / Info',shortcut:'Scorciatoie',
  abilities:'Abilità',charm:'Amuleti',notch:'Incavi',
  maskShard:'Frammenti Maschera',upgrades:'Potenziamenti',nail:'Aculeo',
  boss:'Boss',battle:'Combattimenti',godhome:'Godhome',
  grub:'Larve',item:'Oggetti / Chiavi',npc:'NPC',quest:'Quest',
  geo:'Geo',huntersJournal:'Diario del Cacciatore',permFlags:'Info / Eventi'
};
const COLORS={
  bench:'#77e58e',stagStation:'#d9a56b',tram:'#c88f55',
  map:'#65c9ff',mapMisc:'#7ca4c7',shortcut:'#8e9cad',
  abilities:'#8fd7ff',charm:'#bf84ff',notch:'#d9a6ff',
  maskShard:'#ff9eb7',upgrades:'#f1c36f',nail:'#d4dde7',
  boss:'#ff6673',battle:'#ff9a5a',godhome:'#ff79c8',
  grub:'#ffe06b',item:'#fff0a0',npc:'#77aaff',quest:'#61d3e7',
  geo:'#ffd94d',huntersJournal:'#83c889',permFlags:'#a8b2bd'
};


const ICONS={
  bench:'<path d="M4 10h16v3H4zM6 6h12v4H6zM6 13v6M18 13v6"/>',
  stagStation:'<path d="M12 20v-7M12 10c-3 0-5-2-5-5M12 10c3 0 5-2 5-5M7 7 4 5M17 7l3-2M9 12c-2 1-3 3-3 5M15 12c2 1 3 3 3 5"/>',
  tram:'<rect x="4" y="5" width="16" height="12" rx="3"/><path d="M7 9h4M13 9h4M7 17l-2 3M17 17l2 3"/>',
  map:'<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
  mapMisc:'<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
  shortcut:'<path d="M5 12h12M13 8l4 4-4 4"/><path d="M5 7v10"/>',
  abilities:'<path d="M12 3 9 9l-6 3 6 3 3 6 3-6 6-3-6-3z"/>',
  charm:'<path d="m12 3 6 5-2 9-4 4-4-4-2-9z"/><circle cx="12" cy="11" r="2"/>',
  notch:'<path d="M5 5h14v5a4 4 0 0 0 0 8v1H5v-1a4 4 0 0 0 0-8z"/>',
  maskShard:'<path d="M7 5c3-2 7-2 10 0l2 4-2 8-5 3-5-3-2-8z"/><path d="M9 10h.01M15 10h.01M9 15c2 1 4 1 6 0"/>',
  upgrades:'<path d="M12 3c-3 4-6 7-6 11a6 6 0 0 0 12 0c0-4-3-7-6-11z"/><path d="M9 14h6M12 11v6"/>',
  nail:'<path d="m6 18 10-10 2 2L8 20z"/><path d="m14 6 4 4M5 19l-2 2M16 4l4 4"/>',
  paleOre:'<path d="m12 2 6 5-2 12-4 3-6-3L4 7z"/><path d="m12 2-2 7 2 13M4 7l6 2 8-2M6 19l6-5 4 5"/>',
  boss:'<path d="M6 8c0-4 12-4 12 0v7l-3 4-3-2-3 2-3-4z"/><path d="M9 11h.01M15 11h.01M10 15h4"/>',
  battle:'<path d="M5 5l14 14M19 5 5 19"/><path d="m5 5 1 5 4-4M19 5l-1 5-4-4"/>',
  godhome:'<path d="m5 9 3-5 4 4 4-4 3 5-2 10H7z"/><path d="M8 13h8"/>',
  grub:'<path d="M7 6c3-3 7-3 10 0 2 2 2 8 0 11-3 4-7 4-10 0-2-3-2-9 0-11z"/><path d="M9 10h.01M15 10h.01M9 14c2 2 4 2 6 0"/>',
  item:'<circle cx="9" cy="10" r="4"/><path d="M13 10h8M17 10v3M20 10v2"/>',
  npc:'<circle cx="12" cy="9" r="4"/><path d="M5 21c1-5 13-5 14 0"/>',
  quest:'<path d="M6 21V4M6 5h11l-2 4 2 4H6"/>',
  geo:'<path d="m12 3 7 5-3 10-4 3-4-3L5 8z"/><path d="m5 8 7 4 7-4M12 12v9"/>',
  huntersJournal:'<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4 0z"/><path d="M9 4v16M12 8h4M12 12h4"/>',
  permFlags:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'
};
function markerIconKey(m){
  if(m.category==='nail' && /Pale Ore/i.test(m.name)) return 'paleOre';
  return ICONS[m.category]?m.category:'permFlags';
}
function iconSvg(key,small=false){
  const body=ICONS[key]||ICONS.permFlags;
  return '<svg class="'+(small?'marker-svg small':'marker-svg')+'" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>';
}

const ids=[
 'mapViewport','tileLayer','markerLayer','searchInput','categoryGroups','allBtn','noneBtn',
 'hideFound','fitBtn','zoomIn','zoomOut','openSidebar','sidebar','closeSidebar','progressBtn',
 'progressPanel','closeProgress','progressSummary','progressBar','progressGroups','markerCard',
 'markerCategory','markerTitle','markerDetails','markerFound','markerNotes','closeMarker',
 'spoilerBtn','statusChip','exportBtn','importInput','mapModeScreenshot','mapModeSketch'
];
const els=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));

let syncToken=readSyncToken();
let syncStatus=syncToken?'syncing':'off';
let syncTimer=null;
let suppressCloud=false;
let state=loadState();
let activeCats=new Set(Object.keys(LABELS));
let selectedId=null;
let mapMode=localStorage.getItem('hallownest-map-base')||'screenshot';
if(!MAPS[mapMode])mapMode='screenshot';
let scale=1,fitScale=1,pan={x:0,y:0};
let renderRAF=0,dragging=false,dragStart=null,panStart=null,pinchStart=null;
let touches=new Map(),tileGeneration=0;

function loadState(){
  try{
    const s=JSON.parse(localStorage.getItem('hallownest-map-state-v1')||'{}');
    const state={found:s.found||{},notes:s.notes||{},spoilers:!!s.spoilers};
    if(localStorage.getItem(MAPGENIE_BASELINE_KEY)!=='1'){
      for(const id of MAPGENIE_BASELINE_20261021) state.found[id]=true;
      localStorage.setItem(MAPGENIE_BASELINE_KEY,'1');
      localStorage.setItem('hallownest-map-state-v1',JSON.stringify(state));
    }
    return state;
  }catch{
    const state={found:{},notes:{},spoilers:false};
    for(const id of MAPGENIE_BASELINE_20261021) state.found[id]=true;
    try{
      localStorage.setItem(MAPGENIE_BASELINE_KEY,'1');
      localStorage.setItem('hallownest-map-state-v1',JSON.stringify(state));
    }catch{}
    return state;
  }
}
function readSyncToken(){
  try{
    const prefix='#sync=';
    if(location.hash.startsWith(prefix)){
      const token=decodeURIComponent(location.hash.slice(prefix.length)).trim();
      if(token){
        localStorage.setItem(SYNC_TOKEN_KEY,token);
        history.replaceState(null,'',location.pathname+location.search);
        return token;
      }
    }
    return localStorage.getItem(SYNC_TOKEN_KEY)||'';
  }catch{return '';}
}
function localStateTimestamp(){
  return Number(localStorage.getItem(STATE_TS_KEY)||0);
}
function writeLocalState(ts=Date.now()){
  localStorage.setItem('hallownest-map-state-v1',JSON.stringify(state));
  localStorage.setItem(STATE_TS_KEY,String(ts));
}
function saveState(){
  const ts=Date.now();
  writeLocalState(ts);
  if(!suppressCloud)scheduleCloudSave(ts);
}
function cloudSnapshot(){
  return {
    game:{
      found:{...state.found},
      notes:{...state.notes},
      spoilers:!!state.spoilers
    },
    mapMode
  };
}
function normalizeCloudSnapshot(raw){
  const snap=raw&&typeof raw==='object'?raw:{};
  const game=snap.game&&typeof snap.game==='object'?snap.game:snap;
  return {
    game:{
      found:game.found&&typeof game.found==='object'?game.found:{},
      notes:game.notes&&typeof game.notes==='object'?game.notes:{},
      spoilers:!!game.spoilers
    },
    mapMode:MAPS[snap.mapMode]?snap.mapMode:null
  };
}
function mergeFirstSync(remote,local){
  const r=normalizeCloudSnapshot(remote),l=normalizeCloudSnapshot(local);
  const found={...r.game.found};
  for(const [id,val] of Object.entries(l.game.found)){
    if(val)found[id]=true;
    else if(!(id in found))found[id]=false;
  }
  return {
    game:{
      found,
      notes:{...l.game.notes,...r.game.notes},
      spoilers:r.game.spoilers||l.game.spoilers
    },
    mapMode:r.mapMode||l.mapMode||mapMode
  };
}
async function cloudFetch(method='GET',payload=null){
  const headers={'Authorization':'Bearer '+syncToken};
  if(payload)headers['Content-Type']='application/json';
  const res=await fetch(SYNC_API+'/state',{
    method,
    headers,
    body:payload?JSON.stringify(payload):undefined,
    cache:'no-store'
  });
  if(!res.ok)throw new Error('sync '+res.status);
  return res.json();
}
function applyCloudSnapshot(raw,ts){
  const snap=normalizeCloudSnapshot(raw);
  suppressCloud=true;
  try{
    state={
      found:{...snap.game.found},
      notes:{...snap.game.notes},
      spoilers:!!snap.game.spoilers
    };
    localStorage.setItem('hallownest-map-state-v1',JSON.stringify(state));
    localStorage.setItem(STATE_TS_KEY,String(ts||Date.now()));
    if(snap.mapMode&&MAPS[snap.mapMode]&&snap.mapMode!==mapMode){
      mapMode=snap.mapMode;
      localStorage.setItem('hallownest-map-base',mapMode);
      els.mapModeScreenshot?.classList.toggle('active',mapMode==='screenshot');
      els.mapModeSketch?.classList.toggle('active',mapMode==='sketch');
      tileGeneration++;
      els.tileLayer?.replaceChildren();
    }
  }finally{suppressCloud=false;}
  if(selectedId!=null)openMarker(selectedId);
  scheduleRender();
}
async function pushCloud(ts=Date.now()){
  if(!syncToken)return;
  syncStatus='syncing';scheduleRender();
  try{
    const result=await cloudFetch('PUT',{state:cloudSnapshot(),updatedAt:ts});
    localStorage.setItem(STATE_TS_KEY,String(result.updatedAt||ts));
    syncStatus='synced';
  }catch{
    syncStatus='error';
  }
  scheduleRender();
}
function scheduleCloudSave(ts){
  if(!syncToken)return;
  syncStatus='syncing';
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>pushCloud(ts),550);
}
async function pullCloud(initial=false){
  if(!syncToken)return;
  syncStatus='syncing';scheduleRender();
  try{
    const remote=await cloudFetch('GET');
    const localTs=localStateTimestamp();
    const remoteTs=Number(remote.updatedAt||0);
    if(!remote.state){
      await pushCloud(localTs||Date.now());
      return;
    }
    if(initial&&localTs===0){
      const merged=mergeFirstSync(remote.state,cloudSnapshot());
      applyCloudSnapshot(merged,Date.now());
      await pushCloud(Date.now());
      return;
    }
    if(remoteTs>localTs){
      applyCloudSnapshot(remote.state,remoteTs);
    }else if(localTs>remoteTs){
      await pushCloud(localTs);
      return;
    }
    syncStatus='synced';
  }catch{
    syncStatus='error';
  }
  scheduleRender();
}
async function initCloudSync(){
  if(!syncToken){syncStatus='off';scheduleRender();return;}
  await pullCloud(true);
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function currentMap(){return MAPS[mapMode];}
function currentQuery(){return (els.searchInput.value||'').trim().toLowerCase();}
function keyPos(x,y){return Number(x).toFixed(2)+','+Number(y).toFixed(2);}

function markerWorld(m){
  if(mapMode==='sketch'){
    const p=sketchPos[keyPos(m.x,m.y)];
    return p?{x:p[0],y:p[1]}:null;
  }
  return {x:m.x,y:m.y};
}
function worldToScreenPos(p){return {x:p.y*scale-pan.x,y:-p.x*scale-pan.y};}
function visibleMarker(m){
  if(!activeCats.has(m.category))return false;
  if(els.hideFound.checked&&state.found[m.id])return false;
  const q=currentQuery();
  return !q||(m.name+' '+(LABELS[m.category]||m.category)).toLowerCase().includes(q);
}

function nativeZoom(){
  const m=currentMap();
  if(scale<=1)return 0;
  return clamp(Math.floor(Math.log2(scale)),0,m.maxNative);
}
function renderTiles(){
  const m=currentMap(),z=nativeZoom();
  const nativeScale=Math.pow(2,z);
  const tileWorld=m.crop/nativeScale;
  const levelW=m.fullWorldW*nativeScale;
  const levelH=m.fullWorldH*nativeScale;
  const cols=Math.ceil(levelW/m.crop),rows=Math.ceil(levelH/m.crop);
  const r=els.mapViewport.getBoundingClientRect();
  const worldLeft=pan.x/scale,worldTop=pan.y/scale;
  const worldRight=(pan.x+r.width)/scale,worldBottom=(pan.y+r.height)/scale;

  let minX=Math.max(0,Math.floor(worldLeft/tileWorld)-1);
  let maxX=Math.min(cols-1,Math.floor(worldRight/tileWorld)+1);
  let minY=Math.max(0,Math.floor(worldTop/tileWorld)-1);
  let maxY=Math.min(rows-1,Math.floor(worldBottom/tileWorld)+1);

  const generation=tileGeneration;
  const needed=new Set();
  for(let ty=minY;ty<=maxY;ty++){
    for(let tx=minX;tx<=maxX;tx++){
      const key=mapMode+'_'+z+'_'+tx+'_'+ty;
      needed.add(key);
      let img=els.tileLayer.querySelector('[data-key="'+key+'"]');
      if(!img){
        img=new Image();
        img.className='map-tile';
        img.dataset.key=key;
        img.alt='';
        img.draggable=false;
        img.decoding='async';
        const sourceZ=(m.maxNative+1)-z;
        img.src=m.url(sourceZ,tx,ty);
        img.onerror=()=>{ if(generation===tileGeneration) img.remove(); };
        els.tileLayer.appendChild(img);
      }
      const xWorld=tx*tileWorld,yWorld=ty*tileWorld;
      const tilePxW=Math.min(m.crop,levelW-tx*m.crop);
      const tilePxH=Math.min(m.crop,levelH-ty*m.crop);
      img.style.left=(xWorld*scale-pan.x)+'px';
      img.style.top=(yWorld*scale-pan.y)+'px';
      img.style.width=(tilePxW/nativeScale*scale+0.5)+'px';
      img.style.height=(tilePxH/nativeScale*scale+0.5)+'px';
    }
  }
  [...els.tileLayer.children].forEach(el=>{if(!needed.has(el.dataset.key))el.remove();});
}

function buildCategories(){
  const counts={};markers.forEach(m=>counts[m.category]=(counts[m.category]||0)+1);
  els.categoryGroups.innerHTML='';
  GROUPS.forEach(g=>{
    const wrap=document.createElement('section');wrap.className='group';
    const h=document.createElement('h3');h.className='group-title';h.textContent=g.name;wrap.appendChild(h);
    g.cats.filter(c=>counts[c]).forEach(cat=>{
      const row=document.createElement('label');row.className='cat-row';
      row.innerHTML=`<input type="checkbox" data-cat="${cat}" checked>
        <span class="cat-icon" style="--marker-color:${COLORS[cat]||'#aaa'}">${iconSvg(cat,true)}</span>
        <span class="cat-name">${LABELS[cat]||cat}</span><span class="cat-count">${counts[cat]}</span>`;
      row.querySelector('input').addEventListener('change',e=>{
        e.target.checked?activeCats.add(cat):activeCats.delete(cat);scheduleRender();
      });
      wrap.appendChild(row);
    });
    els.categoryGroups.appendChild(wrap);
  });
}

function renderMarkers(){
  const frag=document.createDocumentFragment(),r=els.mapViewport.getBoundingClientRect(),pad=36;
  let shown=0;
  for(const m of markers){
    if(!visibleMarker(m))continue;
    const w=markerWorld(m);
    if(!w)continue;
    const p=worldToScreenPos(w);
    if(p.x<-pad||p.y<-pad||p.x>r.width+pad||p.y>r.height+pad)continue;
    shown++;
    const b=document.createElement('button');
    b.className='marker'+(state.found[m.id]?' found':'')+(selectedId===m.id?' selected':'');
    b.style.left=p.x+'px';b.style.top=p.y+'px';
    b.style.setProperty('--marker-color',COLORS[m.category]||'#aaa');
    b.innerHTML=iconSvg(markerIconKey(m));
    b.dataset.id=m.id;b.title=m.name;b.setAttribute('aria-label',m.name);
    b.addEventListener('click',ev=>{ev.stopPropagation();openMarker(m.id);});
    frag.appendChild(b);
  }
  els.markerLayer.replaceChildren(frag);
  updateStatus(shown);
}

function updateStatus(shown=els.markerLayer.children.length){
  const m=currentMap(),ratio=Math.max(.01,scale/fitScale);
  const zl=ratio>=10?ratio.toFixed(0):ratio.toFixed(1);
  const dz=nativeZoom(),sourceZ=(m.maxNative+1)-dz;
  const cloud=syncStatus==='synced'?'☁ sync':syncStatus==='syncing'?'☁ …':syncStatus==='error'?'☁ errore':'☁ off';
  els.statusChip.textContent=`${m.label} · tile Z${sourceZ} · zoom ×${zl} · ${shown.toLocaleString('it-IT')} marker · ${cloud}`;
}
function renderProgress(){
  const found=Object.values(state.found).filter(Boolean).length;
  const pct=markers.length?Math.round(found/markers.length*100):0;
  els.progressSummary.textContent=`${found} / ${markers.length} trovati · ${pct}%`;
  els.progressBar.style.width=pct+'%';
  els.progressGroups.innerHTML=GROUPS.map(g=>{
    const list=markers.filter(m=>g.cats.includes(m.category));
    if(!list.length)return '';
    const f=list.filter(m=>state.found[m.id]).length;
    return `<div class="progress-row"><span>${g.name}</span><strong>${f} / ${list.length}</strong></div>`;
  }).join('');
}
function scheduleRender(){
  if(renderRAF)return;
  renderRAF=requestAnimationFrame(()=>{renderRAF=0;renderTiles();renderMarkers();renderProgress();});
}
function fitMap(){
  const r=els.mapViewport.getBoundingClientRect(),m=currentMap();
  fitScale=Math.min((r.width*.94)/m.worldW,(r.height*.90)/m.worldH);
  scale=fitScale;
  pan.x=Math.max(0,(m.worldW*scale-r.width)/2);
  pan.y=Math.max(0,(m.worldH*scale-r.height)/2);
  scheduleRender();
}
function setScale(next,anchorX,anchorY){
  const r=els.mapViewport.getBoundingClientRect(),m=currentMap();
  if(anchorX==null){anchorX=r.width/2;anchorY=r.height/2;}
  const max=Math.max(fitScale,m.maxScale);
  next=clamp(next,Math.max(.08,fitScale*.45),max);
  if(Math.abs(next-scale)<1e-5)return;
  const ratio=next/scale;
  pan.x=(pan.x+anchorX)*ratio-anchorX;
  pan.y=(pan.y+anchorY)*ratio-anchorY;
  scale=next;scheduleRender();
}
function setMapMode(mode){
  if(!MAPS[mode]||mode===mapMode)return;
  const r=els.mapViewport.getBoundingClientRect();
  const cx=(pan.x+r.width/2)/scale,cy=(pan.y+r.height/2)/scale;
  mapMode=mode;localStorage.setItem('hallownest-map-base',mode);
  if(!suppressCloud)saveState();
  els.mapModeScreenshot.classList.toggle('active',mode==='screenshot');
  els.mapModeSketch.classList.toggle('active',mode==='sketch');
  tileGeneration++;els.tileLayer.replaceChildren();
  const m=currentMap();
  fitScale=Math.min((r.width*.94)/m.worldW,(r.height*.90)/m.worldH);
  scale=clamp(scale,fitScale*.45,Math.max(fitScale,m.maxScale));
  pan.x=cx*scale-r.width/2;pan.y=cy*scale-r.height/2;
  scheduleRender();
}
function setAll(on){
  activeCats=on?new Set(Object.keys(LABELS)):new Set();
  els.categoryGroups.querySelectorAll('input[data-cat]').forEach(c=>c.checked=on);scheduleRender();
}
function openMarker(id){
  selectedId=id;const m=markers[id];if(!m)return;
  els.markerCategory.textContent=LABELS[m.category]||m.category;
  els.markerTitle.textContent=m.name;els.markerFound.checked=!!state.found[id];
  els.markerNotes.value=state.notes[id]||'';
  els.markerDetails.textContent=state.spoilers
    ? 'Posizione community verificata sulla mappa. Aggiungi le tue note personali qui sotto.'
    : 'Modalità anti-spoiler attiva. Attiva “Spoiler” solo quando vuoi più dettagli.';
  els.markerCard.classList.remove('hidden');scheduleRender();
}
function closeMarker(){selectedId=null;els.markerCard.classList.add('hidden');scheduleRender();}
function exportState(){
  const blob=new Blob([JSON.stringify({version:4,exportedAt:new Date().toISOString(),state,mapMode},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hallownest-map-progress.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function importState(file){
  try{
    const data=JSON.parse(await file.text()),s=data.state||data;
    state={found:s.found||{},notes:s.notes||{},spoilers:!!s.spoilers};saveState();
    if(data.mapMode&&MAPS[data.mapMode])mapMode=data.mapMode;
    scheduleRender();
  }catch{alert('File di stato non valido.');}
}
function localPoint(ev){
  const r=els.mapViewport.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};
}

els.mapViewport.addEventListener('pointerdown',ev=>{
  if(ev.target.closest('.marker'))return;
  els.mapViewport.setPointerCapture(ev.pointerId);
  if(ev.pointerType==='touch'){
    touches.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(touches.size===2){
      const a=[...touches.values()];
      pinchStart={dist:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),scale};
      dragging=false;return;
    }
  }
  dragging=true;els.mapViewport.classList.add('dragging');dragStart=localPoint(ev);panStart={...pan};
});
els.mapViewport.addEventListener('pointermove',ev=>{
  if(ev.pointerType==='touch'&&touches.has(ev.pointerId)){
    touches.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(touches.size===2&&pinchStart){
      const a=[...touches.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
      const rect=els.mapViewport.getBoundingClientRect();
      setScale(pinchStart.scale*(d/pinchStart.dist),(a[0].x+a[1].x)/2-rect.left,(a[0].y+a[1].y)/2-rect.top);
      return;
    }
  }
  if(!dragging)return;
  const p=localPoint(ev);pan.x=panStart.x-(p.x-dragStart.x);pan.y=panStart.y-(p.y-dragStart.y);scheduleRender();
});
function endPointer(ev){
  touches.delete(ev.pointerId);if(touches.size<2)pinchStart=null;
  if(!touches.size){dragging=false;els.mapViewport.classList.remove('dragging');}
}
els.mapViewport.addEventListener('pointerup',endPointer);
els.mapViewport.addEventListener('pointercancel',endPointer);
els.mapViewport.addEventListener('wheel',ev=>{
  ev.preventDefault();const p=localPoint(ev);setScale(scale*Math.exp(-ev.deltaY*.0042),p.x,p.y);
},{passive:false});
els.mapViewport.addEventListener('dblclick',ev=>{
  if(ev.target.closest('.marker'))return;const p=localPoint(ev);setScale(scale*2,p.x,p.y);
});

els.zoomIn.addEventListener('click',()=>setScale(scale*2));
els.zoomOut.addEventListener('click',()=>setScale(scale/2));
els.fitBtn.addEventListener('click',fitMap);
els.searchInput.addEventListener('input',scheduleRender);
els.hideFound.addEventListener('change',scheduleRender);
els.allBtn.addEventListener('click',()=>setAll(true));els.noneBtn.addEventListener('click',()=>setAll(false));
els.openSidebar.addEventListener('click',()=>els.sidebar.classList.add('open'));
els.closeSidebar.addEventListener('click',()=>els.sidebar.classList.remove('open'));
els.progressBtn.addEventListener('click',()=>els.progressPanel.classList.toggle('open'));
els.closeProgress.addEventListener('click',()=>els.progressPanel.classList.remove('open'));
els.closeMarker.addEventListener('click',closeMarker);
els.markerFound.addEventListener('change',()=>{if(selectedId==null)return;state.found[selectedId]=els.markerFound.checked;saveState();scheduleRender();});
els.markerNotes.addEventListener('input',()=>{if(selectedId==null)return;state.notes[selectedId]=els.markerNotes.value;saveState();});
els.spoilerBtn.addEventListener('click',()=>{state.spoilers=!state.spoilers;saveState();els.spoilerBtn.textContent='Spoiler: '+(state.spoilers?'ON':'OFF');if(selectedId!=null)openMarker(selectedId);});
els.mapModeScreenshot.addEventListener('click',()=>setMapMode('screenshot'));
els.mapModeSketch.addEventListener('click',()=>setMapMode('sketch'));
els.exportBtn.addEventListener('click',exportState);
els.importInput.addEventListener('change',()=>{const f=els.importInput.files?.[0];if(f)importState(f);els.importInput.value='';});
window.addEventListener('resize',fitMap);
window.addEventListener('focus',()=>{if(syncToken)pullCloud(false);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&syncToken)pullCloud(false);});
setInterval(()=>{if(document.visibilityState==='visible'&&syncToken)pullCloud(false);},45000);
document.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'){closeMarker();els.progressPanel.classList.remove('open');els.sidebar.classList.remove('open');}
  if(ev.key==='+'||ev.key==='=')setScale(scale*2);
  if(ev.key==='-')setScale(scale/2);
  if(ev.key==='0'||ev.key==='Home')fitMap();
});

buildCategories();
els.spoilerBtn.textContent='Spoiler: '+(state.spoilers?'ON':'OFF');
els.mapModeScreenshot.classList.toggle('active',mapMode==='screenshot');
els.mapModeSketch.classList.toggle('active',mapMode==='sketch');
requestAnimationFrame(fitMap);
initCloudSync();
})();