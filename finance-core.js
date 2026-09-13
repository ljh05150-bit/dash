/* Shared by the dashboard and settlement page. */
(function(global){
  'use strict';

  let sharedClient=null;

  function createCashFlow({client,supabaseUrl,supabaseKey,properties}){
    const sb=client, SUPABASE_KEY=supabaseKey;
    if(client)sharedClient=client;
    const ZARITALK_URL=supabaseUrl+'/functions/v1/zaritalk-sync';
    const CONFIG={properties};
    function ym(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
    function updateCurrentMonthSpend(yearMonth,expense){
      if(yearMonth!==ym(new Date()))return;
      const meta=document.querySelector('#transactionsSection .section-meta');
      if(!meta)return;
      const amount=Math.round(Number(expense||0)).toLocaleString('ko-KR')+'원';
      meta.innerHTML='<span class="monthly-spend-label">이번달 사용</span><span class="monthly-spend-value">'+amount+'</span>';
      meta.style.setProperty('display','flex','important');
      meta.style.setProperty('flex-direction','column','important');
      meta.style.setProperty('align-items','flex-end','important');
      meta.style.setProperty('justify-content','center','important');
      meta.style.setProperty('gap','2px','important');
      meta.style.setProperty('line-height','1','important');
    }
    if(sb&&typeof sb.channel==='function'){
      sb.channel('dashboard-transactions-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'transactions'},()=>{
          if(typeof global.load==='function')global.load();
        }).subscribe();
    }
    async function loadZaritalk(yearMonth=ym(new Date())){
      try{
        const {data,error}=await sb.auth.getSession();
        if(error)throw error;
        const r=await fetch(`${ZARITALK_URL}?yearMonth=${encodeURIComponent(yearMonth)}`,{
          cache:'no-store',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${data.session?.access_token||SUPABASE_KEY}`}
        });
        if(!r.ok)throw new Error('zaritalk '+r.status);
        const payload=await r.json();
        if(!payload||payload.ok===false||payload.success===false||payload.error||Number(payload.status)>=400)throw new Error('zaritalk API error');
        const props=payload.properties??payload.data?.properties;
        const responseMonth=payload.yearMonth??payload.data?.yearMonth;
        if(!Array.isArray(props)||(responseMonth!=null&&responseMonth!==yearMonth))throw new Error('zaritalk invalid response');
        return {ok:true,properties:props,yearMonth};
      }catch(e){console.warn(e);return {ok:false,properties:[],yearMonth}}
    }
    function zaritalkPaidTotal(z){return normalizeRent(z).reduce((sum,r)=>sum+(r.live?r.paid:0),0)}
    function bankRentTotal(tx,yearMonth){
      return tx.reduce((sum,t)=>{
        if(ym(new Date(t.occurred_at))!==yearMonth)return sum;
        const n=Number(t.amount||0),category=String(t.category||'').trim();
        return Number.isFinite(n)&&n>0&&category==='월세수입'?sum+n:sum;
      },0);
    }
    function monthlyCashFlow(tx,yearMonth,z){
      let income=0,expense=0;
      tx.forEach(t=>{
        if(ym(new Date(t.occurred_at))!==yearMonth)return;
        const n=Number(t.amount||0);if(!Number.isFinite(n))return;
        const category=String(t.category||'').trim();
        if(category==='내부이체')return;
        if(n>0&&String(t.source||'')==='toss_statement_refund'){expense-=n;return}
        n>=0?income+=n:expense+=Math.abs(n);
      });
      expense=Math.max(0,expense);
      updateCurrentMonthSpend(yearMonth,expense);
      setTimeout(()=>updateCurrentMonthSpend(yearMonth,expense),0);
      const bankRent=bankRentTotal(tx,yearMonth),zaritalkRent=zaritalkPaidTotal(z);
      income+=Math.max(0,zaritalkRent-bankRent);
      return {income,expense,net:income-expense,bankRent,zaritalkRent,rentIncome:Math.max(bankRent,zaritalkRent)};
    }
    function normalizeRent(z){
      const props=z?.ok===true&&Array.isArray(z.properties)?z.properties.filter(p=>p&&typeof p==='object'):[];
      const amount=value=>(typeof value==='number'||(typeof value==='string'&&value.trim()!==''))&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
      return [CONFIG.properties.seohui,CONFIG.properties.raum].map(cfg=>{
        const row=props.find(p=>String(p.propertyPk)===String(cfg.propertyPk));
        const paid=amount(row?.paidAmount);
        const status=z?.ok!==true?'자리톡 오류':!row?'자리톡 미검출':paid===null?'자리톡 오류':'자리톡 LIVE';
        return {name:cfg.name,value:cfg.value,loan:cfg.loan,charge:amount(row?.monthlyCharge??row?.monthlyRent)??cfg.fallbackCharge,paid:status==='자리톡 LIVE'?paid:null,deposit:amount(row?.totalDeposit)??cfg.fallbackDeposit,roomCount:amount(row?.roomCount)||0,live:status==='자리톡 LIVE',status};
      });
    }
    return {loadZaritalk,normalizeRent,zaritalkPaidTotal,bankRentTotal,monthlyCashFlow};
  }

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const recentSpendRows=tx=>(Array.isArray(tx)?tx:[]).filter(t=>Number(t?.amount)<0&&String(t?.category||'').trim()!=='내부이체').slice(0,5);

  function installStyle(){
    if(document.getElementById('recent-transaction-limit-style'))return;
    const s=document.createElement('style');
    s.id='recent-transaction-limit-style';
    s.textContent='#txrows .tx-row:nth-child(n+6){display:none!important} #transactionsSection .section-meta{display:flex!important;flex-direction:column!important;align-items:flex-end!important;justify-content:center!important;gap:2px!important;text-align:right!important;white-space:nowrap!important} #transactionsSection .monthly-spend-label{display:block!important;font-size:10px!important;font-weight:650!important;color:var(--muted)!important;line-height:1.1!important} #transactionsSection .monthly-spend-value{display:block!important;font-size:18px!important;font-weight:830!important;color:var(--text)!important;line-height:1.05!important} #txrows .tx-row{color:inherit!important;text-decoration:none!important;-webkit-tap-highlight-color:rgba(75,157,255,.08)} #txrows .tx-row:active{background:rgba(255,255,255,.035)} #recentTransactionModal .recent-fixed-choice{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:13px 14px;border:1px solid var(--line);border-radius:14px;background:#081525} #recentTransactionModal .recent-fixed-choice label{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:820;cursor:pointer} #recentTransactionModal .recent-fixed-check{appearance:none;-webkit-appearance:none;width:25px;height:25px;border:2px solid #64819e;border-radius:5px;background:#06111e;display:grid;place-content:center;flex:0 0 auto} #recentTransactionModal .recent-fixed-check:before{content:"✓";font-size:17px;line-height:1;color:#fff;transform:scale(0);transition:transform .1s} #recentTransactionModal .recent-fixed-check:checked{background:#347fbd;border-color:#65b1ee} #recentTransactionModal .recent-fixed-check:checked:before{transform:scale(1)} #recentTransactionModal .recent-fixed-note{font-size:9px;color:var(--muted);text-align:right;line-height:1.4}';
    document.head.appendChild(s);
  }

  function removeAuctionShortcut(){
    document.getElementById('auction-monitor-shortcut')?.remove();
    document.getElementById('auction-monitor-shortcut-style')?.remove();
  }

  function txById(id){
    const rows=Array.isArray(global.__visibleRecentTransactions)?global.__visibleRecentTransactions:[];
    return rows.find(x=>String(x?.id)===String(id));
  }

  function closeModalDirect(){
    document.getElementById('recentTransactionModal')?.remove();
    document.body.style.overflow='';
  }

  function closeRecentModal(){
    if(history.state?.recentTransactionModal){history.back();return}
    closeModalDirect();
  }

  async function saveRecentEnhanced(id){
    if(!sharedClient)return;
    const category=document.getElementById('recentCategory')?.value||'미분류';
    const memo=document.getElementById('recentMemo')?.value.trim()||'';
    const is_fixed_expense=document.getElementById('recentFixedExpense')?.checked===true;
    const status=document.getElementById('recentStatus');
    const saveButton=document.querySelector('#recentTransactionModal [data-recent-save]');
    if(saveButton)saveButton.disabled=true;
    if(status)status.textContent='저장 중…';
    const {data,error}=await sharedClient.from('transactions').update({category,memo:memo||null,is_fixed_expense}).eq('id',id).select('id,category,memo,is_fixed_expense').single();
    if(error){if(status)status.textContent='저장 실패 · '+(error.message||'다시 시도해 주세요.');if(saveButton)saveButton.disabled=false;return;}
    const tx=txById(id);
    if(tx&&data){tx.category=data.category;tx.memo=data.memo;tx.is_fixed_expense=data.is_fixed_expense===true;}
    if(status)status.textContent='저장됨';
    global.dispatchEvent(new CustomEvent('transaction-updated',{detail:{id:String(id),category,is_fixed_expense}}));
    setTimeout(async()=>{closeRecentModal();if(typeof global.load==='function')await global.load();},160);
  }

  function forceOpenModal(tx){
    if(!tx)return;
    closeModalDirect();
    const root=document.createElement('div');
    root.id='recentTransactionModal';
    root.className='modal-backdrop show';
    root.style.zIndex='10050';
    const amount=Number(tx.amount||0);
    const options=typeof global.recentOptions==='function'
      ? global.recentOptions(tx.category||'미분류')
      : `<option value="${esc(tx.category||'미분류')}" selected>${esc(tx.category||'미분류')}</option>`;
    root.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div><h3 style="margin:0">${esc(tx.merchant||tx.category||'거래')}</h3>
        <div class="subtitle">${esc(new Date(tx.occurred_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}))} · ${esc(tx.account||tx.source||'')}</div>
        <div style="font-size:18px;font-weight:850;margin-top:7px">${amount>=0?'+':'−'}₩${Math.round(Math.abs(amount)).toLocaleString('ko-KR')}</div></div>
        <button class="btn small" type="button" data-recent-close>닫기</button>
      </div>
      <label>카테고리</label><select id="recentCategory" style="width:100%;background:#081525;border:1px solid var(--line);border-radius:12px;padding:11px;color:white;margin-top:5px">${options}</select>
      <label>메모</label><input id="recentMemo" maxlength="120" value="${esc(tx.memo||'')}" placeholder="무엇에 쓴 돈인지 적어두세요">
      <div class="recent-fixed-choice"><label for="recentFixedExpense"><input class="recent-fixed-check" type="checkbox" id="recentFixedExpense" ${tx.is_fixed_expense===true?'checked':''}><span>고정지출</span></label><div class="recent-fixed-note">체크하면 월별 결산의<br>고정지출에 포함됩니다.</div></div>
      <div id="recentStatus" class="subtitle" style="min-height:18px;text-align:right"></div>
      <div class="modal-actions"><button class="btn" type="button" data-recent-close>취소</button><button class="btn" type="button" data-recent-save>저장</button></div>
    </div>`;
    root.addEventListener('click',e=>{
      if(e.target===root||e.target.closest('[data-recent-close]')){e.preventDefault();closeRecentModal();return}
      if(e.target.closest('[data-recent-save]')){
        e.preventDefault();
        saveRecentEnhanced(String(tx.id));
      }
    });
    document.body.appendChild(root);
    document.body.style.overflow='hidden';
    if(!history.state?.recentTransactionModal){
      history.pushState(Object.assign({},history.state||{},{recentTransactionModal:true,recentTransactionId:String(tx.id)}),'',location.href);
    }
  }

  function openRecentById(id,event){
    if(event?.__recentTxHandled)return;
    if(event)event.__recentTxHandled=true;
    const tx=txById(id);if(!tx)return;
    event?.preventDefault?.();event?.stopPropagation?.();
    forceOpenModal(tx);
  }

  function installStableRecentRenderer(){
    const host=document.getElementById('txrows');
    if(!host)return;
    if(global.__stableRecentRendererInstalled)return;
    if(typeof global.renderTransactions!=='function'){setTimeout(installStableRecentRenderer,30);return}
    global.__stableRecentRendererInstalled=true;
    global.renderTransactions=function(tx){
      const list=document.getElementById('txrows');if(!list)return;
      const visible=recentSpendRows(tx);global.__visibleRecentTransactions=visible;
      list.innerHTML=visible.map(t=>{
        const id=t.id==null?'':String(t.id),a=Math.abs(Number(t.amount||0));
        const when=new Date(t.occurred_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
        const fixed=t.is_fixed_expense===true?' · 고정지출':'';
        return `<div class="tx-row" role="button" tabindex="0" data-tx-id="${esc(id)}"><div class="tx-time">${esc(when)}</div><div class="tx-main"><div class="tx-merchant">${esc(t.merchant||t.category||'거래')}</div><div class="tx-account">${esc(t.account||t.source||'')} · ${esc(t.category||'미분류')}${fixed}</div></div><div class="tx-amt neg">-₩${Math.round(a).toLocaleString('ko-KR')}</div></div>`;
      }).join('')||'<div class="subtitle">아직 거래내역이 없습니다.</div>';
      global.dispatchEvent(new CustomEvent('recent-transactions-rendered'));
    };
    setTimeout(()=>{if(typeof global.load==='function')global.load()},0);
  }

  function installInteraction(){
    const list=document.getElementById('txrows');if(!list||list.dataset.recentTxBound==='1')return;
    list.dataset.recentTxBound='1';
    list.addEventListener('click',event=>{
      const row=event.target.closest?.('.tx-row[data-tx-id]');if(!row||!list.contains(row))return;
      openRecentById(row.dataset.txId,event);
    },true);
    list.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const row=event.target.closest?.('.tx-row[data-tx-id]');if(!row||!list.contains(row))return;
      openRecentById(row.dataset.txId,event);
    },true);
  }

  function installHistory(){
    if(global.__recentHistoryBound)return;global.__recentHistoryBound=true;
    global.addEventListener('popstate',()=>{if(!history.state?.recentTransactionModal)closeModalDirect()});
  }

  function installBfcacheRefresh(){
    if(global.__dashboardPageshowBound)return;global.__dashboardPageshowBound=true;
    global.addEventListener('pageshow',event=>{closeModalDirect();if(event.persisted&&typeof global.load==='function')setTimeout(()=>global.load(),0)});
  }

  function keepServiceWorkerFresh(){
    if(!('serviceWorker' in navigator)||global.__freshSwScheduled)return;
    global.__freshSwScheduled=true;
    global.addEventListener('load',()=>{
      setTimeout(()=>navigator.serviceWorker.register('./service-worker.js?rev=20260913-2335',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}),500);
    },{once:true});
  }

  function install(){
    installStyle();removeAuctionShortcut();installStableRecentRenderer();installInteraction();installHistory();installBfcacheRefresh();keepServiceWorkerFresh();
    global.__forceOpenRecentTransaction=id=>forceOpenModal(txById(id));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();

  global.FinanceCore={createCashFlow};
})(window);
