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
    style.textContent='#txrows .tx-row:nth-child(n+6){display:none!important} #recentTransactionEditor[hidden]{display:none!important} #transactionsSection .section-meta{display:flex!important;flex-direction:column!important;align-items:flex-end!important;justify-content:center!important;gap:2px!important;text-align:right!important;white-space:nowrap!important} #transactionsSection .monthly-spend-label{display:block!important;font-size:10px!important;font-weight:650!important;letter-spacing:-.01em!important;color:var(--muted)!important;line-height:1.1!important} #transactionsSection .monthly-spend-value{display:block!important;font-size:18px!important;font-weight:830!important;letter-spacing:-.035em!important;color:var(--text)!important;line-height:1.05!important}';
    document.head.appendChild(style);
  }

  function installAuctionShortcut(){
    const rentGrid=document.getElementById('rentGrid');
    if(!rentGrid||document.getElementById('auction-monitor-shortcut'))return;
    if(!document.getElementById('auction-monitor-shortcut-style')){
      const style=document.createElement('style');
      style.id='auction-monitor-shortcut-style';
      style.textContent='.auction-monitor-shortcut{display:block;color:inherit;text-decoration:none;margin-top:12px}.auction-monitor-card{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 15px;border-radius:18px;border:1px solid #2b5b86;background:linear-gradient(145deg,rgba(15,31,50,.97),rgba(10,23,38,.97));box-shadow:0 12px 35px rgba(0,0,0,.18)}.auction-monitor-card:active{transform:scale(.99)}.auction-monitor-icon{width:38px;height:38px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:#123359;border:1px solid #326493;color:#75baff;font-size:19px}.auction-monitor-main{display:flex;align-items:center;gap:11px;min-width:0}.auction-monitor-title{font-size:14px;font-weight:820}.auction-monitor-sub{font-size:9px;color:#7890aa;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.auction-monitor-go{font-size:20px;color:#6f8eae}';
      document.head.appendChild(style);
    }
    const link=document.createElement('a');
    link.id='auction-monitor-shortcut';
    link.className='auction-monitor-shortcut';
    link.href='./auction.html';
    link.setAttribute('aria-label','경매 탐색 열기');
    link.innerHTML='<div class="auction-monitor-card"><div class="auction-monitor-main"><div class="auction-monitor-icon">⌂</div><div><div class="auction-monitor-title">경매 탐색</div><div class="auction-monitor-sub">15억+ · 서울/경기남부/대전/천안 · 신규·유찰 자동추적</div></div></div><div class="auction-monitor-go">›</div></div>';
    rentGrid.insertAdjacentElement('afterend',link);
  }

  function installDashboardEnhancements(){installRecentTransactionLimit();installAuctionShortcut();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installDashboardEnhancements,{once:true});
  else installDashboardEnhancements();

  global.FinanceCore={createCashFlow};
})(window);
