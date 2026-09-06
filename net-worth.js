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
  global.NetWorth={monthlySnapshots,yearSeries,change,sourceLabel,geometry,lineSVG};
})(window);
