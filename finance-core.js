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
    function compactWon(n){n=Number(n||0);const a=Math.abs(n),s=n<0?'-':'';if(a>=100000000)return s+(a/100000000).toFixed(a%100000000?2:0)+'억';if(a>=10000)return s+Math.round(a/10000).toLocaleString('ko-KR')+'만';return s+a.toLocaleString('ko-KR')+'원'}
    function updateCurrentCashFlowCard(yearMonth,income,expense){
      if(yearMonth!==ym(new Date()))return;
      const label=document.getElementById('prevCfLabel');
      const value=document.getElementById('prevMonthCF');
      const sub=document.getElementById('prevMonthCFSub');
      if(!label||!value||!sub)return;
      const net=Number(income||0)-Number(expense||0);
      const month=new Date().getMonth()+1;
      label.textContent='이번달 순현금흐름';
      value.textContent=compactWon(net);
      value.className='summary-value num '+(net>=0?'good':'neg');
      sub.textContent=month+'월 · 수입 '+compactWon(income)+' · 지출 '+compactWon(expense);
    }
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
      updateCurrentCashFlowCard(yearMonth,income,expense);
      setTimeout(()=>updateCurrentCashFlowCard(yearMonth,income,expense),0);
      setTimeout(()=>updateCurrentCashFlowCard(yearMonth,income,expense),250);
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

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const recentSpendRows=tx=>(Array.isArray(tx)?tx:[]).filter(t=>Number(t?.amount)<0&&String(t?.category||'').trim()!=='내부이체').slice(0,5);

  const RECENT_TAXONOMY=[
    ['식비',[{label:'식비',value:'식비'},{label:'외식',value:'식비/외식'}]],
    ['생활용품',[{label:'생필품/소모품',value:'생활용품/생필품/소모품'},{label:'수리비',value:'생활용품/수리비'},{label:'주방/욕실',value:'생활용품/주방/욕실'}]],
    ['육아비',[{label:'육아비',value:'육아비'}]],
    ['건강',[{label:'병원/약국',value:'건강/병원/약국'},{label:'영양제',value:'건강/영양제'}]],
    ['투자관련',[{label:'다가구운영비',value:'투자관련/다가구운영비'},{label:'부동산구매',value:'투자관련/부동산구매'},{label:'기타비용',value:'투자관련/기타비용'},{label:'세금',value:'투자관련/세금'},{label:'보증금반환',value:'투자관련/보증금반환'}]],
    ['차량',[{label:'주유비',value:'차량/주유비'},{label:'수리비',value:'차량/수리비'},{label:'범칙금',value:'차량/범칙금'},{label:'기타',value:'차량/기타'}]],
    ['구독',[{label:'서비스',value:'구독/서비스'}]],
    ['경조사',[{label:'가족',value:'경조사/가족'},{label:'지인',value:'경조사/지인'}]],
    ['선물',[{label:'가족',value:'선물/가족'},{label:'지인',value:'선물/지인'}]],
    ['의복/미용',[{label:'의류',value:'의복/미용/의류'},{label:'뷰티',value:'의복/미용/뷰티'},{label:'헤어',value:'의복/미용/헤어'}]],
    ['취미',[{label:'여행',value:'취미/여행'},{label:'운동 등',value:'취미/운동 등'},{label:'공연/영화',value:'취미/공연/영화'},{label:'기타',value:'취미/기타'}]],
    ['자기계발',[{label:'강의',value:'자기계발/강의'},{label:'책',value:'자기계발/책'},{label:'응시료',value:'자기계발/응시료'},{label:'공연',value:'자기계발/공연'}]],
    ['용돈',[{label:'부모님',value:'용돈/부모님'},{label:'가족',value:'용돈/가족'}]],
    ['고정지출',[{label:'주거비',value:'고정지출/주거비'},{label:'보험료',value:'고정지출/보험료'},{label:'통신비',value:'고정지출/통신비'},{label:'교통비',value:'고정지출/교통비'},{label:'주거비기타',value:'고정지출/주거비기타'},{label:'대출원리금',value:'고정지출/대출원리금'}]],
    ['저축',[{label:'적금',value:'저축/적금'},{label:'예금',value:'저축/예금'},{label:'근로소득저축',value:'저축/근로소득저축'},{label:'대출상환',value:'저축/대출상환'},{label:'자본소득저축',value:'저축/자본소득저축'}]],
    ['수입',[{label:'현금',value:'수입/현금'},{label:'상여금',value:'수입/상여금'},{label:'부수입',value:'수입/부수입'},{label:'월세수입',value:'월세수입'},{label:'투자수익',value:'수입/투자수익'},{label:'보증금',value:'수입/보증금'},{label:'기타수입',value:'수입/기타수입'}]]
  ];
  const RECENT_VALUES=new Map();
  RECENT_TAXONOMY.forEach(([group,items])=>items.forEach(item=>RECENT_VALUES.set(item.value,{group,label:item.label})));

  function recentCategoryLabel(value){
    const raw=String(value||'미분류').trim()||'미분류';
    return RECENT_VALUES.get(raw)?.label||raw;
  }

  function installStyle(){
    if(document.getElementById('recent-transaction-limit-style'))return;
    const s=document.createElement('style');
    s.id='recent-transaction-limit-style';
    s.textContent=`
      #txrows .tx-row:nth-child(n+6){display:none!important}
      #transactionsSection .section-meta{display:flex!important;flex-direction:column!important;align-items:flex-end!important;justify-content:center!important;gap:2px!important;text-align:right!important;white-space:nowrap!important}
      #transactionsSection .monthly-spend-label{display:block!important;font-size:10px!important;font-weight:650!important;color:var(--muted)!important;line-height:1.1!important}
      #transactionsSection .monthly-spend-value{display:block!important;font-size:18px!important;font-weight:830!important;color:var(--text)!important;line-height:1.05!important}
      #txrows .tx-row{color:inherit!important;text-decoration:none!important;-webkit-tap-highlight-color:rgba(75,157,255,.08)}
      #txrows .tx-row:active{background:rgba(255,255,255,.035)}
      #recentTransactionModal .modal{max-height:88vh;overflow:auto;border-radius:24px 24px 0 0;padding:16px 18px calc(22px + env(safe-area-inset-bottom));}
      #recentTransactionModal .recent-category-button{width:100%;min-height:45px;margin-top:6px;border:1px solid #4b83b1;background:#081525;color:var(--text);border-radius:13px;padding:11px 40px 11px 12px;font-size:13px;font-weight:760;text-align:left;position:relative}
      #recentTransactionModal .recent-category-button:after{content:'›';position:absolute;right:14px;top:50%;transform:translateY(-50%) rotate(90deg);color:#8fb3d2;font-size:20px}
      #recentTransactionModal .recent-fixed-choice{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:13px 14px;border:1px solid var(--line);border-radius:14px;background:#081525}
      #recentTransactionModal .recent-fixed-choice label{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:820;cursor:pointer}
      #recentTransactionModal .recent-fixed-check{appearance:none;-webkit-appearance:none;width:25px;height:25px;border:2px solid #64819e;border-radius:5px;background:#06111e;display:grid;place-content:center;flex:0 0 auto}
      #recentTransactionModal .recent-fixed-check:before{content:'✓';font-size:17px;line-height:1;color:#fff;transform:scale(0);transition:transform .1s}
      #recentTransactionModal .recent-fixed-check:checked{background:#347fbd;border-color:#65b1ee}
      #recentTransactionModal .recent-fixed-check:checked:before{transform:scale(1)}
      #recentTransactionModal .recent-fixed-note{font-size:9px;color:var(--muted);text-align:right;line-height:1.4}
      #recentCategoryPicker[hidden]{display:none!important}
      #recentCategoryPicker{position:fixed;inset:0;z-index:10150;background:rgba(1,6,12,.75);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:flex;align-items:flex-end;justify-content:center;padding-top:48px}
      #recentCategoryPicker .recent-cat-sheet{width:min(620px,100%);max-height:82vh;overflow:auto;background:linear-gradient(180deg,#102238,#081421);border:1px solid #315d83;border-bottom:0;border-radius:28px 28px 0 0;padding:10px 16px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -16px 50px rgba(0,0,0,.52)}
      #recentCategoryPicker .recent-cat-handle{width:42px;height:5px;border-radius:999px;background:#40536a;margin:2px auto 15px}
      #recentCategoryPicker .recent-cat-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding-bottom:12px;border-bottom:1px solid var(--line2)}
      #recentCategoryPicker .recent-cat-title{font-size:20px;font-weight:850;line-height:1.3}
      #recentCategoryPicker .recent-cat-sub{font-size:11px;color:var(--muted);margin-top:4px}
      #recentCategoryPicker .recent-cat-close{width:38px;height:38px;border:1px solid #294c6d;background:#102137;color:#dbe8f5;border-radius:13px;font-size:21px}
      #recentCategoryPicker .recent-cat-group{padding:12px 0 3px;border-bottom:1px solid var(--line2)}
      #recentCategoryPicker .recent-cat-group-title{font-size:11px;color:#86a3bf;font-weight:780;margin:0 2px 8px}
      #recentCategoryPicker .recent-cat-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      #recentCategoryPicker .recent-cat-option{position:relative;border:1px solid #294c6d;background:#0a1929;color:#dce8f4;border-radius:12px;padding:10px 30px 10px 11px;font-size:12px;font-weight:720;text-align:left;min-height:42px}
      #recentCategoryPicker .recent-cat-option.selected{background:#16446d;border-color:#5aa8e7;color:white}
      #recentCategoryPicker .recent-cat-option.selected:after{content:'✓';position:absolute;right:11px;top:50%;transform:translateY(-50%);font-weight:900}
      #recentCategoryPicker .recent-cat-manage{margin-top:12px}
      #recentCategoryPicker .recent-cat-manage .recent-cat-option{width:100%}
    `;
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

  function closeCategoryPicker(){
    const picker=document.getElementById('recentCategoryPicker');
    if(picker)picker.hidden=true;
  }

  function closeModalDirect(){
    closeCategoryPicker();
    document.getElementById('recentTransactionModal')?.remove();
    document.body.style.overflow='';
  }

  function closeRecentModal(){
    if(history.state?.recentTransactionModal){history.back();return}
    closeModalDirect();
  }

  function ensureCategoryPicker(){
    let root=document.getElementById('recentCategoryPicker');
    if(root)return root;
    root=document.createElement('div');
    root.id='recentCategoryPicker';
    root.hidden=true;
    root.innerHTML=`<section class="recent-cat-sheet" role="dialog" aria-modal="true"><div class="recent-cat-handle"></div><div class="recent-cat-head"><div><div class="recent-cat-title">소비 분류</div><div class="recent-cat-sub">항목을 누르면 바로 선택됩니다.</div></div><button class="recent-cat-close" type="button" aria-label="닫기">×</button></div><div id="recentCatBody"></div></section>`;
    root.addEventListener('click',event=>{
      if(event.target===root||event.target.closest('.recent-cat-close')){closeCategoryPicker();return;}
      const option=event.target.closest('[data-recent-cat]');
      if(!option)return;
      const value=option.dataset.recentCat||'미분류';
      const hidden=document.getElementById('recentCategory');
      const button=document.getElementById('recentCategoryButton');
      if(hidden)hidden.value=value;
      if(button){button.dataset.value=value;button.textContent=recentCategoryLabel(value);}
      closeCategoryPicker();
    });
    document.body.appendChild(root);
    return root;
  }

  function openCategoryPicker(current){
    const root=ensureCategoryPicker();
    let html='';
    if(current && current!=='미분류' && !RECENT_VALUES.has(current)){
      html+=`<section class="recent-cat-group"><div class="recent-cat-group-title">현재 분류</div><div class="recent-cat-options"><button type="button" class="recent-cat-option selected" data-recent-cat="${esc(current)}">${esc(current)}</button></div></section>`;
    }
    RECENT_TAXONOMY.forEach(([group,items])=>{
      html+=`<section class="recent-cat-group"><div class="recent-cat-group-title">${esc(group)}</div><div class="recent-cat-options">`;
      items.forEach(item=>{html+=`<button type="button" class="recent-cat-option${item.value===current?' selected':''}" data-recent-cat="${esc(item.value)}">${esc(item.label)}</button>`;});
      html+='</div></section>';
    });
    html+=`<div class="recent-cat-manage"><button type="button" class="recent-cat-option${current==='미분류'?' selected':''}" data-recent-cat="미분류">미분류</button></div>`;
    root.querySelector('#recentCatBody').innerHTML=html;
    root.hidden=false;
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
    const current=String(tx.category||'미분류').trim()||'미분류';
    root.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div><h3 style="margin:0">${esc(tx.merchant||tx.category||'거래')}</h3>
        <div class="subtitle">${esc(new Date(tx.occurred_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}))} · ${esc(tx.account||tx.source||'')}</div>
        <div style="font-size:18px;font-weight:850;margin-top:7px">${amount>=0?'+':'−'}₩${Math.round(Math.abs(amount)).toLocaleString('ko-KR')}</div></div>
        <button class="btn small" type="button" data-recent-close>닫기</button>
      </div>
      <label>카테고리</label><input type="hidden" id="recentCategory" value="${esc(current)}"><button id="recentCategoryButton" class="recent-category-button" type="button" data-value="${esc(current)}">${esc(recentCategoryLabel(current))}</button>
      <label>메모</label><input id="recentMemo" maxlength="120" value="${esc(tx.memo||'')}" placeholder="무엇에 쓴 돈인지 적어두세요">
      <div class="recent-fixed-choice"><label for="recentFixedExpense"><input class="recent-fixed-check" type="checkbox" id="recentFixedExpense" ${tx.is_fixed_expense===true?'checked':''}><span>고정지출</span></label><div class="recent-fixed-note">체크하면 월별 결산의<br>고정지출에 포함됩니다.</div></div>
      <div id="recentStatus" class="subtitle" style="min-height:18px;text-align:right"></div>
      <div class="modal-actions"><button class="btn" type="button" data-recent-close>취소</button><button class="btn" type="button" data-recent-save>저장</button></div>
    </div>`;
    root.addEventListener('click',e=>{
      if(e.target===root||e.target.closest('[data-recent-close]')){e.preventDefault();closeRecentModal();return}
      if(e.target.closest('#recentCategoryButton')){e.preventDefault();openCategoryPicker(document.getElementById('recentCategory')?.value||'미분류');return;}
      if(e.target.closest('[data-recent-save]')){e.preventDefault();saveRecentEnhanced(String(tx.id));}
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
      setTimeout(()=>navigator.serviceWorker.register('./service-worker.js?rev=20260914-1020',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}),500);
    },{once:true});
  }

  function install(){
    installStyle();removeAuctionShortcut();installStableRecentRenderer();installInteraction();installHistory();installBfcacheRefresh();keepServiceWorkerFresh();ensureCategoryPicker();
    const currentLabel=document.getElementById('prevCfLabel');if(currentLabel)currentLabel.textContent='이번달 순현금흐름';
    global.__forceOpenRecentTransaction=id=>forceOpenModal(txById(id));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();

  global.FinanceCore={createCashFlow};
})(window);
