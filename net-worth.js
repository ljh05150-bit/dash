/* Loader wrapper: preserve the original net-worth dashboard patches, then apply per-security KRW cost basis support. */
document.write('<script src="./net-worth-base.js?v=20260916-0605"><\/script>');

(function(global){
  function installSecurityCostBasisPatch(){
    if(typeof global.enrichStocks!=='function'){
      setTimeout(installSecurityCostBasisPatch,25);
      return;
    }
    if(global.enrichStocks.__krwCostBasisPatched)return;

    const original=global.enrichStocks;
    const wrapped=function(rows){
      return original(rows).map(row=>{
        const cost=Number(row?.cost_basis_krw||0);
        const market=Number(row?._liveMarketValue);
        if(!(cost>0)||!Number.isFinite(market))return row;
        const pnl=market-cost;
        return {...row,_livePnl:pnl,_livePnlPct:pnl/cost*100};
      });
    };
    wrapped.__krwCostBasisPatched=true;
    global.enrichStocks=wrapped;

    const dash=document.getElementById('dash');
    if(typeof global.load==='function'&&dash&&getComputedStyle(dash).display!=='none')global.load();
  }
  setTimeout(installSecurityCostBasisPatch,0);
})(window);
