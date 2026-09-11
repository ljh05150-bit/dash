(function(global){
  'use strict';

  const RENT='투자관련/다가구운영비';
  const RENT_ALIASES=new Set([
    '사업비',
    '임대사업비','임대/사업비',
    '임대중개수수료','임대/중개수수료',
    '임대전기수리비','임대/전기수리비',
    '임대방충망수리비','임대/방충망수리비',
    '임대도배비','임대/도배비',
    '임대바닥공사비','임대/바닥공사비',
    '투자관련/인테리어비',
    RENT
  ]);

  function canonical(value){
    const raw=String(value||'미분류').trim()||'미분류';
    const compact=raw.replace(/\s+/g,'');
    if(raw==='외식')return '식비/외식';
    if(RENT_ALIASES.has(raw)||RENT_ALIASES.has(compact))return RENT;
    return raw;
  }

  function normalize(record){
    if(!record||typeof record!=='object')return record;
    const categories=Object.create(null);
    Object.entries(record.categories||{}).forEach(([label,amount])=>{
      const n=Number(amount);
      if(!Number.isFinite(n))return;
      const key=canonical(label);
      categories[key]=(categories[key]||0)+n;
    });
    return {...record,categories};
  }

  if(global.SettlementData?.createRepository){
    const previous=global.SettlementData.createRepository;
    global.SettlementData.canonicalCategory=canonical;
    global.SettlementData.createRepository=function(client,flow,now){
      const repo=previous(client,flow,now);
      return {
        ...repo,
        async getMonth(...args){return normalize(await repo.getMonth(...args));},
        async getYear(...args){return (await repo.getYear(...args)).map(normalize);}
      };
    };
  }
})(window);
