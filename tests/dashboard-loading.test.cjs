const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
for(const page of ['index.html','settlement.html']){
 const html=fs.readFileSync(page,'utf8');
 assert.ok(!/<script[^>]+src=["'][^"']*\/net-worth\.js/.test(html),page+' must load base directly');
 assert.match(html,/<script[^>]+src="\.\/net-worth-base\.js\?v=/);
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  const src=/src="([^"?]+)/.exec(match[1]);
  if(src&&!src[1].startsWith('http'))new vm.Script(fs.readFileSync(src[1],'utf8'),{filename:src[1]});
  else if(!src)new vm.Script(match[2],{filename:page});
 }
}
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function enrichStocks('),html.indexOf('function renderStocks('));
const context={liveHistory:{TQQQ:{lastPrice:53.17},__USDKRW:{lastPrice:1361.64}}};
vm.createContext(context);vm.runInContext(source,context);
const row={ticker:'TQQQ',quantity:2209,avg_price:38.8046819828};
const estimate=context.enrichStocks([row])[0];
assert.equal(estimate._pnlBasis,'usd-estimate');
assert.ok(Math.abs(estimate._livePnlPct-(53.17/row.avg_price-1)*100)<1e-10);
const actual=context.enrichStocks([{...row,cost_basis_krw:120000000}])[0];
assert.equal(actual._pnlBasis,'krw');assert.equal(actual._livePnl,actual._liveMarketValue-120000000);
assert.equal(actual._livePnlPct,actual._livePnl/120000000*100);
assert.match(html,/editMarketValue[^>]+readonly/);assert.match(html,/editPnlPct[^>]+readonly/);
console.log('PASS: direct script loading, HTML inline and external JavaScript syntax, USD estimate and KRW cost valuation, read-only calculated fields');
