(() => {
'use strict';

const REF_Z = 7;
const MIN_Z = 3;
const MAX_Z = 8;

// Hallownest.net final combined world map: 72,622 x 48,128.
// At our reference coordinate scale (1/64) this is the world size below.
const WORLD_W = 72622 / 64;
const WORLD_H = 48128 / 64;

const markers = (window.HK_MARKERS || []).map((m,i)=>({...m,id:i}));

const GROUPS = [
  {name:'Panchine & Trasporti', cats:['bench','stagStation','tram']},
  {name:'Mappa & Scorciatoie', cats:['map','mapMisc','shortcut']},
  {name:'Abilità & Amuleti', cats:['abilities','charm','notch']},
  {name:'Potenziamenti', cats:['maskShard','upgrades','nail']},
  {name:'Boss & Combattimenti', cats:['boss','battle','godhome']},
  {name:'Collezionabili', cats:['grub','item']},
  {name:'NPC & Quest', cats:['npc','quest']},
  {name:'Geo', cats:['geo']},
  {name:"Diario del Cacciatore", cats:['huntersJournal']},
  {name:'Altro', cats:['permFlags']}
];

const LABELS = {
  bench:'Panchine',stagStation:'Stazioni Cervo',tram:'Tram',
  map:'Mappe',mapMisc:'Mappa / Info',shortcut:'Scorciatoie',
  abilities:'Abilità',charm:'Amuleti',notch:'Incavi',
  maskShard:'Frammenti Maschera',upgrades:'Potenziamenti',nail:'Aculeo',
  boss:'Boss',battle:'Combattimenti',godhome:'Godhome',
  grub:'Larve',item:'Oggetti / Chiavi',npc:'NPC',quest:'Quest',
  geo:'Geo',huntersJournal:'Diario del Cacciatore',permFlags:'Info / Eventi'
};

const COLORS = {
  bench:'#77e58e',stagStation:'#d9a56b',tram:'#c88f55',
  map:'#65c9ff',mapMisc:'#7ca4c7',shortcut:'#8e9cad',
  abilities:'#8fd7ff',charm:'#bf84ff',notch:'#d9a6ff',
  maskShard:'#ff9eb7',upgrades:'#f1c36f',nail:'#d4dde7',
  boss:'#ff6673',battle:'#ff9a5a',godhome:'#ff79c8',
  grub:'#ffe06b',item:'#fff0a0',npc:'#77aaff',quest:'#61d3e7',
  geo:'#ffd94d',huntersJournal:'#83c889',permFlags:'#a8b2bd'
};

const els = Object.fromEntries([
 'mapViewport','baseLayer','screenshotMap','sketchMap','markerLayer',
 'searchInput','categoryGroups','allBtn','noneBtn','hideFound',
 'fitBtn','zoomIn','zoomOut','openSidebar','sidebar','closeSidebar',
 'progressBtn','progressPanel','closeProgress','progressSummary',
 'progressBar','progressGroups','markerCard','markerCategory','markerTitle',
 'markerDetails','markerFound','markerNotes','closeMarker','spoilerBtn',
 'statusChip','exportBtn','importInput','mapModeScreenshot','mapModeSketch'
].map(id=>[id,document.getElementById(id)]));

let state = loadState();
let activeCats = new Set(Object.keys(LABELS));
let selectedId = null;
let z = 6;
let pan = {x:0,y:0};
let dragging = false;
let dragStart = null;
let panStart = null;
let pinchStart = null;
let renderRAF = 0;
let mapMode = localStorage.getItem('hallownest-map-base') || 'screenshot';

function loadState(){
  try{
    const s=JSON.parse(localStorage.getItem('hallownest-map-state-v1')||'{}');
    return {found:s.found||{},notes:s.notes||{},spoilers:!!s.spoilers};
  }catch{return {found:{},notes:{},spoilers:false};}
}
function saveState(){localStorage.setItem('hallownest-map-state-v1',JSON.stringify(state));}

function scaleForZ(zz=z){ return Math.pow(2, REF_Z - zz); }
function mapPos(m,zz=z){
  const s=scaleForZ(zz);
  return {x:s*m.y,y:-s*m.x};
}
function currentQuery(){return (els.searchInput.value||'').trim().toLowerCase();}
function visibleMarker(m){
  if(!activeCats.has(m.category))return false;
  if(els.hideFound.checked && state.found[m.id])return false;
  const q=currentQuery();
  if(q && !(m.name+' '+(LABELS[m.category]||m.category)).toLowerCase().includes(q))return false;
  return true;
}

function setMapMode(mode){
  mapMode=mode;
  localStorage.setItem('hallownest-map-base',mode);
  els.screenshotMap.classList.toggle('active',mode==='screenshot');
  els.sketchMap.classList.toggle('active',mode==='sketch');
  els.mapModeScreenshot.classList.toggle('active',mode==='screenshot');
  els.mapModeSketch.classList.toggle('active',mode==='sketch');
  updateStatus();
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
  const s=scaleForZ();
  const w=WORLD_W*s,h=WORLD_H*s;
  els.baseLayer.style.transform=`translate(${-pan.x}px,${-pan.y}px)`;
  els.baseLayer.style.width=w+'px';
  els.baseLayer.style.height=h+'px';

  // Screenshot layer is the reference geometry.
  els.screenshotMap.style.width=w+'px';
  els.screenshotMap.style.height=h+'px';

  // Sketch uses the same world bounds so toggling does not move the viewport.
  els.sketchMap.style.width=w+'px';
  els.sketchMap.style.height=h+'px';
}

function renderMarkers(){
  const frag=document.createDocumentFragment();
  let shown=0;
  for(const m of markers){
    if(!visibleMarker(m))continue;
    const p=mapPos(m);shown++;
    const b=document.createElement('button');
    b.className='marker'+(state.found[m.id]?' found':'')+(selectedId===m.id?' selected':'');
    b.style.left=(p.x-pan.x)+'px';
    b.style.top=(p.y-pan.y)+'px';
    b.style.background=COLORS[m.category]||'#aaa';
    b.dataset.id=m.id;b.title=m.name;b.setAttribute('aria-label',m.name);
    b.addEventListener('click',ev=>{ev.stopPropagation();openMarker(m.id);});
    frag.appendChild(b);
  }
  els.markerLayer.replaceChildren(frag);
  updateStatus(shown);
}

function updateStatus(shown){
  if(shown==null)shown=[...els.markerLayer.children].length;
  const base=mapMode==='screenshot'?'Screenshot':'Sketch';
  els.statusChip.textContent=`${base} · ${shown.toLocaleString('it-IT')} marker visibili · ${markers.length.toLocaleString('it-IT')} totali`;
}

function scheduleRender(){
  if(renderRAF)return;
  renderRAF=requestAnimationFrame(()=>{
    renderRAF=0;renderBase();renderMarkers();renderProgress();
  });
}

function setZoom(newZ,anchorX,anchorY){
  newZ=Math.max(MIN_Z,Math.min(MAX_Z,newZ));
  if(newZ===z)return;
  const rect=els.mapViewport.getBoundingClientRect();
  if(anchorX==null){anchorX=rect.width/2;anchorY=rect.height/2;}
  const oldS=scaleForZ(z),newS=scaleForZ(newZ),ratio=newS/oldS;
  pan.x=(pan.x+anchorX)*ratio-anchorX;
  pan.y=(pan.y+anchorY)*ratio-anchorY;
  z=newZ;scheduleRender();
}

function fitMap(){
  const rect=els.mapViewport.getBoundingClientRect();
  let chosen=MAX_Z;
  for(let candidate=MIN_Z;candidate<=MAX_Z;candidate++){
    const s=scaleForZ(candidate);
    if(WORLD_W*s<=rect.width*.92 && WORLD_H*s<=rect.height*.88){chosen=candidate;break;}
  }
  z=chosen;
  const s=scaleForZ(),w=WORLD_W*s,h=WORLD_H*s;
  pan.x=Math.max(0,(w-rect.width)/2);
  pan.y=Math.max(0,(h-rect.height)/2);
  scheduleRender();
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

function renderProgress(){
  const foundCount=Object.values(state.found).filter(Boolean).length;
  const pct=markers.length?Math.round(foundCount/markers.length*100):0;
  els.progressSummary.textContent=`${foundCount} / ${markers.length} trovati · ${pct}%`;
  els.progressBar.style.width=pct+'%';
  els.progressGroups.innerHTML=GROUPS.map(g=>{
    const a=markers.filter(m=>g.cats.includes(m.category));
    if(!a.length)return '';
    const f=a.filter(m=>state.found[m.id]).length;
    return `<div class="progress-row"><span>${g.name}</span><strong>${f} / ${a.length}</strong></div>`;
  }).join('');
}

function setAll(on){
  activeCats=on?new Set(Object.keys(LABELS)):new Set();
  els.categoryGroups.querySelectorAll('input[data-cat]').forEach(c=>c.checked=on);
  scheduleRender();
}
function exportState(){
  const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),state,mapMode},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hallownest-map-progress.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function importState(file){
  try{
    const data=JSON.parse(await file.text()),s=data.state||data;
    state={found:s.found||{},notes:s.notes||{},spoilers:!!s.spoilers};
    saveState();
    if(data.mapMode)setMapMode(data.mapMode);
    scheduleRender();
  }catch{alert('File di stato non valido.');}
}
function pointFromEvent(ev){
  const r=els.mapViewport.getBoundingClientRect();
  return {x:ev.clientX-r.left,y:ev.clientY-r.top};
}

els.mapViewport.addEventListener('pointerdown',ev=>{
  if(ev.target.closest('.marker'))return;
  els.mapViewport.setPointerCapture(ev.pointerId);
  dragging=true;els.mapViewport.classList.add('dragging');
  dragStart=pointFromEvent(ev);panStart={...pan};
});
els.mapViewport.addEventListener('pointermove',ev=>{
  if(!dragging)return;const p=pointFromEvent(ev);
  pan.x=panStart.x-(p.x-dragStart.x);
  pan.y=panStart.y-(p.y-dragStart.y);
  scheduleRender();
});
function endDrag(){dragging=false;els.mapViewport.classList.remove('dragging');}
els.mapViewport.addEventListener('pointerup',endDrag);
els.mapViewport.addEventListener('pointercancel',endDrag);
els.mapViewport.addEventListener('wheel',ev=>{
  ev.preventDefault();const p=pointFromEvent(ev);
  setZoom(z+(ev.deltaY>0?1:-1),p.x,p.y);
},{passive:false});

let touches=new Map();
els.mapViewport.addEventListener('pointerdown',ev=>{
  if(ev.pointerType==='touch'){
    touches.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(touches.size===2){
      const a=[...touches.values()];
      pinchStart={dist:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),z};
      dragging=false;
    }
  }
});
els.mapViewport.addEventListener('pointermove',ev=>{
  if(ev.pointerType!=='touch'||!touches.has(ev.pointerId))return;
  touches.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  if(touches.size===2&&pinchStart){
    const a=[...touches.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
    if(d>pinchStart.dist*1.28){setZoom(pinchStart.z-1);pinchStart={dist:d,z};}
    else if(d<pinchStart.dist*.78){setZoom(pinchStart.z+1);pinchStart={dist:d,z};}
  }
});
['pointerup','pointercancel'].forEach(type=>els.mapViewport.addEventListener(type,ev=>{
  touches.delete(ev.pointerId);if(touches.size<2)pinchStart=null;
}));

els.searchInput.addEventListener('input',scheduleRender);
els.hideFound.addEventListener('change',scheduleRender);
els.allBtn.addEventListener('click',()=>setAll(true));
els.noneBtn.addEventListener('click',()=>setAll(false));
els.fitBtn.addEventListener('click',fitMap);
els.zoomIn.addEventListener('click',()=>setZoom(z-1));
els.zoomOut.addEventListener('click',()=>setZoom(z+1));
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
window.addEventListener('resize',scheduleRender);
document.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'){closeMarker();els.progressPanel.classList.remove('open');els.sidebar.classList.remove('open');}
});

[els.screenshotMap,els.sketchMap].forEach(img=>{
  img.addEventListener('error',()=>{
    els.statusChip.textContent='Errore caricamento base '+(img===els.screenshotMap?'Screenshot':'Sketch');
    els.statusChip.classList.add('error');
  });
  img.addEventListener('load',()=>els.statusChip.classList.remove('error'));
});

buildCategories();
els.spoilerBtn.textContent='Spoiler: '+(state.spoilers?'ON':'OFF');
setMapMode(mapMode);
requestAnimationFrame(fitMap);
})();