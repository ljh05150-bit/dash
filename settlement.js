(function(){
  'use strict';
  const SUPABASE_URL='https://ixuxaqerdftadfnkxxui.supabase.co';
  const SUPABASE_KEY='sb_publishable_2Q42l50u-YjgBmu5xDvoAA_LUtLhm8j';
  const el=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const full=value=>value===null?'미분류':Math.round(value).toLocaleString('ko-KR')+'원';
  const short=value=>{
    if(value===null)return '—';
    const sign=value<0?'-':'',n=Math.abs(value);
    if(n>=100000000)return sign+(n/100000000).toLocaleString('ko-KR',{maximumFractionDigits:2})+'억';
    if(n>=10000)return sign+(n/10000).toLocaleString('ko-KR',{maximumFractionDigits:1})+'만';
    return sign+Math.round(n).toLocaleString('ko-KR')+'원';
  };
  const now=new Date(),params=new URLSearchParams(location.search);
  let year=Number(params.get('year'))||now.getFullYear(),month=Number(params.get('month'))||now.getMonth()+1;
  year=Number.isInteger(year)?Math.max(2026,Math.min(now.getFullYear(),year)):now.getFullYear();
  month=Number.isInteger(month)?Math.max(1,Math.min(12,month)):now.getMonth()+1;
  let view=params.get('view')==='year'?'year':'month',client,flow,repository,activeUser=null,requestId=0;
  const colors=['#8c6cff','#4b9dff','#52d1c7','#ffb33c','#ff5b65'];
  const sourceLabel=r=>({stored:'저장 실적',automatic:'자동집계',missing:'자료 없음',future:'예정',unavailable:'확인 필요'}[r.source]);

  function metric(label,value,accent=false,note=''){
    return `<div class="summary-card ${accent?'accent':''}"><div class="summary-label">${label}</div><div class="summary-value num ${accent?(value<0?'negative':'good'):''}" title="${escape(full(value))}">${short(value)}</div><div class="summary-sub">${value===null?(note||'미분류'):escape(full(value))}${value!==null&&note?'<br>'+escape(note):''}</div></div>`;
  }
  function metrics(r,savingsNote=''){
    return `<div class="summary-grid">${metric('총수입',r.total_income)}${metric('총지출',r.total_expense)}${metric('순현금흐름',r.net_cash_flow,true)}${metric('저축액',r.total_savings,false,savingsNote)}</div>`;
  }
  function bars(values){
    const items=Object.entries(values).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
    if(!items.length)return '<div class="empty">표시할 지출 내역이 없습니다.</div>';
    const max=Math.max(...items.map(([,n])=>n));
    return `<div class="breakdown">${items.map(([name,n],i)=>`<div class="breakdown-row"><div class="breakdown-head"><span>${escape(name)}</span><strong class="num">${escape(full(n))}</strong></div><div class="track"><div class="fill" style="width:${n/max*100}%;background:${colors[i%colors.length]}"></div></div></div>`).join('')}</div>`;
  }
  function rentWarning(r){
    if(!r.partial)return '';
    const failed=(r.rent||[]).filter(item=>!item.live).map(item=>`${item.name} ${item.status}`).join(' · ');
    return `<div class="notice warning">${escape(failed||'수납액 확인 필요')}<br>확인된 거래와 실제 수납액만 합산했습니다. 미확인 수납액은 제외되어 있습니다.</div>`;
  }
  function renderMonth(current,previous){
    el('sourceNote').textContent=sourceLabel(current)+(current.source==='stored'?' · 저장값 기준':current.source==='automatic'?' · 거래 + 실제 수납':'');
    if(['missing','future','unavailable'].includes(current.source)){
      el('report').innerHTML=rentWarning(current)+`<div class="card"><h2 class="section-title">${year}년 ${month}월</h2><p class="empty">${current.source==='future'?'아직 도래하지 않은 달입니다.':current.source==='unavailable'?'거래나 실제 수납액을 확인할 수 없습니다. 잠시 후 새로고침해 주세요.':'저장된 월별 결산이 없습니다. 과거 실적은 임의로 계산하지 않습니다.'}</p></div>`;
      return;
    }
    const delta=current.net_cash_flow!==null&&previous.net_cash_flow!==null?current.net_cash_flow-previous.net_cash_flow:null;
    const comparison=delta===null?'비교 자료 없음':delta===0?'변동 없음':(delta>0?'+':'−')+full(Math.abs(delta));
    const fixed=current.fixed_expense,variable=current.variable_expense;
    const splitTotal=(fixed||0)+(variable||0);
    const savingsNote=current.source==='automatic'?'미분류 · 구분 정보 없음':current.savings_rate!==null?'저축률 '+current.savings_rate+'%':'';
    el('report').innerHTML=rentWarning(current)+metrics(current,savingsNote)+
      `<div class="compare"><span>전월 대비 순현금흐름<small>${previous.month}월 ${previous.net_cash_flow===null?'자료 없음':full(previous.net_cash_flow)}${previous.partial?' · 일부 미확인':''}</small></span><strong class="num ${delta>0?'good':delta<0?'negative':'muted'}">${escape(comparison)}</strong></div>`+
      `<h2 class="section-title">고정지출 / 비고정지출</h2><div class="card"><div class="split"><div><div class="label">고정지출</div><div class="value num">${fixed===null?'미분류':short(fixed)}</div>${fixed===null?'':`<p class="small-note">${full(fixed)}</p>`}</div><div><div class="label">비고정지출</div><div class="value num">${variable===null?'미분류':short(variable)}</div>${variable===null?'':`<p class="small-note">${full(variable)}</p>`}</div></div>`+
      (splitTotal>0?`<div class="split-track"><div class="fixed-fill" style="width:${(fixed||0)/splitTotal*100}%"></div><div class="variable-fill" style="width:${(variable||0)/splitTotal*100}%"></div></div>`:'')+
      (current.source==='automatic'?`<p class="small-note">미분류 지출 ${full(current.unclassified_expense)} · 거래에 구분 정보가 없습니다.</p>`:'')+'</div>'+
      `<div class="year-grid"><section><h2 class="section-title">카테고리별 지출</h2><div class="card">${bars(current.categories)}</div></section><section><h2 class="section-title">결제수단별 지출</h2><div class="card">${bars(current.payment_methods)}${current.source==='automatic'?'<p class="small-note">거래에 기록된 계좌·출처 기준</p>':''}</div></section></div>`;
  }
  function trend(records,cash=false){
    const max=Math.max(1,...records.flatMap(r=>cash?[Math.abs(r.net_cash_flow||0)]:[r.total_income||0,r.total_expense||0]));
    const cols=records.map(r=>{
      const title=`${r.month}월 · ${sourceLabel(r)} · 수입 ${r.total_income===null?'미집계':full(r.total_income)} · 지출 ${r.total_expense===null?'미집계':full(r.total_expense)} · 순현금흐름 ${r.net_cash_flow===null?'미집계':full(r.net_cash_flow)}`;
      const content=cash?`<div class="flow-positive">${r.net_cash_flow>0?`<div class="bar" style="height:${Math.max(1,r.net_cash_flow/max*100)}%"></div>`:r.net_cash_flow===null?'<span class="chart-empty">·</span>':''}</div><div class="flow-negative">${r.net_cash_flow<0?`<div class="bar" style="height:${Math.max(1,-r.net_cash_flow/max*100)}%"></div>`:''}</div>`:
        `<div class="bar-pair">${r.total_income===null?'<span class="chart-empty">·</span>':`<div class="bar" style="height:${r.total_income>0?Math.max(1,r.total_income/max*100):0}%"></div><div class="bar expense" style="height:${r.total_expense>0?Math.max(1,r.total_expense/max*100):0}%"></div>`}</div>`;
      return `<div class="chart-col" title="${escape(title)}">${content}<div class="tick">${r.month}</div></div>`;
    }).join('');
    return `<div class="chart-caption"><span>${cash?'± ':''}${short(max)} 기준</span><span>1–12월</span></div><div class="chart" role="img" aria-label="${cash?'월별 순현금흐름':'월별 수입과 지출'} 추이. 월별 리스트에서 달을 선택하면 정확한 금액을 확인할 수 있습니다.">${cols}</div>`;
  }
  function renderYear(records){
    const summary=SettlementData.annualSummary(records);
    el('sourceNote').textContent=`${year}년 · ${summary.count}개월 집계`;
    const savingsNote=summary.savingsMonths?`${summary.savingsMonths}개월 저장값 합계`:'미분류 · 저장된 저축액 없음';
    el('report').innerHTML=(summary.partial?'<div class="notice warning">일부 달의 월세 수납이 미확인입니다. 연간 합계에는 확인된 금액만 포함됩니다.</div>':'')+
      metrics(summary,savingsNote)+`<p class="small-note">저장 실적 ${summary.stored}개월 · 자동집계 ${summary.automatic}개월${summary.missing?' · 자료 없음 '+summary.missing+'개월':''}<br>집계되지 않은 달은 합계에 포함되지 않습니다.</p>`+
      `<div class="year-grid"><section><h2 class="section-title">수입 / 지출 추이</h2><div class="card"><div class="legend"><span>수입</span><span class="expense">지출</span></div>${trend(records)}</div></section><section><h2 class="section-title">월별 순현금흐름</h2><div class="card"><div class="legend"><span class="positive">유입</span><span class="negative">유출</span></div>${trend(records,true)}</div></section></div>`+
      `<h2 class="section-title">연간 카테고리별 지출</h2><div class="card">${bars(summary.categories)}</div>`+
      `<h2 class="section-title">월별 리스트</h2><div class="card month-list"><div class="list-head"><span>월</span><span>수입</span><span>지출</span><span>순현금흐름</span></div>${records.map(r=>`<button class="month-row" type="button" data-month="${r.month}" aria-label="${r.month}월 결산 보기"><span class="month">${r.month}월</span><span class="cell num" title="${escape(full(r.total_income))}">${short(r.total_income)}<small>${sourceLabel(r)}</small></span><span class="cell num" title="${escape(full(r.total_expense))}">${short(r.total_expense)}</span><span class="cell num ${r.net_cash_flow<0?'negative':'good'}" title="${escape(full(r.net_cash_flow))}">${short(r.net_cash_flow)}${r.partial?'<small>일부 미확인</small>':''}</span></button>`).join('')}</div>`;
  }
  function controls(){
    el('yearSelect').innerHTML=Array.from({length:now.getFullYear()-2026+1},(_,i)=>2026+i).map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}년</option>`).join('');
    el('monthSelect').innerHTML=Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}" ${m===month?'selected':''}>${m}월</option>`).join('');
    el('monthSelect').hidden=view==='year';
    ['monthlyTab','yearlyTab'].forEach((id,i)=>{const selected=(view==='month')===(i===0);el(id).setAttribute('aria-selected',String(selected));el(id).tabIndex=selected?0:-1});
    el('report').setAttribute('aria-labelledby',view==='month'?'monthlyTab':'yearlyTab');
    el('previous').setAttribute('aria-label',view==='month'?'이전 달':'이전 연도');
    el('next').setAttribute('aria-label',view==='month'?'다음 달':'다음 연도');
    el('previous').disabled=view==='year'?year<=2026:year===2026&&month===1;
    el('next').disabled=view==='year'?year>=now.getFullYear():year===now.getFullYear()&&month>=12;
    const url=new URL(location.href);url.searchParams.set('view',view);url.searchParams.set('year',year);url.searchParams.set('month',month);history.replaceState(null,'',url);
  }
  function showStatus(message,warning=false){el('status').hidden=false;el('status').className='notice'+(warning?' warning':'');el('status').textContent=message}
  async function render(){
    const id=++requestId;
    controls();el('report').hidden=true;el('report').setAttribute('aria-busy','true');
    if(!activeUser||!repository)return;
    showStatus('결산을 불러오고 있습니다.');el('sourceNote').textContent='불러오는 중';
    try{
      const repo=repository;
      if(view==='year'){
        const rows=await repo.getYear(year);if(id!==requestId)return;renderYear(rows);
      }else{
        const prev=new Date(year,month-2,1);
        const [current,previous]=await Promise.all([repo.getMonth(year,month),repo.getMonth(prev.getFullYear(),prev.getMonth()+1)]);
        if(id!==requestId)return;renderMonth(current,previous);
      }
      el('report').hidden=false;el('status').hidden=true;
    }catch(error){
      if(id!==requestId)return;
      console.error('settlement load failed',error);
      el('sourceNote').textContent='불러오기 실패';
      showStatus('결산을 불러오지 못했습니다. '+(error.message||'네트워크 연결을 확인해 주세요.'),true);
    }finally{if(id===requestId)el('report').setAttribute('aria-busy','false')}
  }
  function sessionChanged(session){
    const nextUser=session?.user?.id||null;
    if(nextUser===activeUser&&nextUser)return;
    activeUser=nextUser;repository=null;++requestId;
    if(!nextUser){
      el('report').innerHTML='';el('report').hidden=true;el('report').setAttribute('aria-busy','false');
      el('sourceNote').textContent='로그인 필요';showStatus('로그인 세션이 없습니다. 대시보드에서 로그인하면 같은 세션으로 결산을 확인할 수 있습니다.');
      const link=document.createElement('a');link.href='./index.html';link.textContent='대시보드로 이동';el('status').append(document.createElement('br'),link);return;
    }
    repository=SettlementData.createRepository(client,flow);render();
  }
  el('monthlyTab').addEventListener('click',()=>{view='month';render()});
  el('yearlyTab').addEventListener('click',()=>{view='year';render()});
  document.querySelector('.tabs').addEventListener('keydown',event=>{
    if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();view=event.key==='Home'?'month':event.key==='End'?'year':view==='month'?'year':'month';render();el(view==='month'?'monthlyTab':'yearlyTab').focus()}
  });
  el('yearSelect').addEventListener('change',event=>{year=Number(event.target.value);render()});
  el('monthSelect').addEventListener('change',event=>{month=Number(event.target.value);render()});
  function move(direction){if(view==='year')year+=direction;else{const date=new Date(year,month-1+direction,1);year=date.getFullYear();month=date.getMonth()+1}render()}
  el('previous').addEventListener('click',()=>move(-1));el('next').addEventListener('click',()=>move(1));
  el('refresh').addEventListener('click',()=>{if(activeUser){repository=SettlementData.createRepository(client,flow);render()}});
  el('report').addEventListener('click',event=>{const row=event.target.closest('[data-month]');if(row){month=Number(row.dataset.month);view='month';render();el('monthlyTab').focus()}});
  controls();
  try{
    client=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:'family-finance-auth'}
    });
    flow=FinanceCore.createCashFlow({client,supabaseUrl:SUPABASE_URL,supabaseKey:SUPABASE_KEY,
      properties:{seohui:{name:'서희빌',propertyPk:811825},raum:{name:'라움하우스',propertyPk:884400}}});
    // Do not await Supabase methods inside its auth-state callback.
    client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>sessionChanged(session),0)});
    client.auth.getSession().then(({data,error})=>{if(error)throw error;sessionChanged(data.session)}).catch(error=>{
      console.error('settlement session',error);showStatus('로그인 세션을 확인할 수 없습니다. 네트워크 연결을 확인한 뒤 다시 열어 주세요.',true);
    });
  }catch(error){console.error('settlement init',error);showStatus('페이지를 시작할 수 없습니다. 네트워크 연결과 브라우저 저장소 설정을 확인해 주세요.',true)}
})();
