const SHELL='trek-sleep-v29';
const RUNTIME='trek-sleep-v29-16-runtime';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(k=>![SHELL,RUNTIME].includes(k)).map(k=>caches.delete(k))
  )));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  const url=new URL(req.url);

  if(url.origin===self.location.origin){
    event.respondWith(
      caches.match(req).then(hit=>hit||fetch(req).then(resp=>{
        const copy=resp.clone();
        caches.open(SHELL).then(c=>c.put(req,copy));
        return resp;
      }).catch(()=>caches.match('./index.html')))
    );
    return;
  }

  const isLibrary=url.hostname==='unpkg.com' &&
    (url.pathname.includes('leaflet')||url.pathname.includes('markercluster'));

  if(isLibrary){
    event.respondWith(
      caches.match(req).then(hit=>hit||fetch(req).then(resp=>{
        const copy=resp.clone();
        caches.open(RUNTIME).then(c=>c.put(req,copy));
        return resp;
      }))
    );
  }
});
