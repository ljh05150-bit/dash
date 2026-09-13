(function(){
  'use strict';
  if(window.__settlementNetworkGuardInstalled)return;
  window.__settlementNetworkGuardInstalled=true;
  const originalFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    const url=typeof input==='string'?input:(input&&input.url)||'';
    if(!String(url).includes('/functions/v1/zaritalk-sync'))return originalFetch(input,init);
    const options={...(init||{})};
    if(options.signal)return originalFetch(input,options);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort('zaritalk-timeout'),4500);
    options.signal=controller.signal;
    return originalFetch(input,options).finally(()=>clearTimeout(timer));
  };
})();
