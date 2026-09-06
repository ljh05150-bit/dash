/* Read-only settlement data. Stored months always take precedence. */
(function(global){
  const number=value=>value===null||value===undefined||value===''?null:
    (typeof value==='number'||typeof value==='string')&&Number.isFinite(Number(value))?Number(value):null;
  const monthKey=(year,month)=>`${year}-${String(month).padStart(2,'0')}`;
  const fields=['total_income','total_expense','total_savings','net_cash_flow','fixed_expense','variable_expense','savings_rate'];

  function breakdown(value){
    const result=Object.create(null);
    const add=(label,raw)=>{const n=number(raw);if(n!==null&&n>=0)result[String(label)]=(result[String(label)]||0)+n};
    if(Array.isArray(value)){
      value.forEach(item=>{
        if(!item||typeof item!=='object')return;
        const label=item.name??item.category??item.payment_method??item.method??item.label;
        if(label!=null)add(label,item.amount??item.value??item.total??item.total_expense);
      });
    }else if(value&&typeof value==='object'){
      Object.entries(value).forEach(([label,v])=>add(label,v&&typeof v==='object'?v.amount??v.value??v.total:v));
    }
    return result;
  }
  function storedRecord(row){
    const record={year:Number(row.year),month:Number(row.month),source:'stored',partial:false,
      categories:breakdown(row.categories),payment_methods:breakdown(row.payment_methods),unclassified_expense:null};
    fields.forEach(key=>record[key]=number(row[key]));
    return record;
  }
  function emptyRecord(year,month,source='missing'){
    return {year,month,source,partial:source==='unavailable',categories:{},payment_methods:{},unclassified_expense:null,
      ...Object.fromEntries(fields.map(key=>[key,null]))};
  }
  function automaticRecord(tx,year,month,z,flow){
    const rent=flow.normalizeRent(z);
    const partial=rent.some(row=>!row.live);
    if(!tx.length&&!rent.some(row=>row.live))return {...emptyRecord(year,month,'unavailable'),rent};
    const cash=flow.monthlyCashFlow(tx,monthKey(year,month),z);
    const categories=Object.create(null),payments=Object.create(null);
    tx.forEach(row=>{
      const d=new Date(row.occurred_at),n=number(row.amount);
      if(d.getFullYear()!==year||d.getMonth()+1!==month||n===null||n>=0)return;
      const category=String(row.category||'미분류'),payment=String(row.account||row.source||'미분류');
      categories[category]=(categories[category]||0)+Math.abs(n);
      payments[payment]=(payments[payment]||0)+Math.abs(n);
    });
    return {year,month,source:'automatic',partial,rent,total_income:cash.income,total_expense:cash.expense,
      net_cash_flow:cash.net,total_savings:null,savings_rate:null,fixed_expense:null,variable_expense:null,
      unclassified_expense:cash.expense,categories,payment_methods:payments};
  }
  function annualSummary(records){
    const available=records.filter(r=>r.source==='stored'||r.source==='automatic');
    const sum=key=>{const known=available.map(r=>r[key]).filter(n=>n!==null);return known.length?known.reduce((a,b)=>a+b,0):null};
    const combine=key=>{
      const result=Object.create(null);
      available.forEach(r=>Object.entries(r[key]).forEach(([label,n])=>result[label]=(result[label]||0)+n));
      return result;
    };
    return {total_income:sum('total_income'),total_expense:sum('total_expense'),net_cash_flow:sum('net_cash_flow'),
      total_savings:sum('total_savings'),categories:combine('categories'),count:available.length,
      savingsMonths:available.filter(r=>r.total_savings!==null).length,
      stored:available.filter(r=>r.source==='stored').length,automatic:available.filter(r=>r.source==='automatic').length,
      partial:records.some(r=>r.partial),missing:records.filter(r=>r.source==='missing').length};
  }

  function createRepository(client,flow,now=()=>new Date()){
    const years=new Map(),months=new Map();
    async function storedYear(year){
      if(!years.has(year)){
        const pending=(async()=>{
          const {data,error}=await client.from('monthly_settlements')
            .select('year,month,total_income,total_expense,total_savings,savings_rate,net_cash_flow,fixed_expense,variable_expense,categories,payment_methods,household_id')
            .eq('year',year).order('month',{ascending:true});
          if(error)throw error;
          const byMonth=new Map(),households=new Set();
          for(const row of data||[]){
            const month=Number(row.month);
            if(!Number.isInteger(month)||month<1||month>12)continue;
            if(byMonth.has(month))throw new Error('동일한 달의 결산이 여러 건입니다. 가구별 결산 데이터를 확인해 주세요.');
            byMonth.set(month,storedRecord(row));
            if(row.household_id)households.add(row.household_id);
          }
          if(households.size>1)throw new Error('여러 가구의 결산이 조회되어 합산을 중단했습니다. 가구 설정을 확인해 주세요.');
          return {byMonth,householdId:[...households][0]};
        })();
        years.set(year,pending);
        pending.catch(()=>{if(years.get(year)===pending)years.delete(year)});
      }
      return years.get(year);
    }
    async function transactions(year,month,householdId){
      const start=new Date(year,month-1,1).toISOString(),end=new Date(year,month,1).toISOString();
      const result=[];
      // Stable ordering and pagination avoid the API's default 1,000-row truncation.
      for(let offset=0;;offset+=1000){
        let query=client.from('transactions').select('id,occurred_at,source,account,category,amount,household_id')
          .gte('occurred_at',start).lt('occurred_at',end).order('occurred_at',{ascending:true}).order('id',{ascending:true})
          .range(offset,offset+999);
        if(householdId)query=query.eq('household_id',householdId);
        const {data,error}=await query;
        if(error)throw error;
        result.push(...(data||[]));
        if(!data||data.length<1000)break;
      }
      return result;
    }
    async function getMonth(year,month){
      const key=monthKey(year,month);
      if(!months.has(key)){
        const pending=(async()=>{
          const {byMonth,householdId}=await storedYear(year);
          if(byMonth.has(month))return byMonth.get(month);
          const today=now(),current=monthKey(today.getFullYear(),today.getMonth()+1);
          if(key>current)return emptyRecord(year,month,'future');
          // Historical imports are never reconstructed from transactions or rent.
          if(key<'2026-08')return emptyRecord(year,month);
          const [tx,z]=await Promise.all([transactions(year,month,householdId),flow.loadZaritalk(key)]);
          return automaticRecord(tx,year,month,z,flow);
        })();
        months.set(key,pending);
        pending.catch(()=>{if(months.get(key)===pending)months.delete(key)});
      }
      return months.get(key);
    }
    async function getYear(year){
      await storedYear(year);
      const result=[];
      // Bound concurrent Edge Function calls when browsing a full year.
      for(let start=1;start<=12;start+=3){
        result.push(...await Promise.all([start,start+1,start+2].map(m=>getMonth(year,m))));
      }
      return result;
    }
    return {getMonth,getYear};
  }
  global.SettlementData={number,monthKey,breakdown,storedRecord,automaticRecord,annualSummary,createRepository};
})(window);
