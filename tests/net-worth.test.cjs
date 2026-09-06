const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={window:{},console};vm.createContext(ctx);
for(const file of ['net-worth.js','settlement-data.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
ctx.NetWorth=ctx.window.NetWorth;
const N=ctx.NetWorth,D=ctx.window.SettlementData;
const historical=Array.from({length:32},(_,i)=>{const date=new Date(2024,i,1);return {snapshot_date:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-01`,household_id:'family',net_worth:100000000+i*1000000,total_assets:null,total_debt:null,source:'asset_sheet_2026'}});
const automatic={snapshot_date:'2026-09-01',household_id:'family',net_worth:150000000,source:'automatic'};
const all=[...historical,automatic];
const normalized=N.monthlySnapshots([...all].reverse());assert.equal(normalized.length,33);assert.equal(normalized[0].key,'2024-01');assert.equal(normalized.at(-1).value,150000000);
const latest=N.monthlySnapshots([...all,{...automatic,snapshot_date:'2026-09-15',net_worth:155000000}]);assert.equal(latest.length,33);assert.equal(latest.at(-1).value,155000000);
const year=N.yearSeries(all,2026);assert.equal(year.length,12);assert.equal(year[8].source,'automatic');assert.equal(year[7].source,'asset_sheet_2026');assert.equal(year[9].value,null);assert.equal(year[11].value,null);
assert.equal(N.yearSeries(all,2024).filter(r=>r.value!==null).length,12);assert.equal(N.yearSeries(all,2025).filter(r=>r.value!==null).length,12);
assert.equal(N.yearSeries([{snapshot_date:'2026-01-01',net_worth:0}],2026)[0].value,0);
assert.equal(N.monthlySnapshots([{snapshot_date:'2026-01-01',net_worth:null,total_assets:123,total_debt:10}])[0].value,null);
assert.equal(N.change({value:120},{value:100}).amount,20);assert.equal(N.change({value:120},{value:100}).rate,20);
assert.equal(N.change({value:-80},{value:-100}).rate,20);assert.equal(N.change({value:20},{value:0}).rate,null);assert.equal(N.change({value:null},{value:100}).amount,null);
const gap=[{month:1,value:100},{month:2,value:null},{month:3,value:200}];assert.equal(N.geometry(gap).segments.length,2);assert.equal((N.lineSVG(gap).match(/<polyline/g)||[]).length,0);assert.equal((N.lineSVG(gap).match(/<circle/g)||[]).length,2);
assert.ok(!/NaN|Infinity/.test(N.lineSVG([{month:1,value:-100},{month:2,value:-100}])));
assert.throws(()=>N.monthlySnapshots([{...automatic,household_id:'a'},{...automatic,household_id:'b'}]),/여러 가구/);
function mockClient(){const calls=[];return {calls,from(table){const c={table,filters:[]};calls.push(c);const q={select(columns){c.columns=columns;return q},eq(k,v){c.filters.push(['eq',k,v]);return q},gte(k,v){c.filters.push(['gte',k,v]);return q},lt(k,v){c.filters.push(['lt',k,v]);return q},order(k,o){c.order=[k,o];return q},then(resolve,reject){let data=table==='net_worth_snapshots'?all:[{year:2026,month:1,household_id:'family'}];for(const [op,k,v] of c.filters)data=data.filter(r=>op==='eq'?r[k]===v:op==='gte'?r[k]>=v:r[k]<v);return Promise.resolve({data,error:null}).then(resolve,reject)}};return q}}}
(async()=>{
const client=mockClient(),repo=D.createRepository(client,{});const snaps=await repo.getSnapshots(2026);assert.equal(snaps.length,10);assert.equal(snaps[0].snapshot_date,'2025-12-01');assert.equal(N.change(N.monthlySnapshots(snaps)[1],N.monthlySnapshots(snaps)[0]).amount,1000000);await repo.getSnapshots(2026);assert.equal(client.calls.filter(c=>c.table==='net_worth_snapshots').length,1);
const query=client.calls.find(c=>c.table==='net_worth_snapshots');assert.ok(query.filters.some(([op,k,v])=>op==='eq'&&k==='household_id'&&v==='family'));assert.equal(query.columns,'snapshot_date,net_worth,source,household_id');
const index=fs.readFileSync('index.html','utf8');const save=index.slice(index.indexOf('async function saveMonthlySnapshot('),index.indexOf('async function load(){'));
let payload,options,warnings=[];const saveContext={sb:{from(table){assert.equal(table,'net_worth_snapshots');return {async upsert(row,opts){payload=row;options=opts;return {error:null}}}}},console:{warn(...args){warnings.push(args)}}};vm.createContext(saveContext);vm.runInContext(save,saveContext);await saveContext.saveMonthlySnapshot(123456.7,200000,76543.3);assert.equal(options.onConflict,'household_id,snapshot_date');assert.equal(payload.source,'automatic');assert.equal(payload.net_worth,123457);assert.ok(!('household_id' in payload));assert.equal(warnings.length,0);
const render=index.slice(index.indexOf('function renderTrend('),index.indexOf('function inspectTrend('));const renderContext={NetWorth:N,trendWrap:{},trendCurrent:{},trendBadge:{},won:String};vm.createContext(renderContext);vm.runInContext(render,renderContext);renderContext.renderTrend(all,150000000);assert.equal((renderContext.trendWrap.innerHTML.match(/class="trend-dot"/g)||[]).length,12);assert.ok(renderContext.trendBadge.textContent.startsWith('최근 12개월'));
for(const values of [[480000000,581000000],[581000000],[581000001,581000002],[0,0],[-500000000,-400000000],[-100000000,200000000]]){
  const series=values.map((value,i)=>({year:2026,month:i+1,value})),scale=N.dashboardScale(series);
  assert.ok(scale.min<Math.min(...values));assert.ok(scale.max>Math.max(...values));
  assert.ok(scale.ticks.length>=3&&scale.ticks.length<=6);assert.ok(scale.ticks.every(v=>Number.isFinite(v)));
  const markup=N.dashboardChart(series);assert.ok(!/NaN|Infinity|undefined/.test(markup));
  assert.ok(markup.includes('aria-label="2026년 1월 · '+values[0].toLocaleString('ko-KR')+'원"'));
}
assert.ok(N.dashboardScale([{value:480000000},{value:581000000}]).min>0);
assert.ok(N.dashboardChart([{year:2026,month:9,value:581000000}]).includes('현재 5.81억'));
assert.ok(!/NaN|Infinity|undefined/.test(N.dashboardChart([])));
for(const file of ['net-worth.js','settlement-data.js','settlement.js'])new vm.Script(fs.readFileSync(file,'utf8'));
assert.ok(index.includes('<script src="./net-worth.js"></script>'));assert.ok(fs.readFileSync('settlement.html','utf8').includes('<script src="./net-worth.js" defer></script>'));
console.log('PASS: source/null preservation, chronology/month dedupe, 2024–2026 years, gaps/zero/negative values, percent changes, December lookup, household query/cache, automatic household upsert, latest 12 dashboard points, JavaScript syntax.');
})().catch(e=>{console.error(e);process.exitCode=1});
