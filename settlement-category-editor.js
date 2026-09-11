(function(){
  'use strict';

  const SUPABASE_URL='https://ixuxaqerdftadfnkxxui.supabase.co';
  const SUPABASE_KEY='sb_publishable_2Q42l50u-YjgBmu5xDvoAA_LUtLhm8j';
  const CATEGORIES=[
    '생활비',
    '식비/외식',
    '사업비',
    '교통/주유',
    '의료/건강',
    '육아/교육',
    '구독/서비스',
    '의류/쇼핑',
    '주거/월세',
    '임대/도배비',
    '임대/바닥공사비',
    '현금인출',
    '송금/기타',
    '기타',
    '미분류'
  ];

  const client=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:'family-finance-auth'}
  });

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
    const values=CATEGORIES.includes(current)?CATEGORIES:[current,...CATEGORIES];
    return values.map(value=>`<option value="${value.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"${value===current?' selected':''}>${value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</option>`).join('');
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
      wrap.innerHTML=`<label class="category-editor-label">카테고리</label><select class="category-select" data-id="${id}" aria-label="거래 카테고리">${optionMarkup(current)}</select><div class="category-save-status" aria-live="polite"></div>`;
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
