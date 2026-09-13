(function(){
  'use strict';

  function isChildcare(value){
    const raw=String(value||'').trim();
    return raw==='육아'||raw==='육아/교육'||raw==='육아비'||raw.startsWith('육아비/');
  }

  function displayLabel(value){
    const raw=String(value||'미분류').trim()||'미분류';
    if(raw==='육아비'||raw==='미분류'||raw==='식비')return raw;
    if(raw==='식비/외식')return '외식';
    const parts=raw.split('/');
    return parts[parts.length-1]||raw;
  }

  function cleanCategoryButton(){
    const button=document.getElementById('safeV2Category');
    if(!button||button.tagName!=='BUTTON')return;
    const value=button.dataset.value||'미분류';
    button.replaceChildren(document.createTextNode(displayLabel(value)));
  }

  function mergeChildcareOptions(select){
    if(!select||select.tagName!=='SELECT')return;
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

    select.value=shouldSelect?'육아비':selected;
  }

  function refresh(){
    cleanCategoryButton();
    document.querySelectorAll('.category-select,#recentCategory,#recentEditCategory').forEach(mergeChildcareOptions);
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
      const select=event.target.closest?.('.category-select,#recentCategory,#recentEditCategory');
      if(select&&select.tagName==='SELECT'&&isChildcare(select.value))select.value='육아비';
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
