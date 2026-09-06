const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={window:{},console:{warn(){}},fetch:async()=>{throw Error('unexpected fetch')}};
vm.createContext(ctx);
for(const file of ['finance-core.js','settlement-data.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
for(const file of ['index.html','settlement.html'])for(const [,s] of fs.readFileSync(file,'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(s);
new vm.Script(fs.readFileSync('settlement.js','utf8'));
const D=ctx.window.SettlementData;
const flow=ctx.window.FinanceCore.createCashFlow({client:{},supabaseUrl:'test',supabaseKey:'test',properties:{seohui:{propertyPk:811825},raum:{propertyPk:884400}}});
const z={ok:true,properties:[{propertyPk:811825,paidAmount:1100000},{propertyPk:884400,paidAmount:2200000}]};
const input={year:2026,month:7,household_id:'family',total_income:'12000000',total_expense:8000000,total_savings:1500000,net_cash_flow:1234567,savings_rate:12.5,fixed_expense:3000000,variable_expense:5000000,categories:{식비:1000000,'투자관련':7000000},payment_methods:{현금:8000000}};
function json(x){return JSON.parse(JSON.stringify(x))}
input.income_sources={월급:7000000,월세수입:4000000,기타수입:1000000};
const saved=D.storedRecord(input);assert.equal(saved.net_cash_flow,1234567);assert.equal(saved.total_savings,1500000);assert.equal(saved.savings_rate,12.5);assert.equal(saved.fixed_expense,3000000);assert.equal(saved.variable_expense,5000000);
assert.deepEqual(json(saved.income_sources),input.income_sources);
assert.deepEqual(json(D.storedRecord({...input,income_sources:[{category:'월급',amount:7000000},{name:'상여금',value:5000000}]}).income_sources),{월급:7000000,상여금:5000000});
assert.deepEqual(json(D.storedRecord({...input,income_sources:null}).income_sources),{});
assert.equal(D.storedRecord({...input,income_sources:{월급:1}}).total_income,12000000);
assert.deepEqual(json(D.breakdown({a:1,b:0,c:'2',d:null,e:'bad'})),{a:1,b:0,c:2});
assert.deepEqual(json(D.breakdown([{category:'a',amount:1},{name:'a',value:2},{method:'b',total:4},null])),{a:3,b:4});
assert.equal(D.breakdown(JSON.parse('{"__proto__":10}')).__proto__,10);
const tx=[{id:1,occurred_at:'2026-08-05T00:00:00+09:00',amount:5000000},{id:2,occurred_at:'2026-08-06T00:00:00+09:00',amount:-1200000,category:'식비',account:'가족 계좌'}];
const auto=D.automaticRecord(tx,2026,8,z,flow);assert.equal(auto.total_income,8300000);assert.equal(auto.net_cash_flow,7100000);assert.equal(auto.total_savings,null);assert.equal(auto.fixed_expense,null);assert.equal(auto.variable_expense,null);assert.equal(auto.unclassified_expense,1200000);assert.deepEqual(json(auto.payment_methods),{'가족 계좌':1200000});
assert.deepEqual(json(auto.income_sources),{미분류:5000000,월세수입:3300000});
assert.equal(Object.values(auto.income_sources).reduce((a,b)=>a+b,0),auto.total_income);
const incomeTx=[...tx,{occurred_at:'2026-08-07',amount:200001,category:'상여금'},{occurred_at:'2026-08-08',amount:500,category:'월세수입'},{occurred_at:'2026-08-09',amount:100,category:'  '},{occurred_at:'2026-09-01',amount:999,category:'다른 달'},{occurred_at:'2026-08-10',amount:0,category:'0원'},{occurred_at:'2026-08-11',amount:'bad',category:'오류'}];
const incomeAuto=D.automaticRecord(incomeTx,2026,8,z,flow);
assert.deepEqual(json(incomeAuto.income_sources),{미분류:5000100,상여금:200001,월세수입:3300500});
assert.equal(Object.values(incomeAuto.income_sources).reduce((a,b)=>a+b,0),incomeAuto.total_income);
assert.deepEqual(json(incomeAuto.categories),json(auto.categories));assert.deepEqual(json(incomeAuto.payment_methods),json(auto.payment_methods));
const partial=D.automaticRecord(tx,2026,8,{ok:false},flow);assert.equal(partial.total_income,5000000);assert.equal(partial.partial,true);
assert.deepEqual(json(partial.income_sources),{미분류:5000000});
assert.deepEqual(json(D.automaticRecord([],2026,8,{ok:false},flow).income_sources),{});
assert.equal(D.automaticRecord([],2026,8,{ok:false},flow).source,'unavailable');
const zero=D.automaticRecord([],2026,8,{ok:true,properties:z.properties.map(p=>({...p,paidAmount:0}))},flow);assert.equal(zero.source,'automatic');assert.equal(zero.net_cash_flow,0);
const sum=D.annualSummary([saved,auto]);assert.equal(sum.net_cash_flow,8334567);assert.equal(sum.total_savings,1500000);assert.equal(sum.savingsMonths,1);assert.equal(sum.categories.식비,2200000);
assert.deepEqual(json(sum.income_sources),{월급:7000000,월세수입:7300000,기타수입:1000000,미분류:5000000});
assert.equal(Object.values(sum.income_sources).reduce((a,b)=>a+b,0),sum.total_income);
function mockClient(stored,transactions,failTable){
 const calls=[];
 return {calls,from(table){const call={table,filters:[],from:0,to:999};calls.push(call);const q={select(){return q},eq(k,v){call.filters.push([k,v]);return q},gte(){return q},lt(){return q},order(){return q},range(a,b){call.from=a;call.to=b;return q},then(resolve,reject){let data=table==='monthly_settlements'?stored:transactions;for(const [k,v] of call.filters)data=data.filter(r=>r[k]===v);return Promise.resolve({data:data.slice(call.from,call.to+1),error:table===failTable?Error('denied'):null}).then(resolve,reject)}};return q}};
}
(async()=>{
 let rentCalls=0;const instrumented={...flow,loadZaritalk:async()=>{rentCalls++;return z}};
 const historyRows=[2024,2025,2026].flatMap(year=>Array.from({length:year===2026?7:12},(_,i)=>({...input,year,month:i+1})));
 const historyClient=mockClient(historyRows,[]),historyRepo=D.createRepository(historyClient,instrumented,()=>new Date(2026,8,6));
 for(const row of historyRows){const actual=await historyRepo.getMonth(row.year,row.month);assert.deepEqual(json(actual.income_sources),row.income_sources);assert.equal(actual.total_income,12000000)}
 for(const year of [2024,2025]){const yearly=D.annualSummary(await historyRepo.getYear(year));assert.equal(yearly.income_sources.월급,84000000);assert.equal(yearly.total_income,144000000)}
 assert.equal(rentCalls,0);assert.ok(historyClient.calls.every(c=>c.table==='monthly_settlements'));
 const client=mockClient([input],tx.map(r=>({...r,household_id:'family'})));
 const repo=D.createRepository(client,instrumented,()=>new Date(2026,8,6));
 assert.equal((await repo.getMonth(2026,7)).net_cash_flow,1234567);assert.equal(rentCalls,0);assert.equal(client.calls.filter(c=>c.table==='transactions').length,0);
 assert.equal((await repo.getMonth(2026,6)).source,'missing');assert.deepEqual(json((await repo.getMonth(2026,6)).income_sources),{});assert.equal(rentCalls,0);
 assert.equal((await repo.getMonth(2026,10)).source,'future');assert.deepEqual(json((await repo.getMonth(2026,10)).income_sources),{});assert.equal(rentCalls,0);
 assert.equal((await repo.getMonth(2026,8)).total_income,8300000);assert.equal(rentCalls,1);assert.ok(client.calls.some(c=>c.table==='transactions'&&c.filters.some(([k,v])=>k==='household_id'&&v==='family')));
 assert.equal((await repo.getMonth(2026,8)).net_cash_flow,7100000);assert.equal(rentCalls,1);
 const annual=await repo.getYear(2026);assert.equal(annual.length,12);assert.equal(rentCalls,2);
 const augustStored={...input,month:8};const savedRepo=D.createRepository(mockClient([augustStored],[]),instrumented,()=>new Date(2026,8,6));assert.equal((await savedRepo.getMonth(2026,8)).source,'stored');assert.equal(rentCalls,2);
 const many=Array.from({length:1001},(_,i)=>({id:i,occurred_at:'2026-08-06',amount:-1}));const paged=mockClient([],many);const pr=D.createRepository(paged,instrumented,()=>new Date(2026,8,6));assert.equal((await pr.getMonth(2026,8)).total_expense,1001);assert.equal(paged.calls.filter(c=>c.table==='transactions').length,2);
 const duplicates=D.createRepository(mockClient([input,input],[]),instrumented);await assert.rejects(()=>duplicates.getMonth(2026,7),/여러 건/);
 const denied=D.createRepository(mockClient([],[],'monthly_settlements'),instrumented);await assert.rejects(()=>denied.getMonth(2026,8),/denied/);
 const index=fs.readFileSync('index.html','utf8'),page=fs.readFileSync('settlement.js','utf8');
 assert.ok(index.includes('FinanceCore.createCashFlow('));assert.ok(page.includes('FinanceCore.createCashFlow('));
 for(const key of ['SUPABASE_URL','SUPABASE_KEY']){const pattern=new RegExp("const "+key+"\\s*=\\s*'([^']+)'");assert.equal(index.match(pattern)[1],page.match(pattern)[1])}
 for(const source of [index,page])for(const field of ['persistSession:true','autoRefreshToken:true','detectSessionInUrl:true','storage:window.localStorage',"storageKey:'family-finance-auth'"])assert.ok(source.includes(field));
 console.log('PASS: syntax, historical values unchanged, JSON formats, actual-only receipts, unclassified fields, annual totals, saved-month precedence, missing/future months, household filtering, pagination, errors, shared cash-flow module and identical auth settings.');
})().catch(e=>{console.error(e);process.exitCode=1});
