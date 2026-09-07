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
    style.textContent='#txrows .tx-row:nth-child(n+6){display:none!important} #transactionsSection .section-meta{display:flex!important;flex-direction:column!important;align-items:flex-end!important;justify-content:center!important;gap:2px!important;text-align:right!important;white-space:nowrap!important} #transactionsSection .monthly-spend-label{display:block!important;font-size:10px!important;font-weight:650!important;letter-spacing:-.01em!important;color:var(--muted)!important;line-height:1.1!important} #transactionsSection .monthly-spend-value{display:block!important;font-size:18px!important;font-weight:830!important;letter-spacing:-.035em!important;color:var(--text)!important;line-height:1.05!important}';
    document.head.appendChild(style);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installRecentTransactionLimit,{once:true});
  else installRecentTransactionLimit();

  global.FinanceCore={createCashFlow};
})(window);

/* Hanwha Solutions employee-stock patch.
   Display only the user's net equity: (live price - 22,000) × 1,700.
   It is locked until 2027-06, so it is excluded from available funds. */
(function(global){
  const TICKER='009830', SYMBOL='009830.KS', QTY=1700, LOAN_PRICE=22000;
  const money=n=>'₩'+Math.round(Number(n||0)).toLocaleString('ko-KR');
  const isEmployeeAsset=row=>String(row?.name||'').includes('한화솔루션 우리사주')||String(row?.asset_type||'')==='restricted_stock_equity';
  function patch(){
    if(typeof global.loadStockHistory==='function'){
      const originalLoadStockHistory=global.loadStockHistory;
      global.loadStockHistory=async function(){
        await originalLoadStockHistory();
        try{
          const r=await fetch(STOCK_HISTORY_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify({symbols:[SYMBOL]})});
          if(!r.ok)throw new Error('employee stock history '+r.status);
          const payload=await r.json(),item=payload?.data?.[SYMBOL];
          if(item?.closes?.length)liveHistory[TICKER]=item;
        }catch(e){console.warn(e)}
      };
    }

    if(typeof global.assetValue==='function'){
      const originalAssetValue=global.assetValue;
      global.assetValue=function(row){return isEmployeeAsset(row)?0:originalAssetValue(row)};
    }

    if(typeof global.renderAvailableAssets==='function'){
      const originalAvailable=global.renderAvailableAssets;
      global.renderAvailableAssets=function(rows,stockValue){
        const locked=Number(global.__employeeStockEquity||0);
        return originalAvailable(rows,Number(stockValue||0)-locked);
      };
    }

    if(typeof global.renderStocks==='function'){
      global.renderStocks=function(rows){
        currentStockRows=rows;global.currentStockRows=rows;
        const usdkrw=Number(liveHistory.__USDKRW?.lastPrice||0);
        let employeeEquity=0;
        const enriched=(rows||[]).map(x=>{
          const ticker=String(x.ticker||''),live=liveHistory[ticker],lp=Number(live?.lastPrice||0),qty=Number(x.quantity||0);
          const krw=/^\d{6}$/.test(ticker);
          let mv=Number(x.market_value||0),pp=x.pnl_pct==null?null:Number(x.pnl_pct),pnl=null;
          if(ticker===TICKER){
            const price=lp>0?lp:(LOAN_PRICE+Number(x.market_value||0)/QTY);
            mv=(price-LOAN_PRICE)*QTY;employeeEquity=mv;pp=((price/LOAN_PRICE)-1)*100;pnl=mv;
          }else{
            if(qty>0&&lp>0){if(krw)mv=qty*lp;else if(usdkrw>0)mv=qty*lp*usdkrw}
            if(typeof calcPnl==='function')pnl=calcPnl(mv,pp);
            if(x.avg_price!=null&&Number(x.avg_price)>0&&qty>0&&lp>0){const avg=Number(x.avg_price);pp=((lp/avg)-1)*100;const cost=krw?qty*avg:(usdkrw>0?qty*avg*usdkrw:null);if(cost!=null)pnl=mv-cost}
          }
          return {...x,_livePrice:lp,_liveMarketValue:mv,_livePnlPct:pp,_livePnl:pnl,_employee:ticker===TICKER};
        }).sort((a,b)=>Number(b._liveMarketValue||0)-Number(a._liveMarketValue||0));
        global.__employeeStockEquity=employeeEquity;
        const total=enriched.reduce((z,x)=>z+Number(x._liveMarketValue||0),0);
        let pnl=0;enriched.forEach(x=>{if(!x._employee&&x._livePnl!=null)pnl+=Number(x._livePnl||0)});
        const liquidTotal=total-employeeEquity;
        const pnlPct=liquidTotal-pnl!==0?pnl/(liquidTotal-pnl)*100:0;
        stockTotal.textContent=money(total);
        stockPnlSummary.textContent=(pnl>=0?'+':'-')+money(Math.abs(pnl))+' ('+(pnlPct>=0?'+':'')+pnlPct.toFixed(2)+'%)';
        stockPnlSummary.className='stock-pnl '+(pnl>=0?'pos':'neg');
        stockList.innerHTML=enriched.map(x=>{
          const ticker=String(x.ticker||''),employee=x._employee;
          const name=employee?'한화솔루션 우리사주':(x.name||(typeof displayName==='function'?displayName(ticker):ticker));
          const lp=Number(x._livePrice||0),krw=/^\d{6}$/.test(ticker);
          const shown=lp>0?(krw?'₩'+Math.round(lp).toLocaleString('ko-KR'):'$'+lp.toFixed(2)):(employee?'₩30,050':(x.price||(typeof displayPrice==='function'?displayPrice(ticker):'-')));
          const positive=Number(x._livePnlPct)>=0;
          if(employee){
            const equity=Number(x._liveMarketValue||0);
            return `<div class="stock-row"><div><div class="stock-name">${name}</div><div class="stock-price">${shown} <span class="good">${lp>0?'LIVE':'SNAP'}</span></div><div class="stock-ticker">009830 · 1,700주</div></div><div class="spark">${typeof sparkSVG==='function'?sparkSVG(ticker,positive):''}</div><div class="stock-right"><div class="stock-market">${money(equity)}</div><div class="stock-item-pnl ${equity>=0?'pos':'neg'}">순지분 ${equity>=0?'+':''}${money(equity)}<br>2027.06 출금</div></div><div class="chev">🔒</div></div>`;
          }
          const itemPnl=x._livePnl,itemPct=x._livePnlPct;
          const pnlText=itemPnl==null?'-':(itemPnl>=0?'+₩':'-₩')+Math.abs(Math.round(itemPnl)).toLocaleString('ko-KR');
          const pctText=itemPct==null?'':`(${Number(itemPct)>=0?'+':''}${Number(itemPct).toFixed(1)}%)`;
          return `<div class="stock-row" onclick="openStockEdit('${ticker}')"><div><div class="stock-name ${ticker==='TQQQ'?'compact':''}">${name}</div><div class="stock-price">${shown} <span class="good">${lp>0?'LIVE':'SNAP'}</span></div><div class="stock-ticker">${ticker}</div></div><div class="spark">${typeof sparkSVG==='function'?sparkSVG(ticker,positive):''}</div><div class="stock-right"><div class="stock-market">${money(x._liveMarketValue)}</div><div class="stock-item-pnl ${positive?'pos':'neg'}">${pnlText}<br>${pctText}</div></div><div class="chev">›</div></div>`;
        }).join('');
        const fx=Number(liveHistory.__USDKRW?.lastPrice||0);
        stockUpdated.textContent='1Y 일봉 · 현재가 자동'+(fx>0?' · USD/KRW '+fx.toFixed(1):'')+' · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
        return total;
      };
    }

    const dash=document.getElementById('dash');
    if(typeof global.load==='function'&&dash&&getComputedStyle(dash).display!=='none')global.load();
  }
  global.addEventListener('load',()=>setTimeout(patch,0),{once:true});
})(window);
