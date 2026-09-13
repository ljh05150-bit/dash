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

  const txCache=new Map();
  let detailClient=null;
  let detailSort='amount';
  let activeDetail=null;
  const detailRowsById=new Map();

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
          .select('id,occurred_at,source,account,merchant,category,amount,household_id,memo,is_fixed_expense')
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

  function splitFixedExpense(rows){
    let fixed=0,variable=0;
    (rows||[]).forEach(row=>{
      const amount=Number(row.amount);
      const category=String(row.category||'미분류').trim()||'미분류';
      if(!Number.isFinite(amount)||amount===0||category==='내부이체')return;
      const fixedRow=row.is_fixed_expense===true;
      if(amount<0){
        if(fixedRow)fixed+=Math.abs(amount); else variable+=Math.abs(amount);
      }else if(amount>0&&String(row.source||'')==='toss_statement_refund'){
        if(fixedRow)fixed-=amount; else variable-=amount;
      }
    });
    return {fixed:Math.max(0,fixed),variable:Math.max(0,variable)};
  }

  if(global.SettlementData?.createRepository){
    const originalCreateRepository=global.SettlementData.createRepository;
    global.SettlementData.canonicalCategory=canonicalCategory;
    global.SettlementData.createRepository=function(client,flow,now){
      detailClient=client;
      const repository=originalCreateRepository(client,flow,now);
      return {
        ...repository,
        async getMonth(year,month){
          const record=normalizeRecord(await repository.getMonth(year,month));
          if(record?.source!=='automatic')return record;
          try{
            const {fixed,variable}=splitFixedExpense(await loadTransactions(year,month));
            return {...record,fixed_expense:fixed,variable_expense:variable,unclassified_expense:0};
          }catch(error){
            console.warn('fixed expense split failed',error);
            return record;
          }
        },
        async getYear(year){
          const records=await repository.getYear(year);
          const enriched=[];
          for(const record of records){
            const normalized=normalizeRecord(record);
            if(normalized?.source==='automatic'){
              try{
                const {fixed,variable}=splitFixedExpense(await loadTransactions(normalized.year,normalized.month));
                enriched.push({...normalized,fixed_expense:fixed,variable_expense:variable,unclassified_expense:0});
              }catch(error){
                console.warn('fixed expense year split failed',error);
                enriched.push(normalized);
              }
            }else enriched.push(normalized);
          }
          return enriched;
        }
      };
    };
  }

  const money=value=>Math.round(Math.abs(Number(value)||0)).toLocaleString('ko-KR')+'원';

  function selectedPeriod(){
    return {
      year:Number(document.getElementById('yearSelect')?.value),
      month:Number(document.getElementById('monthSelect')?.value)
    };
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

  function sortedRows(rows){
    const result=[...(rows||[])];
    if(detailSort==='latest'){
      result.sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at));
    }else{
      result.sort((a,b)=>{
        const amountDiff=Math.abs(categoryImpact(b)||0)-Math.abs(categoryImpact(a)||0);
        return amountDiff||new Date(b.occurred_at)-new Date(a.occurred_at);
      });
    }
    return result;
  }

  function injectStyles(){
    if(document.getElementById('settlementEnhancementStyles'))return;
    const style=document.createElement('style');
    style.id='settlementEnhancementStyles';
    style.textContent=`
      .breakdown-row[data-category-detail]{position:relative;cursor:pointer;padding:10px 30px 10px 10px;margin:0;border-radius:13px;transition:background .15s,border-color .15s;outline:none;touch-action:manipulation}
      .breakdown-row[data-category-detail]:hover,.breakdown-row[data-category-detail]:focus-visible{background:#10253b}
      .breakdown-row[data-category-detail]:focus-visible{box-shadow:0 0 0 2px var(--blue) inset}
      .breakdown-row[data-category-detail]::after{content:'›';position:absolute;right:10px;top:10px;color:#6f94ba;font-size:21px;line-height:1}
      .breakdown-row[data-category-detail] .track{margin-right:0}
      .category-detail-backdrop[hidden]{display:none!important}
      .category-detail-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(1,6,12,.76);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:flex;align-items:flex-end;justify-content:center;padding-top:40px}
      .category-detail-sheet{width:min(620px,100%);max-height:84vh;overflow:auto;background:linear-gradient(180deg,#0d1e31,#081421);border:1px solid #234c70;border-bottom:0;border-radius:28px 28px 0 0;padding:10px 18px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -16px 50px rgba(0,0,0,.48)}
      .category-detail-handle{width:42px;height:5px;border-radius:999px;background:#40536a;margin:2px auto 15px}
      .category-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding-bottom:13px;border-bottom:1px solid var(--line2)}
      .category-detail-title{font-size:21px;font-weight:850;letter-spacing:-.035em}
      .category-detail-sub{font-size:12px;color:var(--muted);margin-top:5px;line-height:1.5}
      .category-detail-close{flex:0 0 auto;width:38px;height:38px;border:1px solid #294c6d;background:#102137;color:#dbe8f5;border-radius:13px;font-size:21px}
      .category-detail-summary{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:15px 2px 8px;color:var(--muted);font-size:12px}
      .category-detail-summary strong{font-size:18px;color:var(--text)}
      .category-detail-sort{display:flex;gap:7px;padding:5px 0 10px}
      .category-detail-sort button{border:1px solid #284b6c;background:#0a1929;color:#8fa6bf;border-radius:999px;padding:7px 11px;font-size:11px;font-weight:760}
      .category-detail-sort button[aria-pressed="true"]{background:#16446d;border-color:#4b9dff;color:#eef7ff}
      .category-detail-list{margin-top:2px}
      .category-detail-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:13px 22px 13px 2px;border-top:1px solid var(--line2);cursor:pointer;outline:none}
      .category-detail-row:first-child{border-top:0}
      .category-detail-row::after{content:'›';position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:19px;color:#5f82a5}
      .category-detail-row:focus-visible{box-shadow:0 0 0 2px var(--blue) inset;border-radius:10px}
      .category-detail-merchant{font-size:14px;font-weight:780;line-height:1.35;overflow-wrap:anywhere}
      .category-detail-meta{font-size:11px;color:var(--muted);line-height:1.55;margin-top:4px;overflow-wrap:anywhere}
      .category-detail-fixed{color:#8abfff;font-weight:780}
      .category-detail-amount{text-align:right;font-size:14px;font-weight:800;white-space:nowrap;color:#8abfff}
      .category-detail-amount.refund{color:var(--green)}
      .category-detail-empty{padding:28px 4px;color:var(--muted);font-size:13px;line-height:1.7;text-align:center}
      body.category-detail-open{overflow:hidden}

      .fixed-edit-backdrop[hidden]{display:none!important}
      .fixed-edit-backdrop{position:fixed;inset:0;z-index:10060;background:rgba(1,6,12,.82);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:flex;align-items:flex-end;justify-content:center;padding-top:40px}
      .fixed-edit-sheet{width:min(620px,100%);background:linear-gradient(180deg,#0d1e31,#081421);border:1px solid #2b5c85;border-bottom:0;border-radius:28px 28px 0 0;padding:10px 18px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -16px 50px rgba(0,0,0,.5)}
      .fixed-edit-handle{width:42px;height:5px;border-radius:999px;background:#40536a;margin:2px auto 15px}
      .fixed-edit-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding-bottom:13px;border-bottom:1px solid var(--line2)}
      .fixed-edit-title{font-size:20px;font-weight:850;line-height:1.3}.fixed-edit-sub{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.5}.fixed-edit-amount{font-size:18px;font-weight:850;margin-top:5px;color:#8abfff}
      .fixed-edit-close{width:38px;height:38px;border:1px solid #294c6d;background:#102137;color:#dbe8f5;border-radius:13px;font-size:21px;flex:0 0 auto}
      .fixed-edit-choice{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px;padding:15px;border:1px solid #294c6d;border-radius:16px;background:#091829}
      .fixed-edit-choice label{display:flex;align-items:center;gap:11px;font-size:15px;font-weight:820;cursor:pointer}
      .fixed-edit-choice input{appearance:none;-webkit-appearance:none;width:26px;height:26px;border:2px solid #64819e;border-radius:5px;background:#06111e;display:grid;place-content:center;flex:0 0 auto}
      .fixed-edit-choice input::before{content:'✓';font-size:18px;line-height:1;color:#fff;transform:scale(0);transition:transform .1s}
      .fixed-edit-choice input:checked{background:#347fbd;border-color:#65b1ee}
      .fixed-edit-choice input:checked::before{transform:scale(1)}
      .fixed-edit-choice-note{font-size:10px;color:var(--muted);text-align:right;line-height:1.45}
      .fixed-edit-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}.fixed-edit-actions button{border:1px solid #315d83;background:#10253b;color:#eaf4ff;border-radius:13px;padding:12px;font-size:13px;font-weight:800}.fixed-edit-actions .primary{background:#16446d;border-color:#3979aa}.fixed-edit-status{min-height:18px;font-size:11px;color:var(--green);margin-top:7px;text-align:right}
      body.fixed-edit-open{overflow:hidden}
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
    backdrop.addEventListener('click',event=>{
      if(event.target===backdrop){closeSheet();return;}
      const sortButton=event.target.closest('[data-category-sort]');
      if(sortButton){
        detailSort=sortButton.dataset.categorySort==='latest'?'latest':'amount';
        if(activeDetail)renderDetails(activeDetail.category,activeDetail.year,activeDetail.month,activeDetail.totalText,activeDetail.rows);
        return;
      }
      const txRow=event.target.closest('.category-detail-row[data-tx-id]');
      if(txRow){
        const tx=detailRowsById.get(String(txRow.dataset.txId));
        if(tx)openFixedEditor(tx);
      }
    });
    backdrop.addEventListener('keydown',event=>{
      if(!['Enter',' '].includes(event.key))return;
      const txRow=event.target.closest('.category-detail-row[data-tx-id]');
      if(!txRow)return;
      event.preventDefault();
      const tx=detailRowsById.get(String(txRow.dataset.txId));
      if(tx)openFixedEditor(tx);
    });
    backdrop.querySelector('#categoryDetailClose').addEventListener('click',closeSheet);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!backdrop.hidden)closeSheet();});
    return backdrop;
  }

  function closeSheet(){
    const backdrop=document.getElementById('categoryDetailBackdrop');
    if(!backdrop)return;
    backdrop.hidden=true;
    activeDetail=null;
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
    activeDetail={category,year,month,totalText,rows:[...(rows||[])]};
    detailRowsById.clear();
    (rows||[]).forEach(row=>detailRowsById.set(String(row.id),row));
    const ordered=sortedRows(rows);
    backdrop.querySelector('#categoryDetailSub').textContent=`${year}년 ${month}월 · ${ordered.length.toLocaleString('ko-KR')}건`;
    const list=ordered.length?ordered.map(row=>{
      const impact=categoryImpact(row);
      const isRefund=impact<0;
      const date=new Date(row.occurred_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      const merchant=row.merchant||row.category||row.account||row.source||'거래';
      const payment=row.account||row.source||'결제수단 미분류';
      const original=String(row.category||'미분류').trim()||'미분류';
      const categoryNote=category===RENT_CATEGORY&&original!==RENT_CATEGORY?` · ${original}`:'';
      const fixedNote=row.is_fixed_expense?' · <span class="category-detail-fixed">고정지출</span>':'';
      return `<div class="category-detail-row" data-tx-id="${escapeHtml(row.id)}" tabindex="0" role="button" aria-label="${escapeHtml(merchant)} 고정지출 설정"><div><div class="category-detail-merchant">${escapeHtml(merchant)}</div><div class="category-detail-meta">${escapeHtml(date)} · ${escapeHtml(payment)}${escapeHtml(categoryNote)}${fixedNote}</div></div><div class="category-detail-amount ${isRefund?'refund':''}">${isRefund?'+':'−'}${money(row.amount)}${isRefund?' 환불':''}</div></div>`;
    }).join(''):`<div class="category-detail-empty">이 카테고리에 연결된 거래내역이 없습니다.</div>`;
    body.innerHTML=`<div class="category-detail-summary"><span>결산 금액</span><strong class="num">${escapeHtml(totalText||'—')}</strong></div><div class="category-detail-sort" aria-label="거래 정렬"><button type="button" data-category-sort="amount" aria-pressed="${detailSort==='amount'}">금액 큰순</button><button type="button" data-category-sort="latest" aria-pressed="${detailSort==='latest'}">최신순</button></div><div class="category-detail-list">${list}</div>`;
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

  function ensureFixedEditor(){
    let root=document.getElementById('fixedExpenseEditor');
    if(root)return root;
    root=document.createElement('div');
    root.id='fixedExpenseEditor';
    root.className='fixed-edit-backdrop';
    root.hidden=true;
    root.innerHTML=`<section class="fixed-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="fixedEditTitle"><div class="fixed-edit-handle"></div><div class="fixed-edit-head"><div><div class="fixed-edit-title" id="fixedEditTitle">거래 설정</div><div class="fixed-edit-sub" id="fixedEditSub"></div><div class="fixed-edit-amount" id="fixedEditAmount"></div></div><button class="fixed-edit-close" type="button" aria-label="닫기">×</button></div><div class="fixed-edit-choice"><label for="fixedExpenseCheck"><input type="checkbox" id="fixedExpenseCheck"><span>고정지출</span></label><div class="fixed-edit-choice-note">체크하면 월별 결산의<br>고정지출에 포함됩니다.</div></div><div class="fixed-edit-actions"><button type="button" data-fixed-action="cancel">취소</button><button class="primary" type="button" data-fixed-action="save">저장</button></div><div class="fixed-edit-status" id="fixedEditStatus" aria-live="polite"></div></section>`;
    document.body.append(root);
    root.addEventListener('click',event=>{
      if(event.target===root||event.target.closest('[data-fixed-action="cancel"]')||event.target.closest('.fixed-edit-close'))closeFixedEditor();
      if(event.target.closest('[data-fixed-action="save"]'))saveFixedEditor();
    });
    return root;
  }

  function openFixedEditor(tx){
    const root=ensureFixedEditor();
    root.dataset.id=String(tx.id);
    root.querySelector('#fixedEditTitle').textContent=tx.merchant||tx.category||'거래';
    root.querySelector('#fixedEditSub').textContent=`${new Date(tx.occurred_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${tx.account||tx.source||''}`;
    root.querySelector('#fixedEditAmount').textContent=`${Number(tx.amount)>=0?'+':'−'}${money(tx.amount)}`;
    root.querySelector('#fixedExpenseCheck').checked=tx.is_fixed_expense===true;
    root.querySelector('#fixedEditStatus').textContent='';
    root.hidden=false;
    document.body.classList.add('fixed-edit-open');
    root.querySelector('#fixedExpenseCheck').focus({preventScroll:true});
  }

  function closeFixedEditor(){
    const root=document.getElementById('fixedExpenseEditor');
    if(root)root.hidden=true;
    document.body.classList.remove('fixed-edit-open');
  }

  async function saveFixedEditor(){
    const root=document.getElementById('fixedExpenseEditor');
    const id=root?.dataset.id;
    if(!id||!detailClient)return;
    const checked=root.querySelector('#fixedExpenseCheck')?.checked===true;
    const status=root.querySelector('#fixedEditStatus');
    const button=root.querySelector('[data-fixed-action="save"]');
    button.disabled=true;
    status.textContent='저장 중…';
    const {data,error}=await detailClient.from('transactions').update({is_fixed_expense:checked}).eq('id',id).select('id,is_fixed_expense').single();
    if(error){status.textContent='저장 실패 · '+(error.message||'권한을 확인해 주세요.');button.disabled=false;return;}
    const tx=detailRowsById.get(String(id));
    if(tx)tx.is_fixed_expense=data.is_fixed_expense===true;
    status.textContent='저장됨';
    txCache.clear();
    button.disabled=false;
    setTimeout(async()=>{
      closeFixedEditor();
      if(activeDetail){
        try{
          const rows=categoryRows(await loadTransactions(activeDetail.year,activeDetail.month),activeDetail.category);
          renderDetails(activeDetail.category,activeDetail.year,activeDetail.month,activeDetail.totalText,rows);
        }catch(error){console.warn('detail refresh failed',error);}
      }
      document.getElementById('refresh')?.click();
    },160);
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

  function enhanceFixedSplitCard(){
    document.querySelectorAll('#report h2.section-title').forEach(title=>{
      if(title.textContent.trim()!=='고정지출 / 비고정지출')return;
      const card=title.nextElementSibling;
      if(!card?.classList.contains('card'))return;
      const values=[...card.querySelectorAll('.split .value')].map(node=>node.textContent.trim());
      if(values.some(value=>value==='미분류'))return;
      const unclassified=card.querySelector('.unclassified');
      if(unclassified)unclassified.style.display='none';
      const note=[...card.querySelectorAll('.small-note')].at(-1);
      if(note)note.textContent='개별 거래에서 고정지출을 체크한 항목만 고정지출로 집계합니다.';
    });
  }

  function setup(){
    injectStyles();
    ensureSheet();
    ensureFixedEditor();
    const report=document.getElementById('report');
    if(!report)return;
    const enhance=()=>{enhanceCategoryRows();enhanceFixedSplitCard();};
    const observer=new MutationObserver(enhance);
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
    enhance();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})(window);
