(function(global){
  'use strict';

  const SUPABASE_URL='https://ixuxaqerdftadfnkxxui.supabase.co';
  const SUPABASE_KEY='sb_publishable_2Q42l50u-YjgBmu5xDvoAA_LUtLhm8j';
  const BUSINESS_CATEGORY='사업비';
  const BUSINESS_ALIASES=new Set(['임대사업비','임대/사업비','임대중개수수료','임대/중개수수료','임대전기수리비','임대/전기수리비','임대방충망수리비','임대/방충망수리비','사업비']);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>Math.round(Math.abs(Number(value)||0)).toLocaleString('ko-KR')+'원';

  function canonicalCategory(value){
    const raw=String(value||'미분류').trim()||'미분류';
    const compact=raw.replace(/\s+/g,'');
    return BUSINESS_ALIASES.has(raw)||BUSINESS_ALIASES.has(compact)?BUSINESS_CATEGORY:raw;
  }

  if(global.SettlementData?.createRepository){
    const previousCreate=global.SettlementData.createRepository;
    global.SettlementData.canonicalCategory=canonicalCategory;
    global.SettlementData.createRepository=function(client,flow,now){
      const repo=previousCreate(client,flow,now);
      const normalize=record=>{
        if(!record||typeof record!=='object')return record;
        const categories=Object.create(null);
        Object.entries(record.categories||{}).forEach(([name,amount])=>{
          const key=canonicalCategory(name),n=Number(amount);
          if(Number.isFinite(n))categories[key]=(categories[key]||0)+n;
        });
        return {...record,categories};
      };
      return {
        ...repo,
        async getMonth(...args){return normalize(await repo.getMonth(...args));},
        async getYear(...args){return (await repo.getYear(...args)).map(normalize);}
      };
    };
  }

  const client=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:'family-finance-auth'}
  });
  const cache=new Map();

  function period(){return {year:Number(document.getElementById('yearSelect')?.value),month:Number(document.getElementById('monthSelect')?.value)}}
  function bounds(year,month){return {start:new Date(year,month-1,1).toISOString(),end:new Date(year,month,1).toISOString()}}
  function impact(row){const n=Number(row.amount);if(!Number.isFinite(n)||n===0)return null;if(n<0)return Math.abs(n);if(n>0&&String(row.source||'')==='toss_statement_refund')return -n;return null}

  async function loadMonth(year,month){
    const key=`${year}-${String(month).padStart(2,'0')}`;
    if(cache.has(key))return cache.get(key);
    const promise=(async()=>{
      const {start,end}=bounds(year,month),rows=[];
      for(let offset=0;;offset+=1000){
        const {data,error}=await client.from('transactions')
          .select('id,occurred_at,source,account,merchant,category,amount,memo,household_id')
          .gte('occurred_at',start).lt('occurred_at',end)
          .order('occurred_at',{ascending:false}).order('id',{ascending:false})
          .range(offset,offset+999);
        if(error)throw error;
        rows.push(...(data||[]));
        if(!data||data.length<1000)break;
      }
      return rows;
    })();
    cache.set(key,promise);
    try{return await promise}catch(error){cache.delete(key);throw error}
  }

  function injectStyle(){
    if(document.getElementById('transactionMemoStyles'))return;
    const style=document.createElement('style');
    style.id='transactionMemoStyles';
    style.textContent=`
      .memo-detail-backdrop{position:fixed;inset:0;z-index:10020;background:rgba(1,6,12,.78);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:flex;align-items:flex-end;justify-content:center;padding-top:40px}
      .memo-detail-sheet{width:min(650px,100%);max-height:86vh;overflow:auto;background:linear-gradient(180deg,#0d1e31,#081421);border:1px solid #234c70;border-bottom:0;border-radius:28px 28px 0 0;padding:10px 18px calc(25px + env(safe-area-inset-bottom));box-shadow:0 -16px 50px rgba(0,0,0,.5)}
      .memo-detail-handle{width:42px;height:5px;border-radius:999px;background:#40536a;margin:2px auto 15px}
      .memo-detail-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding-bottom:13px;border-bottom:1px solid var(--line2)}
      .memo-detail-title{font-size:21px;font-weight:850;letter-spacing:-.035em}.memo-detail-sub{font-size:12px;color:var(--muted);margin-top:5px}
      .memo-detail-close{width:38px;height:38px;border:1px solid #294c6d;background:#102137;color:#dbe8f5;border-radius:13px;font-size:21px;flex:0 0 auto}
      .memo-total{display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:15px 2px 7px;color:var(--muted);font-size:12px}.memo-total strong{color:var(--text);font-size:18px}
      .memo-tx{padding:15px 2px;border-top:1px solid var(--line2)}.memo-tx:first-child{border-top:0}
      .memo-tx-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start}.memo-merchant{font-size:14px;font-weight:800;line-height:1.35}.memo-meta{font-size:11px;color:var(--muted);line-height:1.55;margin-top:4px;overflow-wrap:anywhere}.memo-amount{font-size:14px;font-weight:850;white-space:nowrap;color:#8abfff}.memo-amount.refund{color:var(--green)}
      .memo-editor{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:10px}.memo-input{width:100%;min-width:0;border:1px solid #2a4d6d;background:#081525;color:var(--text);border-radius:12px;padding:10px 11px;font-size:12px}.memo-input::placeholder{color:#607991}.memo-save{border:1px solid #315d83;background:#143250;color:#eaf4ff;border-radius:12px;padding:0 12px;font-size:12px;font-weight:750}.memo-save:disabled{opacity:.45}.memo-status{min-height:17px;font-size:10px;color:var(--green);margin-top:4px}.memo-empty{padding:28px 4px;text-align:center;color:var(--muted);font-size:13px;line-height:1.7}
      body.memo-detail-open{overflow:hidden}
    `;
    document.head.append(style);
  }

  function ensureModal(){
    let root=document.getElementById('transactionMemoBackdrop');
    if(root)return root;
    root=document.createElement('div');
    root.id='transactionMemoBackdrop';root.className='memo-detail-backdrop';root.hidden=true;
    root.innerHTML=`<section class="memo-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="memoDetailTitle"><div class="memo-detail-handle"></div><div class="memo-detail-head"><div><div class="memo-detail-title" id="memoDetailTitle">세부내역</div><div class="memo-detail-sub" id="memoDetailSub"></div></div><button class="memo-detail-close" type="button" aria-label="닫기">×</button></div><div id="memoDetailBody"></div></section>`;
    document.body.append(root);
    root.addEventListener('click',event=>{if(event.target===root)closeModal()});
    root.querySelector('.memo-detail-close').addEventListener('click',closeModal);
    root.addEventListener('click',event=>{const button=event.target.closest('.memo-save');if(button)saveMemo(button)});
    root.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.classList.contains('memo-input')){event.preventDefault();saveMemo(event.target.closest('.memo-editor').querySelector('.memo-save'))}});
    return root;
  }
  function closeModal(){const root=document.getElementById('transactionMemoBackdrop');if(root){root.hidden=true;document.body.classList.remove('memo-detail-open')}}

  async function saveMemo(button){
    const editor=button.closest('.memo-editor'),input=editor.querySelector('.memo-input'),status=editor.parentElement.querySelector('.memo-status');
    const id=button.dataset.id,memo=input.value.trim();
    button.disabled=true;status.textContent='저장 중…';
    const {error}=await client.from('transactions').update({memo:memo||null}).eq('id',id);
    if(error){status.textContent='저장 실패';button.disabled=false;return}
    for(const promise of cache.values()){
      Promise.resolve(promise).then(rows=>{const row=rows.find(x=>x.id===id);if(row)row.memo=memo||null}).catch(()=>{});
    }
    status.textContent='저장됨';button.disabled=false;
    setTimeout(()=>{if(status.textContent==='저장됨')status.textContent=''},1200);
  }

  async function openCategory(row){
    const category=canonicalCategory(row.dataset.categoryDetail||'');if(!category)return;
    const {year,month}=period();if(!year||!month)return;
    const totalText=row.querySelector('.breakdown-head strong')?.textContent?.trim()||'—';
    const root=ensureModal();root.querySelector('#memoDetailTitle').textContent=category;root.querySelector('#memoDetailSub').textContent=`${year}년 ${month}월 · 불러오는 중`;
    root.querySelector('#memoDetailBody').innerHTML=`<div class="memo-total"><span>결산 금액</span><strong>${esc(totalText)}</strong></div><div class="memo-empty">세부내역을 불러오고 있습니다.</div>`;
    root.hidden=false;document.body.classList.add('memo-detail-open');
    try{
      const rows=(await loadMonth(year,month)).filter(tx=>canonicalCategory(tx.category)===category&&impact(tx)!==null);
      root.querySelector('#memoDetailSub').textContent=`${year}년 ${month}월 · ${rows.length.toLocaleString('ko-KR')}건`;
      const list=rows.length?rows.map(tx=>{
        const n=impact(tx),refund=n<0,date=new Date(tx.occurred_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
        const merchant=tx.merchant||tx.category||tx.account||tx.source||'거래',payment=tx.account||tx.source||'결제수단 미분류';
        return `<div class="memo-tx"><div class="memo-tx-top"><div><div class="memo-merchant">${esc(merchant)}</div><div class="memo-meta">${esc(date)} · ${esc(payment)}</div></div><div class="memo-amount ${refund?'refund':''}">${refund?'+':'−'}${money(tx.amount)}${refund?' 환불':''}</div></div><div class="memo-editor"><input class="memo-input" maxlength="120" value="${esc(tx.memo||'')}" placeholder="메모 입력 (예: 401호 방충망 교체)"><button class="memo-save" type="button" data-id="${esc(tx.id)}">저장</button></div><div class="memo-status" aria-live="polite"></div></div>`;
      }).join(''):'<div class="memo-empty">이 카테고리에 연결된 거래내역이 없습니다.</div>';
      root.querySelector('#memoDetailBody').innerHTML=`<div class="memo-total"><span>결산 금액</span><strong>${esc(totalText)}</strong></div>${list}`;
    }catch(error){root.querySelector('#memoDetailBody').innerHTML=`<div class="memo-empty">세부내역을 불러오지 못했습니다.<br>${esc(error?.message||'네트워크 연결을 확인해 주세요.')}</div>`}
  }

  function setup(){
    injectStyle();ensureModal();
    const report=document.getElementById('report');if(!report)return;
    report.addEventListener('click',event=>{
      const row=event.target.closest('.breakdown-row[data-category-detail]');if(!row)return;
      const monthly=document.getElementById('monthlyTab')?.getAttribute('aria-selected')==='true';if(!monthly)return;
      event.preventDefault();event.stopImmediatePropagation();openCategory(row);
    },true);
    document.getElementById('refresh')?.addEventListener('click',()=>cache.clear());
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('transactionMemoBackdrop')?.hidden)closeModal()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})(window);
