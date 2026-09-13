const CACHE="family-finance-v4-20260913";

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  event.respondWith(
    fetch(event.request,{cache:"no-store"}).catch(()=>fetch(event.request))
  );
});
