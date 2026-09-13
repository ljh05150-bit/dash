(function(global){
  'use strict';

  const RENT_ALIASES=new Set([
    '사업비',
    '임대사업비','임대/사업비',
    '임대중개수수료','임대/중개수수료',
    '임대전기수리비','임대/전기수리비',
    '임대방충망수리비','임대/방충망수리비',
    '임대도배비','임대/도배비',
    '임대바닥공사비','임대/바닥공사비',
    '투자관련/인테리어비'
  ]);

  const HOUSEHOLD_CARD_ALIASES=new Set([
    '토스뱅크 부부생활비',
    '부부생활비 카드',
    '토스뱅크 부부생활비 카드'
  ]);

  function canonical(value){
    const raw=String(value||'미분류').trim()||'미분류';
    const compact=raw.replace(/\s+/g,'');

    if(raw==='미분류'||raw==='내부이체')return raw;
    if(raw==='외식'||raw==='식비/마트'||raw==='식비/편의점')return '식비';
    if(raw==='육아'||raw==='육아/교육'||raw==='육아비'||raw.startsWith('육아비/'))return '육아비';
    if(RENT_ALIASES.has(raw)||RENT_ALIASES.has(compact))return '투자관련';

    const major=raw.split('/')[0]?.trim();
    return major||raw;
  }

  function canonicalPayment(value){
    const raw=String(value||'미분류').trim()||'미분류';
    if(HOUSEHOLD_CARD_ALIASES.has(raw))return '부부생활비 카드';
    return raw;
  }

  function mergeMap(source,keyFn){
    const result=Object.create(null);
    Object.entries(source||{}).forEach(([label,amount])=>{
      const n=Number(amount);
      if(!Number.isFinite(n))return;
      const key=keyFn(label);
      result[key]=(result[key]||0)+n;
    });
    return result;
  }

  function normalize(record){
    if(!record||typeof record!=='object')return record;
    return {
      ...record,
      categories:mergeMap(record.categories,canonical),
      payment_methods:mergeMap(record.payment_methods,canonicalPayment)
    };
  }

  if(global.SettlementData?.createRepository){
    const previous=global.SettlementData.createRepository;
    global.SettlementData.canonicalCategory=canonical;
    global.SettlementData.canonicalPayment=canonicalPayment;
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
