const CACHE="family-finance-v5-20260913-1116";

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
  const url=new URL(event.request.url);
  if(url.pathname.endsWith("/index.html")){
    event.respondWith(
      fetch(event.request,{cache:"no-store"})
        .then(async response=>{
          const text=await response.text();
          const patched=text.replace("</body>","<script src=\"./recent-link-fix.js?v=20260913-1116\"></script></body>");
          return new Response(patched,{status:response.status,statusText:response.statusText,headers:response.headers});
        })
        .catch(()=>fetch(event.request))
    );
    return;
  }
  event.respondWith(fetch(event.request,{cache:"no-store"}).catch(()=>fetch(event.request)));
});