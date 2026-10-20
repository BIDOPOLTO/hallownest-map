(() => {
'use strict';

const TILE = 1024;
const TILE_MIN_Z = 3;
const TILE_MAX_Z = 8;
const REF_Z = 7;
const TILE_DIRECT = (z,x,y) => `https://scripterswarmap.b-cdn.net/hk_v4/${z}_${x}_${y}.png?v=1`;
const TILE_PROXY = (z,x,y) => {
  const source = encodeURIComponent(`https://scripterswarmap.b-cdn.net/hk_v4/${z}_${x}_${y}.png?v=1`);
  return `https://images.weserv.nl/?url=${source}&output=png`;
};
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
 'mapViewport','tileLayer','markerLayer','searchInput','categoryGroups','allBtn','noneBtn','hideFound',
 'fitBtn','zoomIn','zoomOut','openSidebar','sidebar','closeSidebar','progressBtn','progressPanel','closeProgress',
 'progressSummary','progressBar','progressGroups','markerCard','markerCategory','markerTitle','markerDetails',
 'markerFound','markerNotes','closeMarker','spoilerBtn','statusChip','exportBtn','importInput'
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
let tileKeys = new Set();

function loadState(){
  try{
    const s = JSON.parse(localStorage.getItem('hallownest-map-state-v1')||'{}');
    return {found:s.found||{},notes:s.notes||{},spoilers:!!s.spoilers};
  }catch{return {found:{},notes:{},spoilers:false};}
}
function saveState(){
  localStorage.setItem('hallownest-map-state-v1',JSON.stringify(state));
}
function scaleForZ(zz=z){ return Math.pow(2, REF_Z - zz); }
function mapPos(m,zz=z){
  const s=scaleForZ(zz);
  return {x:s*m.y,y:-s*m.x};
}
function currentQuery(){return (els.searchInput.value||'').trim().toLowerCase();}
function visibleMarker(m){
  if(!activeCats.has(m.category)) return false;
  if(els.hideFound.checked && state.found[m.id]) return false;
  const q=currentQuery();
  if(q && !(m.name+' '+(LABELS[m.category]||m.category)).toLowerCase().includes(q)) return false;
  return true;
}

function buildCategories(){
  const counts={}; markers.forEach(m=>counts[m.category]=(counts[m.category]||0)+1);
  els.categoryGroups.innerHTML='';
  GROUPS.forEach(g=>{
    const wrap=document.createElement('section'); wrap.className='group';
    const h=document.createElement('h3'); h.className='group-title'; h.textContent=g.name; wrap.appendChild(h);
    g.cats.filter(c=>counts[c]).forEach(cat=>{
      const row=document.createElement('label'); row.className='cat-row';
      row.innerHTML=`<input type="checkbox" data-cat="${cat}" checked>
        <span class="cat-dot" style="background:${COLORS[cat]||'#aaa'}"></span>
        <span class="cat-name">${LABELS[cat]||cat}</span><span class="cat-count">${counts[cat]}</span>`;
      row.querySelector('input').addEventListener('change',e=>{
        e.target.checked?activeCats.add(cat):activeCats.delete(cat);
        scheduleRender();
      });
      wrap.appendChild(row);
    });
    els.categoryGroups.appendChild(wrap);
  });
}

function renderMarkers(){
  const frag=document.createDocumentFragment();
  const query=currentQuery();
  let shown=0;
  for(const m of markers){
    if(!visibleMarker(m)) continue;
    const p=mapPos(m); shown++;
    const b=document.createElement('button');
    b.className='marker'+(state.found[m.id]?' found':'')+(selectedId===m.id?' selected':'');
    b.style.left=p.x+'px'; b.style.top=p.y+'px';
    b.style.background=COLORS[m.category]||'#aaa';
    b.dataset.id=m.id;
    b.title=m.name;
    b.setAttribute('aria-label',m.name);
    b.addEventListener('click',ev=>{ev.stopPropagation();openMarker(m.id);});
    frag.appendChild(b);
  }
  els.markerLayer.replaceChildren(frag);
  els.markerLayer.style.transform=`translate(${-pan.x}px,${-pan.y}px)`;
  els.statusChip.textContent=`${shown.toLocaleString('it-IT')} marker visibili · ${markers.length.toLocaleString('it-IT')} totali${query?' · ricerca attiva':''}`;
}

function renderTiles(){
  const r=els.mapViewport.getBoundingClientRect();
  const minX=Math.max(0,Math.floor(pan.x/TILE)-1);
  const minY=Math.max(0,Math.floor(pan.y/TILE)-1);
  const maxX=Math.max(minX,Math.floor((pan.x+r.width)/TILE)+1);
  const maxY=Math.max(minY,Math.floor((pan.y+r.height)/TILE)+1);
  const needed=new Set();
  for(let x=minX;x<=maxX;x++) for(let y=minY;y<=maxY;y++){
    const key=`${z}_${x}_${y}`; needed.add(key);
    if(!tileKeys.has(key)){
      const img=new Image();
      img.className='map-tile';
      img.dataset.key=key;
      img.alt='';
      img.draggable=false;
      img.style.left=(x*TILE)+'px';img.style.top=(y*TILE)+'px';
      img.dataset.source='direct';
      img.src=TILE_DIRECT(z,x,y);
      img.onload=()=>{ img.dataset.loaded='1'; updateTileHealth(); };
      img.onerror=()=>{
        if(img.dataset.source==='direct'){
          img.dataset.source='proxy';
          img.src=TILE_PROXY(z,x,y);
        }else{
          img.dataset.failed='1';
          img.style.display='none';
          updateTileHealth();
        }
      };
      els.tileLayer.appendChild(img);tileKeys.add(key);
    }
  }
  for(const el of [...els.tileLayer.children]){
    if(!needed.has(el.dataset.key)){tileKeys.delete(el.dataset.key);el.remove();}
  }
  els.tileLayer.style.transform=`translate(${-pan.x}px,${-pan.y}px)`;
}


function updateTileHealth(){
  const all=[...els.tileLayer.querySelectorAll('.map-tile')];
  const loaded=all.filter(x=>x.dataset.loaded==='1').length;
  const failed=all.filter(x=>x.dataset.failed==='1').length;
  if(all.length && loaded===0 && failed===all.length){
    els.statusChip.textContent='Base mappa non raggiungibile · marker e tracker restano attivi';
    els.statusChip.classList.add('error');
  }else{
    els.statusChip.classList.remove('error');
  }
}

function scheduleRender(){
  if(renderRAF) return;
  renderRAF=requestAnimationFrame(()=>{renderRAF=0;renderTiles();renderMarkers();renderProgress();});
}

function setZoom(newZ, anchorX, anchorY){
  newZ=Math.max(TILE_MIN_Z,Math.min(TILE_MAX_Z,newZ));
  if(newZ===z)return;
  const rect=els.mapViewport.getBoundingClientRect();
  if(anchorX==null){anchorX=rect.width/2;anchorY=rect.height/2;}
  const oldScale=scaleForZ(z), newScale=scaleForZ(newZ);
  const ratio=newScale/oldScale;
  pan.x=(pan.x+anchorX)*ratio-anchorX;
  pan.y=(pan.y+anchorY)*ratio-anchorY;
  z=newZ; clearTiles(); scheduleRender();
}
function clearTiles(){els.tileLayer.replaceChildren();tileKeys.clear();}

function fitMap(){
  const rect=els.mapViewport.getBoundingClientRect();
  const baseW=1210, baseH=1030;
  let chosen=TILE_MIN_Z;
  for(let candidate=TILE_MIN_Z;candidate<=TILE_MAX_Z;candidate++){
    const s=scaleForZ(candidate);
    if(baseW*s<=rect.width*.90 && baseH*s<=rect.height*.82){chosen=candidate;break;}
    chosen=candidate;
  }
  z=chosen; clearTiles();
  const s=scaleForZ(z), w=baseW*s,h=baseH*s;
  pan.x=Math.max(0,(w-rect.width)/2);
  pan.y=Math.max(0,(h-rect.height)/2);
  scheduleRender();
}

function openMarker(id){
  selectedId=id; const m=markers[id]; if(!m)return;
  els.markerCategory.textContent=LABELS[m.category]||m.category;
  els.markerTitle.textContent=m.name;
  els.markerFound.checked=!!state.found[id];
  els.markerNotes.value=state.notes[id]||'';
  els.markerDetails.textContent=state.spoilers
    ? 'Dettagli completi non copiati da servizi proprietari. Posizione e categoria provengono dal dataset cartografico pubblico usato dalla mappa.'
    : 'Modalità anti-spoiler attiva. Tocca “Spoiler: OFF” per mostrare dettagli aggiuntivi.';
  els.markerCard.classList.remove('hidden'); scheduleRender();
}
function closeMarker(){selectedId=null;els.markerCard.classList.add('hidden');scheduleRender();}

function renderProgress(){
  const foundCount=Object.values(state.found).filter(Boolean).length;
  const pct=markers.length?Math.round(foundCount/markers.length*100):0;
  els.progressSummary.textContent=`${foundCount} / ${markers.length} trovati · ${pct}%`;
  els.progressBar.style.width=pct+'%';
  const rows=[];
  for(const g of GROUPS){
    const ids=markers.filter(m=>g.cats.includes(m.category));
    if(!ids.length)continue;
    const f=ids.filter(m=>state.found[m.id]).length;
    rows.push(`<div class="progress-row"><span>${g.name}</span><strong>${f} / ${ids.length}</strong></div>`);
  }
  els.progressGroups.innerHTML=rows.join('');
}

function setAll(on){
  activeCats=on?new Set(Object.keys(LABELS)):new Set();
  els.categoryGroups.querySelectorAll('input[data-cat]').forEach(c=>c.checked=on);
  scheduleRender();
}

function exportState(){
  const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hallownest-map-progress.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function importState(file){
  try{
    const data=JSON.parse(await file.text());
    const s=data.state||data;
    state={found:s.found||{},notes:s.notes||{},spoilers:!!s.spoilers};saveState();scheduleRender();
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
  pan.x=panStart.x-(p.x-dragStart.x);pan.y=panStart.y-(p.y-dragStart.y);scheduleRender();
});
function endDrag(){dragging=false;els.mapViewport.classList.remove('dragging');}
els.mapViewport.addEventListener('pointerup',endDrag);els.mapViewport.addEventListener('pointercancel',endDrag);

els.mapViewport.addEventListener('wheel',ev=>{
  ev.preventDefault();const p=pointFromEvent(ev);
  setZoom(z+(ev.deltaY>0?1:-1),p.x,p.y);
},{passive:false});

// Native two-finger pinch for iPad/iPhone.
let touches=new Map();
els.mapViewport.addEventListener('pointerdown',ev=>{
  if(ev.pointerType==='touch'){touches.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(touches.size===2){const a=[...touches.values()];pinchStart={dist:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),z};dragging=false;}
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
['pointerup','pointercancel'].forEach(type=>els.mapViewport.addEventListener(type,ev=>{touches.delete(ev.pointerId);if(touches.size<2)pinchStart=null;}));

els.searchInput.addEventListener('input',scheduleRender);
els.hideFound.addEventListener('change',scheduleRender);
els.allBtn.addEventListener('click',()=>setAll(true));els.noneBtn.addEventListener('click',()=>setAll(false));
els.fitBtn.addEventListener('click',fitMap);els.zoomIn.addEventListener('click',()=>setZoom(z-1));els.zoomOut.addEventListener('click',()=>setZoom(z+1));
els.openSidebar.addEventListener('click',()=>els.sidebar.classList.add('open'));els.closeSidebar.addEventListener('click',()=>els.sidebar.classList.remove('open'));
els.progressBtn.addEventListener('click',()=>els.progressPanel.classList.toggle('open'));els.closeProgress.addEventListener('click',()=>els.progressPanel.classList.remove('open'));
els.closeMarker.addEventListener('click',closeMarker);
els.markerFound.addEventListener('change',()=>{if(selectedId==null)return;state.found[selectedId]=els.markerFound.checked;saveState();scheduleRender();});
els.markerNotes.addEventListener('input',()=>{if(selectedId==null)return;state.notes[selectedId]=els.markerNotes.value;saveState();});
els.spoilerBtn.addEventListener('click',()=>{
  state.spoilers=!state.spoilers;saveState();els.spoilerBtn.textContent='Spoiler: '+(state.spoilers?'ON':'OFF');
  if(selectedId!=null)openMarker(selectedId);
});
els.exportBtn.addEventListener('click',exportState);
els.importInput.addEventListener('change',()=>{const f=els.importInput.files?.[0];if(f)importState(f);els.importInput.value='';});
window.addEventListener('resize',()=>{scheduleRender();});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){closeMarker();els.progressPanel.classList.remove('open');els.sidebar.classList.remove('open');}});

buildCategories();
els.spoilerBtn.textContent='Spoiler: '+(state.spoilers?'ON':'OFF');
requestAnimationFrame(()=>fitMap());

})();