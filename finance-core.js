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
      if(meta)meta.textContent='이번달 '+Math.round(Number(expense||0)).toLocaleString('ko-KR')+'원 사용';
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
    style.textContent='#txrows .tx-row:nth-child(n+6){display:none!important}';
    document.head.appendChild(style);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installRecentTransactionLimit,{once:true});
  else installRecentTransactionLimit();

  global.FinanceCore={createCashFlow};
})(window);
