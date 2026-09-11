(function(global){
  'use strict';

  const RENT_CATEGORY='임대/사업비';
  const RENT_ALIASES=new Set([
    '임대사업비',
    '임대/사업비',
    '임대중개수수료',
    '임대전기수리비'
  ]);

  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function canonicalCategory(value){
    const raw=String(value||'미분류').trim()||'미분류';
    const compact=raw.replace(/\s+/g,'');
    return RENT_ALIASES.has(compact)?RENT_CATEGORY:raw;
  }

  function mergeCategoryMap(values){
    const merged=Object.create(null);
    Object.entries(values||{}).forEach(([label,amount])=>{
      const n=Number(amount);
      if(!Number.isFinite(n))return;
      const key=canonicalCategory(label);
      merged[key]=(merged[key]||0)+n;
    });
    return merged;
  }

  function normalizeRecord(record){
    if(!record||typeof record!=='object')return record;
    return {...record,categories:mergeCategoryMap(record.categories)};
  }

  let detailClient=null;
  if(global.SettlementData?.createRepository){
    const originalCreateRepository=global.SettlementData.createRepository;
    global.SettlementData.canonicalCategory=canonicalCategory;
    global.SettlementData.createRepository=function(client,flow,now){
      detailClient=client;
      const repository=originalCreateRepository(client,flow,now);
      return {
        ...repository,
        async getMonth(...args){return normalizeRecord(await repository.getMonth(...args));},
        async getYear(...args){return (await repository.getYear(...args)).map(normalizeRecord);}
      };
    };
  }

  const txCache=new Map();
  const money=value=>Math.round(Math.abs(Number(value)||0)).toLocaleString('ko-KR')+'원';

  function selectedPeriod(){
    return {
      year:Number(document.getElementById('yearSelect')?.value),
      month:Number(document.getElementById('monthSelect')?.value)
    };
  }

  function monthBounds(year,month){
    return {
      start:new Date(year,month-1,1).toISOString(),
      end:new Date(year,month,1).toISOString()
    };
  }

  async function loadTransactions(year,month){
    const key=`${year}-${String(month).padStart(2,'0')}`;
    if(txCache.has(key))return txCache.get(key);
    if(!detailClient)throw new Error('거래 연결을 준비하지 못했습니다. 새로고침해 주세요.');

    const promise=(async()=>{
      const {start,end}=monthBounds(year,month);
      const rows=[];
      for(let offset=0;;offset+=1000){
        const {data,error}=await detailClient.from('transactions')
          .select('id,occurred_at,source,account,merchant,category,amount,household_id')
          .gte('occurred_at',start).lt('occurred_at',end)
          .order('occurred_at',{ascending:false}).order('id',{ascending:false})
          .range(offset,offset+999);
        if(error)throw error;
        rows.push(...(data||[]));
        if(!data||data.length<1000)break;
      }
      return rows;
    })();

    txCache.set(key,promise);
    try{return await promise;}catch(error){txCache.delete(key);throw error;}
  }

  function categoryImpact(row){
    const amount=Number(row.amount);
    if(!Number.isFinite(amount)||amount===0)return null;
    if(amount<0)return Math.abs(amount);
    if(amount>0&&String(row.source||'')==='toss_statement_refund')return -amount;
    return null;
  }

  function categoryRows(rows,category){
    return (rows||[]).filter(row=>{
      if(canonicalCategory(row.category)!==category)return false;
      return categoryImpact(row)!==null;
    });
  }

  function injectStyles(){
    if(document.getElementById('settlementEnhancementStyles'))return;
    const style=document.createElement('style');
    style.id='settlementEnhancementStyles';
    style.textContent=`
      .breakdown-row[data-category-detail]{position:relative;cursor:pointer;padding:10px 30px 10px 10px;margin:-10px;border-radius:13px;transition:background .15s,border-color .15s;outline:none}
      .breakdown-row[data-category-detail]:hover,.breakdown-row[data-category-detail]:focus-visible{background:#10253b}
      .breakdown-row[data-category-detail]:focus-visible{box-shadow:0 0 0 2px var(--blue) inset}
      .breakdown-row[data-category-detail]::after{content:'›';position:absolute;right:10px;top:10px;color:#6f94ba;font-size:21px;line-height:1}
      .breakdown-row[data-category-detail] .track{margin-right:-20px}
      .category-detail-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(1,6,12,.76);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:flex;align-items:flex-end;justify-content:center;padding-top:40px}
      .category-detail-sheet{width:min(620px,100%);max-height:84vh;overflow:auto;background:linear-gradient(180deg,#0d1e31,#081421);border:1px solid #234c70;border-bottom:0;border-radius:28px 28px 0 0;padding:10px 18px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -16px 50px rgba(0,0,0,.48)}
      .category-detail-handle{width:42px;height:5px;border-radius:999px;background:#40536a;margin:2px auto 15px}
      .category-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding-bottom:13px;border-bottom:1px solid var(--line2)}
      .category-detail-title{font-size:21px;font-weight:850;letter-spacing:-.035em}
      .category-detail-sub{font-size:12px;color:var(--muted);margin-top:5px;line-height:1.5}
      .category-detail-close{flex:0 0 auto;width:38px;height:38px;border:1px solid #294c6d;background:#102137;color:#dbe8f5;border-radius:13px;font-size:21px}
      .category-detail-summary{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:15px 2px 8px;color:var(--muted);font-size:12px}
      .category-detail-summary strong{font-size:18px;color:var(--text)}
      .category-detail-list{margin-top:4px}
      .category-detail-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:13px 2px;border-top:1px solid var(--line2)}
      .category-detail-row:first-child{border-top:0}
      .category-detail-merchant{font-size:14px;font-weight:780;line-height:1.35;overflow-wrap:anywhere}
      .category-detail-meta{font-size:11px;color:var(--muted);line-height:1.55;margin-top:4px;overflow-wrap:anywhere}
      .category-detail-amount{text-align:right;font-size:14px;font-weight:800;white-space:nowrap;color:#8abfff}
      .category-detail-amount.refund{color:var(--green)}
      .category-detail-empty{padding:28px 4px;color:var(--muted);font-size:13px;line-height:1.7;text-align:center}
      body.category-detail-open{overflow:hidden}
    `;
    document.head.append(style);
  }

  function ensureSheet(){
    let backdrop=document.getElementById('categoryDetailBackdrop');
    if(backdrop)return backdrop;
    backdrop=document.createElement('div');
    backdrop.id='categoryDetailBackdrop';
    backdrop.className='category-detail-backdrop';
    backdrop.hidden=true;
    backdrop.innerHTML=`<section class="category-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="categoryDetailTitle">
      <div class="category-detail-handle"></div>
      <div class="category-detail-head">
        <div><div class="category-detail-title" id="categoryDetailTitle">카테고리 상세</div><div class="category-detail-sub" id="categoryDetailSub"></div></div>
        <button class="category-detail-close" id="categoryDetailClose" type="button" aria-label="닫기">×</button>
      </div>
      <div id="categoryDetailBody"></div>
    </section>`;
    document.body.append(backdrop);
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeSheet();});
    backdrop.querySelector('#categoryDetailClose').addEventListener('click',closeSheet);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!backdrop.hidden)closeSheet();});
    return backdrop;
  }

  function closeSheet(){
    const backdrop=document.getElementById('categoryDetailBackdrop');
    if(!backdrop)return;
    backdrop.hidden=true;
    document.body.classList.remove('category-detail-open');
  }

  function renderLoading(category,year,month,totalText){
    const backdrop=ensureSheet();
    backdrop.querySelector('#categoryDetailTitle').textContent=category;
    backdrop.querySelector('#categoryDetailSub').textContent=`${year}년 ${month}월 · 세부내역 불러오는 중`;
    backdrop.querySelector('#categoryDetailBody').innerHTML=`<div class="category-detail-summary"><span>결산 금액</span><strong class="num">${escapeHtml(totalText||'—')}</strong></div><div class="category-detail-empty">거래내역을 불러오고 있습니다.</div>`;
    backdrop.hidden=false;
    document.body.classList.add('category-detail-open');
    backdrop.querySelector('#categoryDetailClose').focus({preventScroll:true});
  }

  function renderDetails(category,year,month,totalText,rows){
    const backdrop=ensureSheet();
    const body=backdrop.querySelector('#categoryDetailBody');
    backdrop.querySelector('#categoryDetailSub').textContent=`${year}년 ${month}월 · ${rows.length.toLocaleString('ko-KR')}건`;
    const list=rows.length?rows.map(row=>{
      const impact=categoryImpact(row);
      const isRefund=impact<0;
      const date=new Date(row.occurred_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      const merchant=row.merchant||row.category||row.account||row.source||'거래';
      const payment=row.account||row.source||'결제수단 미분류';
      const original=String(row.category||'미분류').trim()||'미분류';
      const categoryNote=category===RENT_CATEGORY&&original!==RENT_CATEGORY?` · ${original}`:'';
      return `<div class="category-detail-row"><div><div class="category-detail-merchant">${escapeHtml(merchant)}</div><div class="category-detail-meta">${escapeHtml(date)} · ${escapeHtml(payment)}${escapeHtml(categoryNote)}</div></div><div class="category-detail-amount ${isRefund?'refund':''}">${isRefund?'+':'−'}${money(row.amount)}${isRefund?' 환불':''}</div></div>`;
    }).join(''):`<div class="category-detail-empty">이 카테고리에 연결된 거래내역이 없습니다.</div>`;
    body.innerHTML=`<div class="category-detail-summary"><span>결산 금액</span><strong class="num">${escapeHtml(totalText||'—')}</strong></div><div class="category-detail-list">${list}</div>`;
  }

  function renderError(error){
    const body=document.getElementById('categoryDetailBody');
    if(body)body.innerHTML=`<div class="category-detail-empty">세부내역을 불러오지 못했습니다.<br>${escapeHtml(error?.message||'네트워크 연결을 확인해 주세요.')}</div>`;
  }

  async function openCategoryDetail(row){
    const category=String(row.dataset.categoryDetail||'').trim();
    if(!category)return;
    const {year,month}=selectedPeriod();
    if(!Number.isFinite(year)||!Number.isFinite(month))return;
    const totalText=row.querySelector('.breakdown-head strong')?.textContent?.trim()||'—';
    renderLoading(category,year,month,totalText);
    try{
      const rows=categoryRows(await loadTransactions(year,month),category);
      renderDetails(category,year,month,totalText,rows);
    }catch(error){console.error('category details failed',error);renderError(error);}
  }

  function enhanceCategoryRows(){
    const monthly=document.getElementById('monthlyTab')?.getAttribute('aria-selected')==='true';
    if(!monthly)return;
    document.querySelectorAll('#report h2.section-title').forEach(title=>{
      if(title.textContent.trim()!=='카테고리별 지출')return;
      const card=title.nextElementSibling;
      if(!card?.classList.contains('card'))return;
      card.querySelectorAll('.breakdown-row').forEach(row=>{
        const name=row.querySelector('.breakdown-head span')?.textContent?.trim();
        if(!name)return;
        row.dataset.categoryDetail=canonicalCategory(name);
        row.tabIndex=0;
        row.setAttribute('role','button');
        row.setAttribute('aria-label',`${canonicalCategory(name)} 세부내역 보기`);
      });
    });
  }

  function setup(){
    injectStyles();
    ensureSheet();
    const report=document.getElementById('report');
    if(!report)return;
    const observer=new MutationObserver(()=>enhanceCategoryRows());
    observer.observe(report,{childList:true,subtree:true});
    report.addEventListener('click',event=>{
      const row=event.target.closest('.breakdown-row[data-category-detail]');
      if(row)openCategoryDetail(row);
    });
    report.addEventListener('keydown',event=>{
      if(!['Enter',' '].includes(event.key))return;
      const row=event.target.closest('.breakdown-row[data-category-detail]');
      if(!row)return;
      event.preventDefault();openCategoryDetail(row);
    });
    document.getElementById('refresh')?.addEventListener('click',()=>txCache.clear());
    enhanceCategoryRows();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})(window);
