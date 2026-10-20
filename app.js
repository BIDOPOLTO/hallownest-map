(() => {
'use strict';

const MAPS={
  screenshot:{
    label:'Screenshot',
    url:(z,x,y)=>`https://scripterswarmap.b-cdn.net/hk_v5/${z}_${x}_${y}.webp?v=1`,
    dimW:131072,dimH:65536,contentW:72622,contentH:61440,
    crop:1024,maxNative:6,digitalZoom:1
  },
  sketch:{
    label:'Sketch',
    url:(z,x,y)=>`https://scripterswarmap.b-cdn.net/hk_sketch_v3/${z}_${x}_${y}.webp?v=1`,
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

const ids=[
 'mapViewport','tileLayer','markerLayer','searchInput','categoryGroups','allBtn','noneBtn',
 'hideFound','fitBtn','zoomIn','zoomOut','openSidebar','sidebar','closeSidebar','progressBtn',
 'progressPanel','closeProgress','progressSummary','progressBar','progressGroups','markerCard',
 'markerCategory','markerTitle','markerDetails','markerFound','markerNotes','closeMarker',
 'spoilerBtn','statusChip','exportBtn','importInput','mapModeScreenshot','mapModeSketch'
];
const els=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));

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
    return {found:s.found||{},notes:s.notes||{},spoilers:!!s.spoilers};
  }catch{return {found:{},notes:{},spoilers:false};}
}
function saveState(){localStorage.setItem('hallownest-map-state-v1',JSON.stringify(state));}
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
    b.style.left=p.x+'px';b.style.top=p.y+'px';b.style.background=COLORS[m.category]||'#aaa';
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
  els.statusChip.textContent=`${m.label} · tile Z${sourceZ} · zoom ×${zl} · ${shown.toLocaleString('it-IT')} marker`;
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
})();