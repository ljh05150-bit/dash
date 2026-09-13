(function(){
  'use strict';

  const SUPABASE_URL='https://ixuxaqerdftadfnkxxui.supabase.co';
  const SUPABASE_KEY='sb_publishable_2Q42l50u-YjgBmu5xDvoAA_LUtLhm8j';
  const client=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:'family-finance-auth'}
  });

  const TAXONOMY=[
    ['수입',['현금','상여금','부수입','월세수입','투자수익','보증금','기타수입']],
    ['저축',['적금','예금','근로소득저축','대출상환','자본소득저축']],
    ['고정지출',['주거비','보험료','통신비','교통비','주거비기타','대출원리금']],
    ['식비',[{label:'식비',value:'식비'},{label:'외식',value:'식비/외식'}]],
    ['구독',[{label:'서비스',value:'구독/서비스'}]],
    ['용돈',['부모님','가족']],
    ['생활용품',['생필품/소모품','수리비','주방/욕실']],
    ['의복/미용',['의류','뷰티','헤어']],
    ['육아비',[{label:'육아비',value:'육아비'}]],
    ['건강',['병원/약국','영양제']],
    ['자기계발',['강의','책','응시료','공연']],
    ['경조사',['가족','지인']],
    ['투자관련',['부동산구매','다가구운영비','기타비용','세금','보증금반환']],
    ['차량',['주유비','수리비','범칙금','기타']],
    ['공연/예술',['주최외부미팅','술외부미팅']],
    ['선물',['가족','지인']],
    ['취미',['여행','운동 등','공연/영화','기타']],
    ['외부식비',['주최외부미팅','술외부미팅']]
  ];

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const itemSpec=(group,item)=>item&&typeof item==='object'?item:{label:String(item),value:`${group}/${item}`};
  const won=n=>Math.round(Math.abs(Number(n)||0)).toLocaleString('ko-KR')+'원';

  function displayCategory(value){
    const raw=String(value||'미분류').trim()||'미분류';
    if(raw==='육아비')return '육아비';
    for(const [group,items] of TAXONOMY){
      for(const item of items){
        const spec=itemSpec(group,item);
        if(spec.value===raw)return spec.label;
      }
    }
    return raw;
  }

  function injectStyle(){
    if(document.getElementById('safeEditorV2Styles'))return;
    const s=document.createElement('style');
    s.id='safeEditorV2Styles';
    s.textContent=`
      .safe-v2-back[hidden],.safe-cat-back[hidden]{display:none!important}
      .safe-v2-back{position:fixed;inset:0;z-index:11150;background:rgba(1,6,12,.84);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;padding-top:36px}
      .safe-v2-sheet{width:min(620px,100%);max-height:91vh;overflow:auto;background:linear-gradient(180deg,#0d1e31,#081421);border:1px solid #2b5c85;border-bottom:0;border-radius:28px 28px 0 0;padding:10px 18px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -16px 50px rgba(0,0,0,.52)}
      .safe-v2-handle,.safe-cat-handle{width:42px;height:5px;border-radius:999px;background:#40536a;margin:2px auto 15px}
      .safe-v2-head,.safe-cat-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid var(--line2)}
      .safe-v2-title,.safe-cat-title{font-size:20px;font-weight:850;line-height:1.3}.safe-v2-sub{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.5}.safe-v2-amount{font-size:18px;font-weight:850;margin-top:5px;color:#8abfff}
      .safe-v2-close,.safe-cat-close{width:38px;height:38px;border:1px solid #294c6d;background:#102137;color:#dbe8f5;border-radius:13px;font-size:21px;flex:0 0 auto}
      .safe-v2-field{margin-top:14px}.safe-v2-field>label{display:block;font-size:11px;color:var(--muted);margin-bottom:6px}
      .safe-v2-field input[type="text"]{width:100%;border:1px solid #2a4d6d;background:#081525;color:var(--text);border-radius:13px;padding:12px;font-size:13px;outline:none}
      .safe-v2-field input[type="text"]:focus{border-color:#4b9dff;box-shadow:0 0 0 2px rgba(75,157,255,.13)}
      .safe-v2-category-button{width:100%;min-height:46px;border:1px solid #4b83b1;background:#081525;color:var(--text);border-radius:13px;padding:11px 42px 11px 12px;font-size:13px;font-weight:760;text-align:left;position:relative}
      .safe-v2-category-button::after{content:'›';position:absolute;right:14px;top:50%;transform:translateY(-50%) rotate(90deg);color:#8fb3d2;font-size:20px}
      .safe-v2-category-button:active{background:#10253b}
      .safe-v2-choice{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:15px;padding:14px 15px;border:1px solid #294c6d;border-radius:16px;background:#091829}
      .safe-v2-choice label{display:flex;align-items:center;gap:11px;font-size:15px;font-weight:820;cursor:pointer}
      .safe-v2-choice input{appearance:none;-webkit-appearance:none;width:26px;height:26px;border:2px solid #64819e;border-radius:5px;background:#06111e;display:grid;place-content:center;flex:0 0 auto}
      .safe-v2-choice input::before{content:'✓';font-size:18px;line-height:1;color:#fff;transform:scale(0);transition:transform .1s}
      .safe-v2-choice input:checked{background:#347fbd;border-color:#65b1ee}.safe-v2-choice input:checked::before{transform:scale(1)}
      .safe-v2-choice-note{font-size:10px;color:var(--muted);text-align:right;line-height:1.45}
      .safe-v2-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}.safe-v2-actions button{border:1px solid #315d83;background:#10253b;color:#eaf4ff;border-radius:13px;padding:12px;font-size:13px;font-weight:800}.safe-v2-actions .primary{background:#16446d;border-color:#3979aa}
      .safe-v2-status{min-height:18px;font-size:11px;color:var(--green);margin-top:7px;text-align:right}
      body.safe-v2-open{overflow:hidden}

      .safe-cat-back{position:fixed;inset:0;z-index:11250;background:rgba(1,6,12,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;padding-top:48px}
      .safe-cat-sheet{width:min(620px,100%);max-height:82vh;overflow:auto;background:linear-gradient(180deg,#102238,#081421);border:1px solid #315d83;border-bottom:0;border-radius:28px 28px 0 0;padding:10px 16px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -16px 50px rgba(0,0,0,.52)}
      .safe-cat-sub{font-size:11px;color:var(--muted);margin-top:4px}.safe-cat-group{padding:14px 0 4px;border-bottom:1px solid var(--line2)}.safe-cat-group:last-child{border-bottom:0}.safe-cat-group-title{font-size:11px;color:#86a3bf;font-weight:780;margin:0 2px 9px}
      .safe-cat-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.safe-cat-option{position:relative;border:1px solid #294c6d;background:#0a1929;color:#dce8f4;border-radius:12px;padding:10px 30px 10px 11px;font-size:12px;font-weight:720;text-align:left;min-height:42px}.safe-cat-option.selected{background:#16446d;border-color:#5aa8e7;color:white}.safe-cat-option.selected::after{content:'✓';position:absolute;right:11px;top:50%;transform:translateY(-50%);font-weight:900}.safe-cat-option:active{transform:scale(.99)}
      .safe-cat-manage{margin-top:12px}.safe-cat-manage .safe-cat-option{width:100%}
      @media(max-width:390px){.safe-cat-options{grid-template-columns:1fr 1fr}.safe-cat-option{font-size:11px;padding-left:9px}}
    `;
    document.head.appendChild(s);
  }

  function ensurePicker(){
    let root=document.getElementById('safeCategoryPicker');
    if(root)return root;
    root=document.createElement('div');
    root.id='safeCategoryPicker';
    root.className='safe-cat-back';
    root.hidden=true;
    root.innerHTML=`<section class="safe-cat-sheet" role="dialog" aria-modal="true" aria-labelledby="safeCatTitle">
      <div class="safe-cat-handle"></div>
      <div class="safe-cat-head"><div><div class="safe-cat-title" id="safeCatTitle">구분 선택</div><div class="safe-cat-sub">항목을 누르면 바로 선택됩니다.</div></div><button class="safe-cat-close" type="button" aria-label="닫기">×</button></div>
      <div id="safeCatBody"></div>
    </section>`;
    document.body.appendChild(root);
    root.addEventListener('click',event=>{
      if(event.target===root||event.target.closest('.safe-cat-close')){closePicker();return;}
      const option=event.target.closest('[data-cat-value]');
      if(option){
        const editor=ensureModal();
        const value=option.dataset.catValue||'미분류';
        const button=editor.querySelector('#safeV2Category');
        button.dataset.value=value;
        button.textContent=displayCategory(value);
        closePicker();
      }
    });
    return root;
  }

  function renderPicker(current){
    const root=ensurePicker();
    let html='';
    for(const [group,items] of TAXONOMY){
      html+=`<section class="safe-cat-group"><div class="safe-cat-group-title">${esc(group)}</div><div class="safe-cat-options">`;
      for(const item of items){
        const spec=itemSpec(group,item);
        html+=`<button type="button" class="safe-cat-option${spec.value===current?' selected':''}" data-cat-value="${esc(spec.value)}">${esc(spec.label)}</button>`;
      }
      html+='</div></section>';
    }
    html+=`<div class="safe-cat-manage"><button type="button" class="safe-cat-option${current==='미분류'?' selected':''}" data-cat-value="미분류">미분류</button></div>`;
    root.querySelector('#safeCatBody').innerHTML=html;
    root.hidden=false;
  }

  function closePicker(){const root=document.getElementById('safeCategoryPicker');if(root)root.hidden=true;}

  function ensureModal(){
    let root=document.getElementById('safeTransactionEditorV2');
    if(root)return root;
    root=document.createElement('div');
    root.id='safeTransactionEditorV2';
    root.className='safe-v2-back';
    root.hidden=true;
    root.innerHTML=`<section class="safe-v2-sheet" role="dialog" aria-modal="true" aria-labelledby="safeV2Title">
      <div class="safe-v2-handle"></div>
      <div class="safe-v2-head"><div><div class="safe-v2-title" id="safeV2Title">거래 수정</div><div class="safe-v2-sub" id="safeV2Sub"></div><div class="safe-v2-amount" id="safeV2Amount"></div></div><button class="safe-v2-close" type="button" aria-label="닫기">×</button></div>
      <div class="safe-v2-field"><label for="safeV2Category">구분</label><button id="safeV2Category" class="safe-v2-category-button" type="button" data-value="미분류">미분류</button></div>
      <div class="safe-v2-field"><label for="safeV2Memo">메모</label><input id="safeV2Memo" type="text" maxlength="120" placeholder="무엇에 쓴 돈인지 적어두세요"></div>
      <div class="safe-v2-choice"><label for="safeV2Fixed"><input type="checkbox" id="safeV2Fixed"><span>고정지출</span></label><div class="safe-v2-choice-note">체크하면 월별 결산의<br>고정지출에 포함됩니다.</div></div>
      <div class="safe-v2-actions"><button type="button" data-v2-cancel>취소</button><button class="primary" type="button" data-v2-save>저장</button></div>
      <div class="safe-v2-status" id="safeV2Status" aria-live="polite"></div>
    </section>`;
    document.body.appendChild(root);
    root.addEventListener('click',event=>{
      if(event.target===root||event.target.closest('.safe-v2-close')||event.target.closest('[data-v2-cancel]')){closeModal();return;}
      if(event.target.closest('#safeV2Category')){renderPicker(root.querySelector('#safeV2Category').dataset.value||'미분류');return;}
      if(event.target.closest('[data-v2-save]'))saveCurrent();
    });
    return root;
  }

  function closeModal(){
    closePicker();
    const root=document.getElementById('safeTransactionEditorV2');
    if(root)root.hidden=true;
    document.body.classList.remove('safe-v2-open');
  }

  async function openById(id){
    const root=ensureModal();
    root.hidden=false;
    document.body.classList.add('safe-v2-open');
    root.dataset.id=String(id);
    root.dataset.originalCategory='';
    root.querySelector('#safeV2Title').textContent='거래 불러오는 중';
    root.querySelector('#safeV2Sub').textContent='';
    root.querySelector('#safeV2Amount').textContent='';
    root.querySelector('#safeV2Status').textContent='';
    root.querySelector('[data-v2-save]').disabled=true;
    try{
      const {data,error}=await client.from('transactions')
        .select('id,occurred_at,source,account,merchant,category,amount,memo,is_fixed_expense')
        .eq('id',id).single();
      if(error)throw error;
      const category=data.category||'미분류';
      root.dataset.originalCategory=category;
      root.querySelector('#safeV2Title').textContent=data.merchant||category||'거래';
      root.querySelector('#safeV2Sub').textContent=`${new Date(data.occurred_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${data.account||data.source||''}`;
      root.querySelector('#safeV2Amount').textContent=`${Number(data.amount)>=0?'+':'−'}${won(data.amount)}`;
      const categoryButton=root.querySelector('#safeV2Category');
      categoryButton.dataset.value=category;
      categoryButton.textContent=displayCategory(category);
      root.querySelector('#safeV2Memo').value=data.memo||'';
      root.querySelector('#safeV2Fixed').checked=data.is_fixed_expense===true;
      root.querySelector('[data-v2-save]').disabled=false;
    }catch(error){
      root.querySelector('#safeV2Title').textContent='거래를 불러오지 못했습니다';
      root.querySelector('#safeV2Status').textContent=error?.message||'다시 시도해 주세요.';
    }
  }

  async function saveCurrent(){
    const root=ensureModal();
    const id=root.dataset.id;
    if(!id)return;
    const originalCategory=root.dataset.originalCategory||'미분류';
    const category=root.querySelector('#safeV2Category').dataset.value||'미분류';
    const memo=root.querySelector('#safeV2Memo').value.trim();
    const is_fixed_expense=root.querySelector('#safeV2Fixed').checked===true;
    const status=root.querySelector('#safeV2Status');
    const button=root.querySelector('[data-v2-save]');
    button.disabled=true;
    status.textContent='저장 중…';
    const {error}=await client.from('transactions').update({category,memo:memo||null,is_fixed_expense}).eq('id',id);
    if(error){status.textContent='저장 실패 · '+(error.message||'다시 시도해 주세요.');button.disabled=false;return;}
    status.textContent='저장됨';

    const visible=document.querySelector(`#safeCategoryDetail .safe-row[data-tx="${CSS.escape(String(id))}"]`);
    if(visible){
      const meta=visible.querySelector('.safe-meta');
      if(meta){
        const base=meta.textContent.replace(/\s*·\s*고정지출\s*$/,'');
        meta.innerHTML=esc(base)+(is_fixed_expense?'<span class="safe-fixed"> · 고정지출</span>':'');
      }
    }

    setTimeout(()=>{
      closeModal();
      document.getElementById('safeFixedEdit')?.setAttribute('hidden','');
      if(category!==originalCategory){
        document.getElementById('safeCategoryDetail')?.setAttribute('hidden','');
        const u=new URL(location.href);u.searchParams.set('refresh',Date.now());location.replace(u.toString());
      }else{
        document.getElementById('refresh')?.click();
      }
    },160);
  }

  function intercept(event){
    const row=event.target.closest?.('#safeCategoryDetail .safe-row[data-tx]');
    if(!row)return;
    if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openById(row.dataset.tx);
  }

  function setup(){
    injectStyle();
    ensureModal();
    ensurePicker();
    document.addEventListener('click',intercept,true);
    document.addEventListener('keydown',intercept,true);
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape')return;
      const picker=document.getElementById('safeCategoryPicker');
      if(picker&&!picker.hidden){closePicker();return;}
      const modal=document.getElementById('safeTransactionEditorV2');
      if(modal&&!modal.hidden)closeModal();
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();