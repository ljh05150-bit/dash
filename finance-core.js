/* Shared by the dashboard and settlement page. No database writes. */
(function(global){
  function createCashFlow({client,supabaseUrl,supabaseKey,properties}){
    const sb=client, SUPABASE_KEY=supabaseKey;
    const ZARITALK_URL=supabaseUrl+'/functions/v1/zaritalk-sync';
    const CONFIG={properties};
    function ym(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
    function updateCurrentMonthSpend(yearMonth,expense){
      if(yearMonth!==ym(new Date()))return;
      const meta=document.querySelector('#transactionsSection .section-meta');
      if(meta){
        const amount=Math.round(Number(expense||0)).toLocaleString('ko-KR')+'원';
        meta.innerHTML='<span class="monthly-spend-label">이번달 사용</span><span class="monthly-spend-value">'+amount+'</span>';
        meta.style.setProperty('display','flex','important');
        meta.style.setProperty('flex-direction','column','important');
        meta.style.setProperty('align-items','flex-end','important');
        meta.style.setProperty('justify-content','center','important');
        meta.style.setProperty('gap','2px','important');
        meta.style.setProperty('line-height','1','important');
      }
    }
    if(sb&&typeof sb.channel==='function'){
      sb.channel('dashboard-transactions-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'transactions'},()=>{
          if(typeof global.load==='function')global.load();
        })
        .subscribe();
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
    function zaritalkPaidTotal(z){
      return normalizeRent(z).reduce((sum,r)=>sum+(r.live?r.paid:0),0);
    }
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
        const n=Number(t.amount||0);
        if(!Number.isFinite(n))return;
        const category=String(t.category||'').trim();
        if(category==='내부이체')return;
        if(n>0&&String(t.source||'')==='toss_statement_refund'){
          expense-=n;
          return;
        }
        n>=0?income+=n:expense+=Math.abs(n);
      });
      expense=Math.max(0,expense);
      updateCurrentMonthSpend(yearMonth,expense);
      setTimeout(()=>updateCurrentMonthSpend(yearMonth,expense),0);
      const bankRent=bankRentTotal(tx,yearMonth);
      const zaritalkRent=zaritalkPaidTotal(z);
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

  function installRecentTransactionLimit(){
    if(document.getElementById('recent-transaction-limit-style'))return;
    const style=document.createElement('style');
    style.id='recent-transaction-limit-style';
    style.textContent='#txrows .tx-row:nth-child(n+6){display:none!important} #recentTransactionEditor[hidden]{display:none!important} #transactionsSection .section-meta{display:flex!important;flex-direction:column!important;align-items:flex-end!important;justify-content:center!important;gap:2px!important;text-align:right!important;white-space:nowrap!important} #transactionsSection .monthly-spend-label{display:block!important;font-size:10px!important;font-weight:650!important;letter-spacing:-.01em!important;color:var(--muted)!important;line-height:1.1!important} #transactionsSection .monthly-spend-value{display:block!important;font-size:18px!important;font-weight:830!important;letter-spacing:-.035em!important;color:var(--text)!important;line-height:1.05!important} #txrows .tx-row{color:inherit!important;text-decoration:none!important;-webkit-tap-highlight-color:rgba(75,157,255,.08)} #txrows .tx-row:active{background:rgba(255,255,255,.025)}';
    document.head.appendChild(style);
  }

  function removeAuctionShortcut(){
    document.getElementById('auction-monitor-shortcut')?.remove();
    document.getElementById('auction-monitor-shortcut-style')?.remove();
  }

  function transactionIdFromRow(row,list){
    try{
      const direct=row?.dataset?.txId;
      if(direct)return String(direct);
      const href=row?.getAttribute?.('href');
      if(href){
        const id=new URL(href,location.href).searchParams.get('tx');
        if(id)return decodeURIComponent(id);
      }
    }catch(e){}
    const rows=Array.isArray(global.__visibleRecentTransactions)?global.__visibleRecentTransactions:[];
    const rendered=Array.from(list?.querySelectorAll?.('.tx-row')||[]);
    const idx=rendered.indexOf(row);
    const tx=idx>=0?rows[idx]:null;
    return tx?.id==null?'':String(tx.id);
  }

  function installRecentTransactionInteraction(){
    const list=document.getElementById('txrows');
    if(!list||list.dataset.recentTxBound==='1')return;
    list.dataset.recentTxBound='1';

    const activate=(event,row)=>{
      if(!row||!list.contains(row))return;
      const id=transactionIdFromRow(row,list);
      if(!id||typeof global.openRecentTransaction!=='function')return;
      event.preventDefault();
      event.stopPropagation();
      global.openRecentTransaction(id);
      if(!history.state?.recentTransactionModal){
        const state=Object.assign({},history.state||{}, {recentTransactionModal:true,recentTransactionId:id});
        history.pushState(state,'',location.href);
      }
    };

    list.addEventListener('click',event=>{
      const row=event.target.closest?.('.tx-row');
      activate(event,row);
    },true);
    list.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const row=event.target.closest?.('.tx-row');
      activate(event,row);
    },true);
  }

  function installRecentTransactionHistory(){
    if(global.__recentTransactionHistoryPatched)return;
    const originalClose=global.closeRecentTransaction;
    if(typeof originalClose!=='function'){
      setTimeout(installRecentTransactionHistory,0);
      return;
    }
    global.__recentTransactionHistoryPatched=true;
    global.closeRecentTransaction=function(){
      if(history.state?.recentTransactionModal){
        history.back();
        return;
      }
      return originalClose.apply(this,arguments);
    };
    global.addEventListener('popstate',()=>{
      if(!history.state?.recentTransactionModal&&document.getElementById('recentTransactionModal')){
        originalClose();
      }
    });
  }

  function installBfcacheRefresh(){
    if(global.__dashboardPageshowBound)return;
    global.__dashboardPageshowBound=true;
    global.addEventListener('pageshow',event=>{
      if(event.persisted&&typeof global.load==='function'){
        setTimeout(()=>global.load(),0);
      }
    });
  }

  function installDashboardEnhancements(){
    installRecentTransactionLimit();
    removeAuctionShortcut();
    installRecentTransactionInteraction();
    installRecentTransactionHistory();
    installBfcacheRefresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installDashboardEnhancements,{once:true});
  else installDashboardEnhancements();

  global.FinanceCore={createCashFlow};
})(window);
