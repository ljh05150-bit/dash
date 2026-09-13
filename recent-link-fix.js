(function(){
  function enhance(){
    document.querySelectorAll('#txrows .tx-row[data-recent-edit]').forEach(row=>{
      const id=row.getAttribute('data-recent-edit');
      if(!id || row.dataset.nativeLinkFixed==='1') return;
      row.dataset.nativeLinkFixed='1';
      const link=document.createElement('a');
      link.className=row.className;
      link.innerHTML=row.innerHTML;
      link.href='./index.html?tx='+encodeURIComponent(id)+'#transactionsSection';
      link.style.textDecoration='none';
      link.style.color='inherit';
      link.style.display='grid';
      link.style.width='100%';
      row.replaceWith(link);
    });
  }
  function openRequested(){
    const id=new URLSearchParams(location.search).get('tx');
    if(!id) return;
    const tryOpen=()=>{
      if(typeof window.openRecentTransaction==='function' && Array.isArray(window.__visibleRecentTransactions)){
        const found=window.__visibleRecentTransactions.some(x=>String(x.id)===String(id));
        if(found){
          window.openRecentTransaction(id);
          return true;
        }
      }
      return false;
    };
    if(tryOpen()) return;
    let attempts=0;
    const timer=setInterval(()=>{attempts++; if(tryOpen()||attempts>30) clearInterval(timer);},100);
  }
  const obs=new MutationObserver(()=>enhance());
  window.addEventListener('DOMContentLoaded',()=>{enhance();openRequested();obs.observe(document.body,{childList:true,subtree:true});});
})();