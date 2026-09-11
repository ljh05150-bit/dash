(function(){
  'use strict';

  const SUPABASE_URL='https://ixuxaqerdftadfnkxxui.supabase.co';
  const SUPABASE_KEY='sb_publishable_2Q42l50u-YjgBmu5xDvoAA_LUtLhm8j';

  const TAXONOMY=[
    ['수입',['현금','상여금','부수입','월세수입','투자수익','보증금','기타수입']],
    ['저축',['적금','예금','근로소득저축','대출상환','자본소득저축']],
    ['고정지출',['주거비','보험료','통신비','교통비','주거비기타','대출원리금']],
    ['식비',[{label:'식비',value:'식비'},{label:'외식',value:'식비/외식'}]],
    ['용돈',['부모님','가족']],
    ['생활용품',['생필품/소모품','수리비','주방/욕실']],
    ['의복/미용',['의류','뷰티','헤어']],
    ['육아비',['분유/기저귀','병원비','의류','소모품','기타']],
    ['건강',['병원/약국','영양제']],
    ['자기계발',['강의','책','응시료','공연']],
    ['경조사',['가족','지인']],
    ['투자관련',['부동산구매','다가구운영비','기타비용','세금','보증금반환']],
    ['차량',['주유비','수리비','범칙금','기타']],
    ['공연/예술',['주최외부미팅','술외부미팅']],
    ['선물',['가족','지인']],
    ['취미',['여행','운동 등','공연/영화','기타']],
    ['외부식비',['주최외부미팅','술외부미팅']]
  ];

  function itemSpec(group,item){
    if(item && typeof item==='object')return {label:item.label,value:item.value};
    return {label:String(item),value:`${group}/${item}`};
  }

  const VALUES=new Set(TAXONOMY.flatMap(([group,items])=>items.map(item=>itemSpec(group,item).value)));
  const client=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:'family-finance-auth'}
  });

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function injectStyle(){
    if(document.getElementById('transactionCategoryEditorStyles'))return;
    const style=document.createElement('style');
    style.id='transactionCategoryEditorStyles';
    style.textContent=`
      .category-editor{display:grid;grid-template-columns:74px minmax(0,1fr);gap:8px;align-items:center;margin-top:10px}
      .category-editor-label{font-size:11px;color:var(--muted)}
      .category-select{width:100%;min-width:0;border:1px solid #2a4d6d;background:#081525;color:var(--text);border-radius:12px;padding:10px 34px 10px 11px;font-size:12px;font-weight:700}
      .category-select:disabled{opacity:.5}
      .category-save-status{grid-column:2;min-height:15px;font-size:10px;color:var(--green);margin-top:-3px}
    `;
    document.head.append(style);
  }

  function currentModalCategory(){
    return String(document.getElementById('memoDetailTitle')?.textContent||'').trim();
  }

  function optionMarkup(current){
    let html='';
    if(current && !VALUES.has(current) && current!=='미분류'){
      html+=`<optgroup label="현재 분류"><option value="${esc(current)}" selected>${esc(current)}</option></optgroup>`;
    }
    TAXONOMY.forEach(([group,items])=>{
      html+=`<optgroup label="${esc(group)}">`;
      items.forEach(item=>{
        const spec=itemSpec(group,item);
        html+=`<option value="${esc(spec.value)}"${spec.value===current?' selected':''}>${esc(spec.label)}</option>`;
      });
      html+='</optgroup>';
    });
    html+=`<optgroup label="관리"><option value="미분류"${current==='미분류'?' selected':''}>미분류</option></optgroup>`;
    return html;
  }

  function enhanceRows(){
    const root=document.getElementById('transactionMemoBackdrop');
    if(!root||root.hidden)return;
    const current=currentModalCategory()||'미분류';
    root.querySelectorAll('.memo-tx').forEach(tx=>{
      if(tx.querySelector('.category-editor'))return;
      const saveButton=tx.querySelector('.memo-save');
      const editor=tx.querySelector('.memo-editor');
      const id=saveButton?.dataset.id;
      if(!id||!editor)return;
      const wrap=document.createElement('div');
      wrap.className='category-editor';
      wrap.innerHTML=`<label class="category-editor-label">카테고리</label><select class="category-select" data-id="${esc(id)}" aria-label="거래 카테고리">${optionMarkup(current)}</select><div class="category-save-status" aria-live="polite"></div>`;
      editor.before(wrap);
    });
  }

  async function saveCategory(select){
    const id=select.dataset.id;
    const category=select.value;
    const wrap=select.closest('.category-editor');
    const status=wrap?.querySelector('.category-save-status');
    if(!id||!category)return;

    select.disabled=true;
    if(status)status.textContent='저장 중…';
    const {data,error}=await client.from('transactions')
      .update({category})
      .eq('id',id)
      .select('id,category')
      .single();

    if(error){
      if(status)status.textContent='저장 실패';
      select.disabled=false;
      return;
    }

    select.value=data?.category||category;
    if(status)status.textContent='저장됨 · 합계 갱신 중';
    setTimeout(()=>{
      const modal=document.getElementById('transactionMemoBackdrop');
      if(modal)modal.hidden=true;
      document.body.classList.remove('memo-detail-open');
      document.getElementById('refresh')?.click();
    },350);
  }

  function setup(){
    injectStyle();
    const root=document.getElementById('transactionMemoBackdrop');
    if(!root)return;

    const observer=new MutationObserver(()=>enhanceRows());
    observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    root.addEventListener('change',event=>{
      const select=event.target.closest('.category-select');
      if(select)saveCategory(select);
    });
    enhanceRows();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
