(function(){
'use strict';
var URL='https://ixuxaqerdftadfnkxxui.supabase.co';
var KEY='sb_publishable_2Q42l50u-YjgBmu5xDvoAA_LUtLhm8j';
var sb=supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:localStorage,storageKey:'family-finance-auth'}});
var cache=new Map();
var active=null;
var sortMode='amount';
var timer=null;

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function won(n){return Math.round(Math.abs(Number(n)||0)).toLocaleString('ko-KR')+'원'}
function parseWon(text){var n=Number(String(text||'').replace(/[^0-9-]/g,''));return Number.isFinite(n)?n:0}
function period(){return {year:Number(document.getElementById('yearSelect')&&document.getElementById('yearSelect').value),month:Number(document.getElementById('monthSelect')&&document.getElementById('monthSelect').value)}}
function bounds(y,m){return {start:new Date(y,m-1,1).toISOString(),end:new Date(y,m,1).toISOString()}}
async function txs(y,m){
  var k=y+'-'+m;
  if(cache.has(k))return cache.get(k);
  var p=(async function(){
    var b=bounds(y,m),all=[];
    for(var off=0;;off+=1000){
      var q=await sb.from('transactions')
        .select('id,occurred_at,source,account,merchant,category,amount,memo')
        .gte('occurred_at',b.start).lt('occurred_at',b.end)
        .order('occurred_at',{ascending:false}).range(off,off+999);
      if(q.error)throw q.error;
      all.push.apply(all,q.data||[]);
      if(!q.data||q.data.length<1000)break;
    }
    return all;
  })();
  cache.set(k,p);
  try{return await p}catch(e){cache.delete(k);throw e}
}
function isIncome(row,label){
  var amount=Number(row.amount);
  if(!Number.isFinite(amount)||amount<=0)return false;
  if(String(row.source||'')==='toss_statement_refund')return false;
  if(String(row.category||'미분류').trim()==='내부이체')return false;
  return (String(row.category||'미분류').trim()||'미분류')===label;
}
function injectStyle(){
  if(document.getElementById('incomeDetailStyles'))return;
  var s=document.createElement('style');
  s.id='incomeDetailStyles';
  s.textContent=
    '.breakdown-row[data-income-detail]{position:relative;cursor:pointer;padding-right:30px!important;border-radius:13px;touch-action:manipulation}'+
    '.breakdown-row[data-income-detail]::after{content:"›";position:absolute;right:9px;top:8px;color:#6f94ba;font-size:22px}'+
    '.income-detail-back[hidden]{display:none!important}.income-detail-back{position:fixed;inset:0;z-index:11300;background:rgba(1,6,12,.82);backdrop-filter:blur(7px);display:flex;align-items:flex-end;justify-content:center}'+
    '.income-detail-sheet{width:min(620px,100%);max-height:86vh;overflow:auto;background:linear-gradient(180deg,#0d1e31,#081421);border:1px solid #234c70;border-bottom:0;border-radius:28px 28px 0 0;padding:10px 18px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -16px 50px rgba(0,0,0,.5)}'+
    '.income-detail-handle{width:42px;height:5px;border-radius:999px;background:#40536a;margin:2px auto 15px}.income-detail-head{display:flex;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--line2)}'+
    '.income-detail-title{font-size:20px;font-weight:850}.income-detail-sub{font-size:11px;color:var(--muted);margin-top:5px}.income-detail-close{width:38px;height:38px;border:1px solid #294c6d;background:#102137;color:white;border-radius:13px;font-size:21px}'+
    '.income-detail-sort{display:flex;gap:7px;padding:12px 0 8px}.income-detail-sort button{border:1px solid #284b6c;background:#0a1929;color:#8fa6bf;border-radius:999px;padding:7px 11px;font-size:11px;font-weight:760}.income-detail-sort button[aria-pressed=true]{background:#16446d;border-color:#4b9dff;color:white}'+
    '.income-detail-row{display:grid;grid-template-columns:1fr auto;gap:12px;padding:13px 2px;border-top:1px solid var(--line2)}.income-detail-merchant{font-size:14px;font-weight:780}.income-detail-meta{font-size:11px;color:var(--muted);margin-top:4px;line-height:1.45}.income-detail-amt{font-size:14px;font-weight:850;color:#63b1ff;white-space:nowrap}.income-detail-empty{font-size:12px;color:var(--muted);padding:26px 0;text-align:center}';
  document.head.appendChild(s);
}
function ensureSheet(){
  var root=document.getElementById('incomeDetailBackdrop');
  if(root)return root;
  root=document.createElement('div');
  root.id='incomeDetailBackdrop';
  root.className='income-detail-back';
  root.hidden=true;
  root.innerHTML='<section class="income-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="incomeDetailTitle">'+
    '<div class="income-detail-handle"></div>'+
    '<div class="income-detail-head"><div><div class="income-detail-title" id="incomeDetailTitle">수입내역</div><div class="income-detail-sub" id="incomeDetailSub"></div></div><button class="income-detail-close" type="button" aria-label="닫기">×</button></div>'+
    '<div id="incomeDetailBody"></div></section>';
  document.body.appendChild(root);
  root.addEventListener('click',function(e){
    if(e.target===root||e.target.closest('.income-detail-close')){root.hidden=true;return}
    var b=e.target.closest('[data-income-sort]');
    if(b){sortMode=b.dataset.incomeSort;render();return}
  });
  return root;
}
function sorted(rows){
  var a=rows.slice();
  if(sortMode==='latest'){
    a.sort(function(x,y){
      if(x.synthetic&&!y.synthetic)return 1;
      if(y.synthetic&&!x.synthetic)return -1;
      return new Date(y.occurred_at)-new Date(x.occurred_at);
    });
  }else{
    a.sort(function(x,y){return Math.abs(Number(y.amount)||0)-Math.abs(Number(x.amount)||0)});
  }
  return a;
}
function render(){
  if(!active)return;
  var root=ensureSheet(),rows=sorted(active.rows);
  root.querySelector('#incomeDetailTitle').textContent=active.label+' 수입내역';
  root.querySelector('#incomeDetailSub').textContent=active.year+'년 '+active.month+'월 · 합계 '+won(active.total);
  var html='<div class="income-detail-sort"><button type="button" data-income-sort="amount" aria-pressed="'+(sortMode==='amount')+'">금액 큰순</button><button type="button" data-income-sort="latest" aria-pressed="'+(sortMode==='latest')+'">최신순</button></div>';
  if(!rows.length){
    html+='<div class="income-detail-empty">표시할 수입내역이 없습니다.</div>';
  }else{
    rows.forEach(function(r){
      var meta;
      if(r.synthetic){
        meta=active.year+'년 '+active.month+'월 집계 · '+(r.account||'월별 결산')+' · 거래내역에 없는 결산 반영분';
      }else{
        var d=new Date(r.occurred_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
        meta=d+' · '+(r.account||r.source||'')+(r.memo?' · '+r.memo:'');
      }
      html+='<div class="income-detail-row"><div><div class="income-detail-merchant">'+esc(r.merchant||active.label||'수입')+'</div><div class="income-detail-meta">'+esc(meta)+'</div></div><div class="income-detail-amt">+'+won(r.amount)+'</div></div>';
    });
  }
  root.querySelector('#incomeDetailBody').innerHTML=html;
  root.hidden=false;
}
async function openIncome(label,total){
  var p=period(),root=ensureSheet();
  sortMode='amount';
  root.querySelector('#incomeDetailTitle').textContent=label+' 수입내역';
  root.querySelector('#incomeDetailSub').textContent='불러오는 중';
  root.querySelector('#incomeDetailBody').innerHTML='<div class="income-detail-empty">수입내역을 불러오고 있습니다.</div>';
  root.hidden=false;
  try{
    var all=await txs(p.year,p.month);
    var rows=all.filter(function(r){return isIncome(r,label)});
    var txTotal=rows.reduce(function(sum,r){return sum+Number(r.amount||0)},0);
    var remainder=Math.max(0,Number(total||0)-txTotal);
    if(remainder>0){
      rows.push({
        synthetic:true,
        occurred_at:new Date(p.year,p.month-1,1).toISOString(),
        merchant:label==='월세수입'?'자리톡/결산 반영분':'결산 집계 반영분',
        account:label==='월세수입'?'자리톡':'월별 결산',
        amount:remainder
      });
    }
    active={label:label,total:Number(total||0),year:p.year,month:p.month,rows:rows};
    render();
  }catch(e){
    root.querySelector('#incomeDetailSub').textContent='불러오기 실패';
    root.querySelector('#incomeDetailBody').innerHTML='<div class="income-detail-empty">수입내역을 불러오지 못했습니다. 다시 시도해 주세요.</div>';
  }
}
function enhance(){
  if(document.getElementById('monthlyTab')&&document.getElementById('monthlyTab').getAttribute('aria-selected')!=='true')return;
  var titles=document.querySelectorAll('#report h2.section-title');
  titles.forEach(function(title){
    if(title.textContent.trim()!=='수입원별 수입')return;
    var card=title.nextElementSibling;
    if(!card||!card.classList.contains('card'))return;
    card.querySelectorAll('.breakdown-row').forEach(function(row){
      var label=row.querySelector('.breakdown-head span');
      var amount=row.querySelector('.breakdown-head strong');
      if(!label||!amount)return;
      row.dataset.incomeDetail=label.textContent.trim();
      row.dataset.incomeTotal=String(parseWon(amount.textContent));
      row.tabIndex=0;
      row.setAttribute('role','button');
      row.setAttribute('aria-label',label.textContent.trim()+' 수입내역 보기');
    });
  });
}
function setup(){
  injectStyle();
  ensureSheet();
  var report=document.getElementById('report');
  if(!report)return;
  report.addEventListener('click',function(e){
    var row=e.target.closest('[data-income-detail]');
    if(row)openIncome(row.dataset.incomeDetail,Number(row.dataset.incomeTotal||0));
  });
  report.addEventListener('keydown',function(e){
    if(e.key!=='Enter'&&e.key!==' ')return;
    var row=e.target.closest('[data-income-detail]');
    if(!row)return;
    e.preventDefault();
    openIncome(row.dataset.incomeDetail,Number(row.dataset.incomeTotal||0));
  });
  new MutationObserver(function(){
    clearTimeout(timer);
    timer=setTimeout(enhance,30);
  }).observe(report,{childList:true,subtree:true});
  document.getElementById('refresh')&&document.getElementById('refresh').addEventListener('click',function(){cache.clear()});
  ['yearSelect','monthSelect'].forEach(function(id){
    var node=document.getElementById(id);
    if(node)node.addEventListener('change',function(){cache.clear()});
  });
  enhance();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();