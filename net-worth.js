/* Shared snapshot normalization and the dashboard's red line/area chart. */
(function(global){
  const number=value=>value==null||(typeof value==='string'&&!value.trim())?null:
    (typeof value==='number'||typeof value==='string')&&Number.isFinite(Number(value))?Number(value):null;
  function monthlySnapshots(rows){
    const grouped=new Map(),households=new Set();
    for(const row of [...(rows||[])].sort((a,b)=>String(a.snapshot_date).localeCompare(String(b.snapshot_date)))){
      const date=String(row.snapshot_date||''),match=/^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/.exec(date);
      if(!match)continue;
      if(row.household_id)households.add(row.household_id);
      const key=date.slice(0,7);
      grouped.set(key,{key,year:Number(match[1]),month:Number(match[2]),value:number(row.net_worth),source:row.source??null});
    }
    if(households.size>1)throw new Error('여러 가구의 순자산이 조회되어 합산을 중단했습니다.');
    return [...grouped.values()].sort((a,b)=>a.key.localeCompare(b.key));
  }
  function yearSeries(rows,year){
    const map=new Map(monthlySnapshots(rows).map(r=>[r.key,r]));
    return Array.from({length:12},(_,i)=>{const month=i+1,key=`${year}-${String(month).padStart(2,'0')}`;return map.get(key)||{key,year,month,value:null,source:null}});
  }
  function change(current,previous){
    const a=current?.value??null,b=previous?.value??null;
    const amount=a!==null&&b!==null?a-b:null;
    return {amount,rate:amount!==null&&b!==0?amount/Math.abs(b)*100:null};
  }
  function sourceLabel(source){return source==='asset_sheet_2026'?'자산평가서 기준':source==='automatic'?'대시보드 자동평가':'출처 미확인'}
  function geometry(series){
    const values=series.filter(r=>r.value!==null).map(r=>r.value);
    let min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):1;
    if(min===max){const padding=Math.max(Math.abs(min)*.08,1);min-=padding;max+=padding}
    const points=series.map((r,i)=>({x:28+680*(series.length===1?.5:i/(series.length-1)),y:r.value===null?null:18+142*(1-(r.value-min)/(max-min))}));
    const segments=[];let segment=[];
    for(const point of points){if(point.y===null){if(segment.length)segments.push(segment);segment=[]}else segment.push(point)}
    if(segment.length)segments.push(segment);
    return {points,segments,min,max};
  }
  function lineSVG(series,labels=true){
    const {points,segments}=geometry(series);
    const lines=segments.filter(s=>s.length>1).map(s=>{
      const poly=s.map(p=>`${p.x},${p.y}`).join(' '),area=`${s[0].x},160 ${poly} ${s.at(-1).x},160`;
      return `<polygon points="${area}" fill="rgba(255,91,101,.10)"/><polyline points="${poly}" fill="none" stroke="#ff5b65" stroke-width="2.5"/>`;
    }).join('');
    const circles=points.filter(p=>p.y!==null).map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3.8" fill="#ff5b65"/>`).join('');
    const ticks=labels?points.map((p,i)=>`<text x="${p.x}" y="183" text-anchor="middle" fill="#71869d" font-size="10">${series[i].month}월</text>`).join(''):'';
    return `<svg viewBox="0 0 720 190" preserveAspectRatio="none" aria-hidden="true"><line x1="28" y1="18" x2="28" y2="160" stroke="#1d3853"/><line x1="28" y1="160" x2="708" y2="160" stroke="#1d3853"/>${lines}${circles}${ticks}</svg>`;
  }
  // Dashboard-only scale/rendering: settlement's lineSVG stays unchanged.
  function dashboardScale(series){
    const values=series.filter(r=>Number.isFinite(r.value)).map(r=>r.value);
    const low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):0;
    const padding=Math.max((high-low)*.1,low===high?Math.abs(low)*.025:0,1000000);
    const target=(high-low+padding*2)/3,magnitude=10**Math.floor(Math.log10(target));
    const step=Math.max(1000000,[1,2,2.5,5,10].find(n=>n*magnitude>=target)*magnitude);
    const min=Math.floor((low-padding)/step)*step,max=Math.ceil((high+padding)/step)*step;
    const ticks=Array.from({length:Math.round((max-min)/step)+1},(_,i)=>min+i*step);
    return {min,max,ticks};
  }
  function dashboardChart(series){
    const {min,max,ticks}=dashboardScale(series),height=220,bottom=192;
    const y=value=>32+(bottom-32)*(max-value)/(max-min);
    const eok=value=>(value/100000000).toLocaleString('ko-KR',{maximumFractionDigits:3})+'억';
    const points=series.map((r,i)=>({x:series.length===1?50:i/(series.length-1)*100,y:y(r.value)}));
    const poly=points.map(p=>`${p.x},${p.y}`).join(' ');
    const grid=ticks.map(value=>`<line x1="0" y1="${y(value)}" x2="100" y2="${y(value)}" stroke="#71869d" stroke-opacity=".16" vector-effect="non-scaling-stroke"/>`).join('');
    const axis=ticks.map(value=>`<span class="trend-y" style="top:${y(value)/height*100}%">${eok(value)}</span>`).join('');
    const dateValue=r=>`${r.year}년 ${r.month}월 · ${r.value.toLocaleString('ko-KR')}원`;
    const last=series.at(-1),lastPoint=points.at(-1);
    const targets=series.map((r,i)=>`<button type="button" class="trend-target" style="left:${points[i].x}%" data-trend-label="${dateValue(r)}" aria-label="${dateValue(r)}" aria-pressed="${r===last}"><span>${r.month}월</span></button>`).join('');
    // HTML dots/labels keep their size legible on narrow screens; only the line scales.
    const dots=points.map(p=>`<i class="trend-dot" style="left:${p.x}%;top:${p.y/height*100}%"></i>`).join('');
    const line=points.length>1?`<polygon points="${points[0].x},${bottom} ${poly} ${lastPoint.x},${bottom}" fill="rgba(255,91,101,.10)"/><polyline points="${poly}" fill="none" stroke="#ff5b65" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`:'';
    const label=last?`<span class="trend-last" style="left:${lastPoint.x}%;top:${lastPoint.y/height*100}%">현재 ${(last.value/100000000).toLocaleString('ko-KR',{maximumFractionDigits:2})}억</span>`:'';
    return `<div class="trend-plot"><svg viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">${grid}${line}</svg>${axis}${dots}${targets}${label}</div><div class="trend-readout num" id="trendReadout" role="status" aria-live="polite">${last?dateValue(last):'순자산 기록이 없습니다.'}</div>`;
  }
  global.NetWorth={monthlySnapshots,yearSeries,change,sourceLabel,geometry,lineSVG,dashboardScale,dashboardChart};
})(window);

/* Dashboard available-funds patch.
   Gross asset values still feed net worth; this only changes the liquid/available-funds card. */
(function(global){
  const money=n=>'₩'+Math.round(Number(n||0)).toLocaleString('ko-KR');
  const liquid=row=>{
    const v=Number(row?.liquid_value);
    if(row?.liquid_value!==null&&row?.liquid_value!==undefined&&Number.isFinite(v))return v;
    const fallback=Number(row?.value??row?.balance??row?.amount??0);
    return Number.isFinite(fallback)?fallback:0;
  };
  const gross=row=>{
    const v=Number(row?.value??row?.balance??row?.amount??0);
    return Number.isFinite(v)?v:0;
  };
  const nameOf=row=>String(row?.name??row?.account??row?.label??row?.asset_name??row?.institution??'계좌').trim()||'계좌';

  function patch(){
    const card=document.getElementById('availableCard');
    if(card){
      const label=card.querySelector('.summary-label');
      if(label)label.innerHTML='<span class="summary-icon">↗</span>가용자금 <span class="summary-chevron">›</span>';
      const sub=card.querySelector('.summary-sub');
      if(sub)sub.textContent='주식 + 계좌 실사용 가능액';
    }
    const title=document.getElementById('availableSheetTitle');
    if(title)title.textContent='가용자금 구성';
    const sheetSub=document.querySelector('#availableAssetsModal .asset-sheet-sub');
    if(sheetSub)sheetSub.textContent='부동산 지분·거주보증금 제외 · 주식 + 계좌 실사용 가능액';
    const availableTitle=document.querySelector('#availableAssetsModal .available-title');
    if(availableTitle)availableTitle.textContent='현재 가용자금';
    const availableNote=document.querySelector('#availableAssetsModal .available-note');
    if(availableNote)availableNote.textContent='연금저축은 중도인출 예상세금 차감 후 금액';

    global.renderAvailableAssets=function(accountRows,stockValue){
      const rows=Array.isArray(accountRows)?accountRows:[];
      const stock=Math.max(0,Number(stockValue||0));
      const accountTotal=rows.reduce((sum,row)=>sum+Math.max(0,liquid(row)),0);
      const total=stock+accountTotal;
      const totalEl=document.getElementById('availableAssetTotal');
      if(totalEl)totalEl.textContent=typeof global.won==='function'?global.won(total):money(total);

      const parts=[`<div class="available-row">
        <div class="available-left"><div class="available-icon">↗</div><div><div class="available-name">주식</div><div class="available-sub">현재가 기준 매도 가능액</div></div></div>
        <div class="available-value num">${money(stock)}</div>
      </div>`];

      rows.slice().sort((a,b)=>{
        const ap=String(a?.asset_type||'')==='pension'?1:0,bp=String(b?.asset_type||'')==='pension'?1:0;
        return ap-bp||nameOf(a).localeCompare(nameOf(b),'ko');
      }).forEach(row=>{
        const g=Math.max(0,gross(row)),v=Math.max(0,liquid(row));
        const pension=String(row?.asset_type||'').toLowerCase()==='pension';
        const tax=Math.max(0,Number(row?.liquid_tax_estimate||0));
        const sub=pension
          ? `연금저축 · 평가 ${money(g)}${tax>0?' · 예상세금 '+money(tax):''}`
          : '현재 계좌 잔액';
        parts.push(`<div class="available-row">
          <div class="available-left"><div class="available-icon">${pension?'P':'₩'}</div><div><div class="available-name">${nameOf(row)}</div><div class="available-sub">${sub}</div></div></div>
          <div class="available-value num">${money(v)}</div>
        </div>`);
      });

      const list=document.getElementById('availableAssetsList');
      if(list)list.innerHTML=parts.join('');
      return total;
    };

    const dash=document.getElementById('dash');
    if(typeof global.load==='function'&&dash&&getComputedStyle(dash).display!=='none')global.load();
  }

  setTimeout(patch,0);
})(window);

/* Imported-statement accounting patch for the main dashboard.
   Internal transfers are not spending/income; card refunds reduce spending. */
(function(global){
  function monthKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
  function patchSpendingViews(){
    if(typeof global.renderCategories==='function'){
      global.renderCategories=function(tx){
        const thism=monthKey(new Date()),map={};
        tx.forEach(t=>{
          if(monthKey(new Date(t.occurred_at))!==thism)return;
          const category=String(t.category||'미분류').trim()||'미분류';
          if(category==='내부이체')return;
          const amount=Number(t.amount||0);
          if(!Number.isFinite(amount)||amount===0)return;
          if(amount<0)map[category]=(map[category]||0)+Math.abs(amount);
          else if(String(t.source||'')==='toss_statement_refund')map[category]=(map[category]||0)-amount;
        });
        Object.keys(map).forEach(key=>{if(map[key]<=0)delete map[key]});
        const total=Object.values(map).reduce((sum,n)=>sum+n,0);
        let items=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5);
        if(!items.length)items=[['미분류',1]];
        const colors=['#8c6cff','#ff5b65','#4b9dff','#ffb33c','#52d1c7'];let acc=0;
        const seg=items.map(([k,v],i)=>{const pct=total>0?v/total*100:(i===0?100:0);const st=acc;acc+=pct;return `${colors[i]} ${st}% ${acc}%`});
        const donut=document.getElementById('expenseDonut');
        if(donut)donut.style.background=`conic-gradient(${seg.join(',')})`;
        const list=document.getElementById('categoryList');
        if(list)list.innerHTML=items.map(([k,v],i)=>{const pct=total>0?v/total*100:(i===0?100:0);return `<div class="cat-row"><span class="cat-dot" style="background:${colors[i]}"></span><span>${k}</span><span class="cat-val">${pct.toFixed(0)}%</span></div>`}).join('');
      };
    }
    if(typeof global.renderTransactions==='function'){
      global.renderTransactions=function(tx){
        const visible=(tx||[]).filter(t=>{
          const category=String(t.category||'').trim();
          const amount=Number(t.amount||0);
          return category!=='내부이체'&&(amount<0||String(t.source||'')==='toss_statement_refund');
        }).slice(0,10);
        const rows=document.getElementById('txrows');
        if(!rows)return;
        rows.innerHTML=visible.map(t=>{
          const amount=Number(t.amount||0),refund=amount>0&&String(t.source||'')==='toss_statement_refund';
          const merchant=(t.merchant||t.category||'거래')+(refund?' · 환불':'');
          return `<div class="tx-row"><div class="tx-time">${new Date(t.occurred_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</div><div class="tx-main"><div class="tx-merchant">${merchant}</div><div class="tx-account">${t.account||t.source||''} · ${t.category||'미분류'}</div></div><div class="tx-amt ${amount>=0?'pos':'neg'}">${amount>=0?'+':'-'}${typeof global.wonFull==='function'?global.wonFull(Math.abs(amount)):'₩'+Math.abs(Math.round(amount)).toLocaleString('ko-KR')}</div></div>`;
        }).join('')||'<div class="subtitle">아직 소비내역이 없습니다.</div>';
      };
    }
    const dash=document.getElementById('dash');
    if(typeof global.load==='function'&&dash&&getComputedStyle(dash).display!=='none')global.load();
  }
  setTimeout(patchSpendingViews,0);
})(window);
