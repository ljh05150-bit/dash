(function(){
  'use strict';

  function isChildcare(value){
    const raw=String(value||'').trim();
    return raw==='육아'||raw==='육아/교육'||raw==='육아비'||raw.startsWith('육아비/');
  }

  function mergeChildcareOptions(select){
    if(!select)return;
    const selected=select.value;
    const shouldSelect=isChildcare(selected);

    [...select.querySelectorAll('option')].forEach(option=>{
      if(isChildcare(option.value))option.remove();
    });
    [...select.querySelectorAll('optgroup')].forEach(group=>{
      if(group.label==='육아비'||group.children.length===0)group.remove();
    });

    const group=document.createElement('optgroup');
    group.label='육아비';
    const option=document.createElement('option');
    option.value='육아비';
    option.textContent='육아비';
    group.appendChild(option);

    const manage=[...select.querySelectorAll('optgroup')].find(item=>item.label==='관리');
    if(manage)select.insertBefore(group,manage);
    else select.appendChild(group);

    if(shouldSelect)select.value='육아비';
  }

  function refresh(){
    document.querySelectorAll('#safeV2Category,.category-select,#recentCategory,#recentEditCategory').forEach(mergeChildcareOptions);
  }

  let scheduled=false;
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;refresh();});
  }

  const observer=new MutationObserver(schedule);
  function setup(){
    refresh();
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('change',event=>{
      const select=event.target.closest?.('#safeV2Category,.category-select,#recentCategory,#recentEditCategory');
      if(select&&isChildcare(select.value))select.value='육아비';
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
