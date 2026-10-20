const CACHE='hallownest-map-v5';
const SHELL=['./','./index.html','./styles.css','./app.js','./markers.js','./manifest.webmanifest'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)))});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const u=new URL(event.request.url);
  if(u.origin!==location.origin)return;
  // Let normal HTTP caching handle the large map pyramid; never fill SW storage with hundreds of tiles.
  if(u.pathname.includes('/maps/screenshot-hd_files/'))return;
  event.respondWith((async()=>{
    try{
      const fresh=await fetch(event.request);
      if(fresh&&fresh.ok){const c=await caches.open(CACHE);c.put(event.request,fresh.clone())}
      return fresh;
    }catch(err){
      const cached=await caches.match(event.request);if(cached)return cached;throw err;
    }
  })());
});