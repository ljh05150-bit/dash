(function(){
  'use strict';
  if(window.__recentTransactionEditorLoaded)return;
  window.__recentTransactionEditorLoaded=true;

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
    ['외부식비',['주최외부미팅','술외부미팅']],
    ['구독',[{label:'서비스',value:'구독/서비스'}]]
  ];

  const client=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:'family-finance-auth'}
  });
  let recentRows=[];
  let syncTimer=null;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const itemSpec=(group,item)=>item&&typeof item==='object'?item:{label:String(item),value:`${group}/${item}`};
  const allValues=new Set(TAXONOMY.flatMap(([group,items])=>items.map(item=>itemSpec(group,item).value)));
  const won=v=>'₩'+Math.round(Math.abs(Number(v)||0)).toLocaleString('ko-KR');

  function options(current){
    let html='';
    if(current&&!allValues.has(current)&&current!=='미분류')html+=`<optgroup label="현재 분류"><option value="${esc(current)}" selected>${esc(current)}</option></optgroup>`;
    for(const [group,items] of TAXONOMY){
      html+=`<optgroup label="${esc(group)}">`;
      for(const item of items){
        const spec=itemSpec(group,item);
        html+=`<option value="${esc(spec.value)}"${spec.value===current?' selected':''}>${esc(spec.label)}</option>`;
      }
      html+='</optgroup>';
    }
    html+=`<optgroup label="관리"><option value="미분류"${current==='미분류'?' selected':''}>미분류</option></optgroup>`;
    return html;
  }

  function injectStyle(){
    if(document.getElementById('recentTransactionEditorStyles'))return;
    const style=document.createElement('style');
    style.id='recentTransactionEditorStyles';
    style.textContent=`
      #txrows .tx-row[data-recent-edit]{cursor:pointer;position:relative;padding-right:22px;border-radius:12px;outline:none}
      #txrows .tx-row[data-recent-edit]:active{background:#10243a}
      #txrows .tx-row[data-recent-edit]::after{content:'›';position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:20px;color:#617f9f}
      #txrows .tx-row[data-recent-edit]:focus-visible{box-shadow:0 0 0 2px var(--blue) inset}
      .tx-quick-memo{font-size:9px;color:#9fb3c8;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .recent-edit-backdrop[hidden]{display:none!important}
      .recent-edit-backdrop{position:fixed;inset:0;z-index:10050;background:rgba(1,6,12,.78);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:flex;align-items:flex-end;justify-content:center;padding-top:40px}
      .recent-edit-sheet{width:min(620px,100%);background:linear-gradient(180deg,#0d1e31,#081421);border:1px solid #234c70;border-bottom:0;border-radius:28px 28px 0 0;padding:10px 18px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -16px 50px rgba(0,0,0,.5)}
      .recent-edit-handle{width:42px;height:5px;border-radius:999px;background:#40536a;margin:2px auto 15px}
      .recent-edit-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid var(--line2)}
      .recent-edit-title{font-size:20px;font-weight:850;line-height:1.3}.recent-edit-sub{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.5}.recent-edit-amount{font-size:18px;font-weight:850;margin-top:5px;color:#8abfff}
      .recent-edit-close{width:38px;height:38px;border:1px solid #294c6d;background:#102137;color:#dbe8f5;border-radius:13px;font-size:21px;flex:0 0 auto}
      .recent-edit-field{margin-top:14px}.recent-edit-field label{display:block;font-size:11px;color:var(--muted);margin-bottom:6px}
      .recent-edit-field select,.recent-edit-field input{width:100%;border:1px solid #2a4d6d;background:#081525;color:var(--text);border-radius:13px;padding:12px;font-size:13px}
      .recent-edit-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}.recent-edit-actions button{border:1px solid #315d83;background:#10253b;color:#eaf4ff;border-radius:13px;padding:12px;font-size:13px;font-weight:800}.recent-edit-actions .primary{background:#16446d;border-color:#3979aa}.recent-edit-status{min-height:18px;font-size:11px;color:var(--green);margin-top:7px;text-align:right}
      body.recent-edit-open{overflow:hidden}
    `;
    document.head.append(style);
  }

  function destroyModal(){
    const root=document.getElementById('recentTransactionEditor');
    if(root)root.remove();
    document.body.classList.remove('recent-edit-open');
  }

  function ensureModal(){
    let root=document.getElementById('recentTransactionEditor');
    if(root)return root;
    root=document.createElement('div');
    root.id='recentTransactionEditor';
    root.className='recent-edit-backdrop';
    root.innerHTML=`<section class="recent-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="recentEditTitle"><div class="recent-edit-handle"></div><div class="recent-edit-head"><div><div class="recent-edit-title" id="recentEditTitle">거래 수정</div><div class="recent-edit-sub" id="recentEditSub"></div><div class="recent-edit-amount" id="recentEditAmount"></div></div><button class="recent-edit-close" type="button" aria-label="닫기">×</button></div><div class="recent-edit-field"><label for="recentEditCategory">카테고리</label><select id="recentEditCategory"></select></div><div class="recent-edit-field"><label for="recentEditMemo">메모</label><input id="recentEditMemo" maxlength="120" placeholder="무엇에 쓴 돈인지 적어두세요"></div><div class="recent-edit-actions"><button type="button" data-action="cancel">취소</button><button class="primary" type="button" data-action="save">저장</button></div><div class="recent-edit-status" id="recentEditStatus" aria-live="polite"></div></section>`;
    document.body.append(root);
    root.addEventListener('click',event=>{
      if(event.target===root||event.target.closest('[data-action="cancel"]')||event.target.closest('.recent-edit-close'))destroyModal();
      if(event.target.closest('[data-action="save"]'))saveCurrent();
    });
    return root;
  }

  function openModal(tx){
    destroyModal();
    const root=ensureModal();
    root.dataset.id=tx.id;
    document.getElementById('recentEditTitle').textContent=tx.merchant||tx.category||'거래';
    document.getElementById('recentEditSub').textContent=`${new Date(tx.occurred_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${tx.account||tx.source||''}`;
    document.getElementById('recentEditAmount').textContent=`${Number(tx.amount)>=0?'+':'−'}${won(tx.amount)}`;
    document.getElementById('recentEditCategory').innerHTML=options(tx.category||'미분류');
    document.getElementById('recentEditMemo').value=tx.memo||'';
    document.getElementById('recentEditStatus').textContent='';
    document.body.classList.add('recent-edit-open');
  }

  async function saveCurrent(){
    const root=document.getElementById('recentTransactionEditor');
    const id=root?.dataset.id;
    if(!id)return;
    const category=document.getElementById('recentEditCategory').value;
    const memo=document.getElementById('recentEditMemo').value.trim();
    const status=document.getElementById('recentEditStatus');
    const button=root.querySelector('[data-action="save"]');
    button.disabled=true;
    status.textContent='저장 중…';
    const {data,error}=await client.from('transactions').update({category,memo:memo||null}).eq('id',id).select('id,category,memo').single();
    if(error){status.textContent='저장 실패';button.disabled=false;return;}
    const tx=recentRows.find(row=>row.id===id);
    if(tx){tx.category=data.category;tx.memo=data.memo;}
    status.textContent='저장됨';
    button.disabled=false;
    await syncRows();
    setTimeout(()=>{destroyModal();if(typeof window.load==='function')window.load();},180);
  }

  async function syncRows(){
    const host=document.getElementById('txrows');
    if(!host)return;
    const {data,error}=await client.from('transactions').select('id,occurred_at,source,account,merchant,category,amount,memo').order('occurred_at',{ascending:false}).limit(5);
    if(error)return;
    recentRows=data||[];
    const byId=new Map(recentRows.map(tx=>[String(tx.id),tx]));
    const domRows=[...host.querySelectorAll('.tx-row')].slice(0,5);
    domRows.forEach((row,index)=>{
      const existingId=row.dataset.recentEdit;
      const tx=(existingId&&byId.get(String(existingId)))||(!existingId?recentRows[index]:null);
      if(!tx)return;
      if(!existingId)row.dataset.recentEdit=tx.id;
      row.tabIndex=0;
      row.setAttribute('role','button');
      row.setAttribute('aria-label',`${tx.merchant||'거래'} 수정`);
      const main=row.querySelector('.tx-main');
      let memoEl=main?.querySelector('.tx-quick-memo');
      if(tx.memo){
        if(!memoEl){memoEl=document.createElement('div');memoEl.className='tx-quick-memo';main?.append(memoEl);}
        memoEl.textContent='메모 · '+tx.memo;
      }else memoEl?.remove();
    });
  }

  function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncRows(),40);}

  function setup(){
    const host=document.getElementById('txrows');
    if(!host)return;
    injectStyle();
    destroyModal();
    const observer=new MutationObserver(scheduleSync);
    observer.observe(host,{childList:true,subtree:true});
    host.addEventListener('click',event=>{
      const row=event.target.closest('.tx-row[data-recent-edit]');
      if(!row)return;
      const tx=recentRows.find(item=>item.id===row.dataset.recentEdit);
      if(tx)openModal(tx);
    });
    host.addEventListener('keydown',event=>{
      if(!['Enter',' '].includes(event.key))return;
      const row=event.target.closest('.tx-row[data-recent-edit]');
      if(!row)return;
      event.preventDefault();
      const tx=recentRows.find(item=>item.id===row.dataset.recentEdit);
      if(tx)openModal(tx);
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape')destroyModal();});
    scheduleSync();
  }

  window.addEventListener('pagehide',destroyModal);
  window.addEventListener('pageshow',()=>{destroyModal();scheduleSync();});
  window.addEventListener('popstate',()=>{destroyModal();scheduleSync();});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();