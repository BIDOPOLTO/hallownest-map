(() => {
'use strict';

const WORLD_W = 72622 / 64;
const WORLD_H = 48128 / 64;
const MIN_ABS_SCALE = 0.20;
const MAX_ZOOM_RATIO = 128;
const ZOOM_BUTTON_FACTOR = 2;
const WHEEL_SPEED = 0.0042;
const TILE_SIZE = 1024;

const markers=(window.HK_MARKERS||[]).map((m,i)=>({...m,id:i}));
const hd=window.HK_HD_MAP||{available:false};

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

const ids=[
 'mapViewport','baseLayer','screenshotMap','sketchMap','screenshotHdTiles','markerLayer',
 'searchInput','categoryGroups','allBtn','noneBtn','hideFound','fitBtn','zoomIn','zoomOut',
 'openSidebar','sidebar','closeSidebar','progressBtn','progressPanel','closeProgress',
 'progressSummary','progressBar','progressGroups','markerCard','markerCategory','markerTitle',
 'markerDetails','markerFound','markerNotes','closeMarker','spoilerBtn','statusChip',
 'exportBtn','importInput','mapModeScreenshot','mapModeSketch'
];
const els=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));

let state=loadState();
let activeCats=new Set(Object.keys(LABELS));
let selectedId=null;
let mapMode=localStorage.getItem('hallownest-map-base')||'screenshot';
let scale=1;
let fitScale=1;
let pan={x:0,y:0};
let renderRAF=0;
let dragging=false;
let dragStart=null;
let panStart=null;
let touches=new Map();
let pinchStart=null;

function loadState(){
  try{
    const s=JSON.parse(localStorage.getItem('hallownest-map-state-v1')||'{}');
    return {found:s.found||{},notes:s.notes||{},spoilers:!!s.spoilers};
  }catch{return {found:{},notes:{},spoilers:false};}
}
function saveState(){localStorage.setItem('hallownest-map-state-v1',JSON.stringify(state));}

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function maxScale(){return Math.max(fitScale,fitScale*MAX_ZOOM_RATIO);}
function currentQuery(){return (els.searchInput.value||'').trim().toLowerCase();}
function worldToScreen(m){return {x:m.y*scale-pan.x,y:-m.x*scale-pan.y};}
function visibleMarker(m){
  if(!activeCats.has(m.category))return false;
  if(els.hideFound.checked&&state.found[m.id])return false;
  const q=currentQuery();
  return !q||(m.name+' '+(LABELS[m.category]||m.category)).toLowerCase().includes(q);
}

function setMapMode(mode){
  mapMode=mode;
  localStorage.setItem('hallownest-map-base',mode);
  els.screenshotMap.classList.toggle('active',mode==='screenshot');
  els.sketchMap.classList.toggle('active',mode==='sketch');
  els.mapModeScreenshot.classList.toggle('active',mode==='screenshot');
  els.mapModeSketch.classList.toggle('active',mode==='sketch');
  if(mode!=='screenshot')els.screenshotHdTiles.replaceChildren();
  scheduleRender();
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
        <span class="cat-dot" style="background:${COLORS[cat]||'#aaa'}"></span>
        <span class="cat-name">${LABELS[cat]||cat}</span><span class="cat-count">${counts[cat]}</span>`;
      row.querySelector('input').addEventListener('change',e=>{
        e.target.checked?activeCats.add(cat):activeCats.delete(cat);scheduleRender();
      });
      wrap.appendChild(row);
    });
    els.categoryGroups.appendChild(wrap);
  });
}

function renderBase(){
  const w=WORLD_W*scale,h=WORLD_H*scale;
  els.baseLayer.style.transform=`translate(${-pan.x}px,${-pan.y}px)`;
  els.baseLayer.style.width=w+'px';
  els.baseLayer.style.height=h+'px';
  els.screenshotMap.style.width=w+'px';els.screenshotMap.style.height=h+'px';
  els.sketchMap.style.width=w+'px';els.sketchMap.style.height=h+'px';
}

function desiredDziLevel(){
  if(!hd.available)return null;
  const fullDensity=hd.width/WORLD_W;
  const targetDensity=scale*Math.min(window.devicePixelRatio||1,2);
  const raw=hd.maxLevel+Math.log2(targetDensity/fullDensity);
  return clamp(Math.ceil(raw),0,hd.maxLevel);
}

function renderHdTiles(){
  if(mapMode!=='screenshot'||!hd.available){
    els.screenshotHdTiles.replaceChildren();return;
  }
  const level=desiredDziLevel();
  if(level==null)return;

  const factor=Math.pow(2,level-hd.maxLevel);
  const sourceW=Math.max(1,Math.ceil(hd.width*factor));
  const sourceH=Math.max(1,Math.ceil(hd.height*factor));
  const displayW=WORLD_W*scale,displayH=WORLD_H*scale;
  const fx=displayW/sourceW,fy=displayH/sourceH;
  const r=els.mapViewport.getBoundingClientRect();

  let minX=Math.floor((pan.x/fx)/hd.tileSize)-2;
  let minY=Math.floor((pan.y/fy)/hd.tileSize)-2;
  let maxX=Math.floor(((pan.x+r.width)/fx)/hd.tileSize)+2;
  let maxY=Math.floor(((pan.y+r.height)/fy)/hd.tileSize)+2;
  minX=Math.max(0,minX);minY=Math.max(0,minY);
  maxX=Math.min(Math.ceil(sourceW/hd.tileSize)-1,maxX);
  maxY=Math.min(Math.ceil(sourceH/hd.tileSize)-1,maxY);

  const needed=new Set();
  for(let y=minY;y<=maxY;y++){
    for(let x=minX;x<=maxX;x++){
      const key=level+'_'+x+'_'+y;needed.add(key);
      let img=els.screenshotHdTiles.querySelector('[data-key="'+key+'"]');
      if(!img){
        img=new Image();img.className='hd-map-tile';img.dataset.key=key;img.alt='';img.draggable=false;
        img.src=`${hd.folder}/${level}/${x}_${y}.${hd.format}`;
        img.onerror=()=>img.remove();
        els.screenshotHdTiles.appendChild(img);
      }
      const sw=Math.min(hd.tileSize,sourceW-x*hd.tileSize);
      const sh=Math.min(hd.tileSize,sourceH-y*hd.tileSize);
      img.style.left=(x*hd.tileSize*fx-pan.x)+'px';
      img.style.top=(y*hd.tileSize*fy-pan.y)+'px';
      img.style.width=(sw*fx+0.4)+'px';
      img.style.height=(sh*fy+0.4)+'px';
    }
  }
  [...els.screenshotHdTiles.children].forEach(el=>{if(!needed.has(el.dataset.key))el.remove();});
}

function renderMarkers(){
  const frag=document.createDocumentFragment();
  const r=els.mapViewport.getBoundingClientRect();
  const pad=36;
  let shown=0;
  for(const m of markers){
    if(!visibleMarker(m))continue;
    const p=worldToScreen(m);
    if(p.x<-pad||p.y<-pad||p.x>r.width+pad||p.y>r.height+pad)continue;
    shown++;
    const b=document.createElement('button');
    b.className='marker'+(state.found[m.id]?' found':'')+(selectedId===m.id?' selected':'');
    b.style.left=p.x+'px';b.style.top=p.y+'px';b.style.background=COLORS[m.category]||'#aaa';
    b.dataset.id=m.id;b.title=m.name;b.setAttribute('aria-label',m.name);
    b.addEventListener('click',ev=>{ev.stopPropagation();openMarker(m.id);});
    frag.appendChild(b);
  }
  els.markerLayer.replaceChildren(frag);
  updateStatus(shown);
}

function updateStatus(shown=els.markerLayer.children.length){
  const ratio=Math.max(.01,scale/fitScale);
  const zoomLabel=ratio>=10?ratio.toFixed(0):ratio.toFixed(1);
  let base=mapMode==='screenshot'?(hd.available?'Screenshot HD':'Screenshot'):'Sketch';
  let detail='';
  if(mapMode==='screenshot'&&hd.available){
    const level=desiredDziLevel();
    const pct=hd.width>=30000?'50%':(hd.width>=17000?'25%':'HD');
    detail=` · ${pct} · LOD ${level}/${hd.maxLevel}`;
  }
  els.statusChip.textContent=`${base}${detail} · zoom ×${zoomLabel} · ${shown.toLocaleString('it-IT')} marker`;
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
  renderRAF=requestAnimationFrame(()=>{
    renderRAF=0;renderBase();renderHdTiles();renderMarkers();renderProgress();
  });
}

function setScale(next,anchorX,anchorY){
  const r=els.mapViewport.getBoundingClientRect();
  if(anchorX==null){anchorX=r.width/2;anchorY=r.height/2;}
  next=clamp(next,Math.max(MIN_ABS_SCALE,fitScale*.45),maxScale());
  if(Math.abs(next-scale)<1e-5)return;
  const ratio=next/scale;
  pan.x=(pan.x+anchorX)*ratio-anchorX;
  pan.y=(pan.y+anchorY)*ratio-anchorY;
  scale=next;scheduleRender();
}

function fitMap(){
  const r=els.mapViewport.getBoundingClientRect();
  fitScale=Math.min((r.width*.94)/WORLD_W,(r.height*.90)/WORLD_H);
  fitScale=Math.max(MIN_ABS_SCALE,fitScale);
  scale=fitScale;
  pan.x=Math.max(0,(WORLD_W*scale-r.width)/2);
  pan.y=Math.max(0,(WORLD_H*scale-r.height)/2);
  scheduleRender();
}

function setAll(on){
  activeCats=on?new Set(Object.keys(LABELS)):new Set();
  els.categoryGroups.querySelectorAll('input[data-cat]').forEach(c=>c.checked=on);scheduleRender();
}

function openMarker(id){
  selectedId=id;const m=markers[id];if(!m)return;
  els.markerCategory.textContent=LABELS[m.category]||m.category;
  els.markerTitle.textContent=m.name;
  els.markerFound.checked=!!state.found[id];
  els.markerNotes.value=state.notes[id]||'';
  els.markerDetails.textContent=state.spoilers
    ? 'Posizione community verificata sulla mappa. Aggiungi le tue note personali qui sotto.'
    : 'Modalità anti-spoiler attiva. Attiva “Spoiler” solo quando vuoi più dettagli.';
  els.markerCard.classList.remove('hidden');scheduleRender();
}
function closeMarker(){selectedId=null;els.markerCard.classList.add('hidden');scheduleRender();}

function exportState(){
  const blob=new Blob([JSON.stringify({version:3,exportedAt:new Date().toISOString(),state,mapMode},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hallownest-map-progress.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function importState(file){
  try{
    const data=JSON.parse(await file.text()),s=data.state||data;
    state={found:s.found||{},notes:s.notes||{},spoilers:!!s.spoilers};saveState();
    if(data.mapMode)setMapMode(data.mapMode);scheduleRender();
  }catch{alert('File di stato non valido.');}
}

function localPoint(ev){
  const r=els.mapViewport.getBoundingClientRect();
  return {x:ev.clientX-r.left,y:ev.clientY-r.top};
}

els.mapViewport.addEventListener('pointerdown',ev=>{
  if(ev.target.closest('.marker'))return;
  els.mapViewport.setPointerCapture(ev.pointerId);
  if(ev.pointerType==='touch'){
    touches.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(touches.size===2){
      const a=[...touches.values()];
      pinchStart={dist:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),scale,pan:{...pan}};
      dragging=false;return;
    }
  }
  dragging=true;els.mapViewport.classList.add('dragging');dragStart=localPoint(ev);panStart={...pan};
});

els.mapViewport.addEventListener('pointermove',ev=>{
  if(ev.pointerType==='touch'&&touches.has(ev.pointerId)){
    touches.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(touches.size===2&&pinchStart){
      const a=[...touches.values()];
      const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
      const cx=(a[0].x+a[1].x)/2-els.mapViewport.getBoundingClientRect().left;
      const cy=(a[0].y+a[1].y)/2-els.mapViewport.getBoundingClientRect().top;
      setScale(pinchStart.scale*(d/pinchStart.dist),cx,cy);
      return;
    }
  }
  if(!dragging)return;
  const p=localPoint(ev);
  pan.x=panStart.x-(p.x-dragStart.x);pan.y=panStart.y-(p.y-dragStart.y);scheduleRender();
});

function endPointer(ev){
  touches.delete(ev.pointerId);
  if(touches.size<2)pinchStart=null;
  if(!touches.size){dragging=false;els.mapViewport.classList.remove('dragging');}
}
els.mapViewport.addEventListener('pointerup',endPointer);
els.mapViewport.addEventListener('pointercancel',endPointer);

els.mapViewport.addEventListener('wheel',ev=>{
  ev.preventDefault();
  const p=localPoint(ev);
  const factor=Math.exp(-ev.deltaY*WHEEL_SPEED);
  setScale(scale*factor,p.x,p.y);
},{passive:false});

els.mapViewport.addEventListener('dblclick',ev=>{
  if(ev.target.closest('.marker'))return;
  const p=localPoint(ev);setScale(scale*2,p.x,p.y);
});

els.zoomIn.addEventListener('click',()=>setScale(scale*ZOOM_BUTTON_FACTOR));
els.zoomOut.addEventListener('click',()=>setScale(scale/ZOOM_BUTTON_FACTOR));
els.fitBtn.addEventListener('click',fitMap);
els.searchInput.addEventListener('input',scheduleRender);
els.hideFound.addEventListener('change',scheduleRender);
els.allBtn.addEventListener('click',()=>setAll(true));
els.noneBtn.addEventListener('click',()=>setAll(false));
els.openSidebar.addEventListener('click',()=>els.sidebar.classList.add('open'));
els.closeSidebar.addEventListener('click',()=>els.sidebar.classList.remove('open'));
els.progressBtn.addEventListener('click',()=>els.progressPanel.classList.toggle('open'));
els.closeProgress.addEventListener('click',()=>els.progressPanel.classList.remove('open'));
els.closeMarker.addEventListener('click',closeMarker);
els.markerFound.addEventListener('change',()=>{
  if(selectedId==null)return;state.found[selectedId]=els.markerFound.checked;saveState();scheduleRender();
});
els.markerNotes.addEventListener('input',()=>{
  if(selectedId==null)return;state.notes[selectedId]=els.markerNotes.value;saveState();
});
els.spoilerBtn.addEventListener('click',()=>{
  state.spoilers=!state.spoilers;saveState();
  els.spoilerBtn.textContent='Spoiler: '+(state.spoilers?'ON':'OFF');
  if(selectedId!=null)openMarker(selectedId);
});
els.mapModeScreenshot.addEventListener('click',()=>setMapMode('screenshot'));
els.mapModeSketch.addEventListener('click',()=>setMapMode('sketch'));
els.exportBtn.addEventListener('click',exportState);
els.importInput.addEventListener('change',()=>{
  const f=els.importInput.files?.[0];if(f)importState(f);els.importInput.value='';
});
window.addEventListener('resize',fitMap);
document.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'){closeMarker();els.progressPanel.classList.remove('open');els.sidebar.classList.remove('open');}
  if(ev.key==='+'||ev.key==='=')setScale(scale*ZOOM_BUTTON_FACTOR);
  if(ev.key==='-')setScale(scale/ZOOM_BUTTON_FACTOR);
  if(ev.key==='0'||ev.key==='Home')fitMap();
});

els.sketchMap.addEventListener('error',()=>{
  els.statusChip.textContent='Errore caricamento base Sketch';els.statusChip.classList.add('error');
});
els.sketchMap.addEventListener('load',()=>els.statusChip.classList.remove('error'));
els.screenshotMap.addEventListener('error',()=>{
  els.mapModeScreenshot.disabled=true;
  if(mapMode==='screenshot')setMapMode('sketch');
});
els.screenshotMap.addEventListener('load',()=>{els.mapModeScreenshot.disabled=false;});

buildCategories();
els.spoilerBtn.textContent='Spoiler: '+(state.spoilers?'ON':'OFF');
setMapMode(mapMode);
requestAnimationFrame(fitMap);
})();