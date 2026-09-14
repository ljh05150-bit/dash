(function(global){
  'use strict';

  if(!global.FinanceCore || global.__rentDetailPatchInstalled)return;
  global.__rentDetailPatchInstalled=true;

  const originalCreateCashFlow=global.FinanceCore.createCashFlow;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function currentYM(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }

  function shiftYM(value,delta){
    const [year,month]=String(value||currentYM()).split('-').map(Number);
    const d=new Date(year,month-1+delta,1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }

  function ymLabel(value){
    const [year,month]=String(value||currentYM()).split('-').map(Number);
    return `${year}년 ${month}월`;
  }

  function won(n){
    n=Math.round(Number(n||0));
    const a=Math.abs(n),sign=n<0?'-':'';
    if(a>=100000000){
      const eok=a/100000000;
      return sign+(Number.isInteger(eok)?eok.toFixed(0):eok.toFixed(2).replace(/0+$/,'').replace(/\.$/,''))+'억';
    }
    if(a>=10000){
      const man=a/10000;
      return sign+(Number.isInteger(man)?man.toLocaleString('ko-KR'):man.toFixed(1).replace(/\.0$/,''))+'만';
    }
    return sign+a.toLocaleString('ko-KR')+'원';
  }

  function fullWon(n){
    return Math.round(Number(n||0)).toLocaleString('ko-KR')+'원';
  }

  function num(value){
    const n=Number(value||0);
    return Number.isFinite(n)?n:0;
  }

  function installStyle(){
    if(document.getElementById('rent-detail-style'))return;
    const style=document.createElement('style');
    style.id='rent-detail-style';
    style.textContent=`
      #rentGrid .rent-card{cursor:pointer;position:relative;transition:transform .12s ease,border-color .12s ease,background .12s ease;touch-action:manipulation}
      #rentGrid .rent-card:active{transform:scale(.988);border-color:#3f78a8;background:rgba(13,31,51,.96)}
      #rentGrid .rent-card:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
      #rentGrid .rent-card .pill:after{content:'›';font-size:15px;line-height:10px;color:#91b5d6;margin-left:1px}
      #rentGrid .rent-card:after{content:'호실별 임대현황 보기';display:block;margin-top:9px;padding-top:8px;border-top:1px solid rgba(65,103,139,.35);font-size:9px;color:#6f8eac;text-align:right}
      #rentDetailBackdrop{position:fixed;inset:0;z-index:12000;background:rgba(1,6,12,.76);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;padding-top:44px}
      #rentDetailBackdrop[hidden]{display:none!important}
      #rentDetailSheet{width:min(680px,100%);max-height:92vh;overflow:auto;overscroll-behavior:contain;background:linear-gradient(180deg,#0f2136,#07131f);border:1px solid #315d83;border-bottom:0;border-radius:28px 28px 0 0;padding:10px 16px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -18px 56px rgba(0,0,0,.55)}
      .rent-detail-handle{width:42px;height:5px;border-radius:999px;background:#40536a;margin:2px auto 14px}
      .rent-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .rent-detail-title{font-size:23px;font-weight:880;letter-spacing:-.04em;line-height:1.15}
      .rent-detail-address{font-size:10px;color:#7f96ad;margin-top:5px;line-height:1.45}
      .rent-detail-close{width:38px;height:38px;border-radius:13px;border:1px solid #315775;background:#102238;color:#e5f0fa;font-size:22px;flex:0 0 auto}
      .rent-detail-monthbar{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:8px;margin-top:16px}
      .rent-detail-monthbtn{height:38px;border:1px solid #294c6d;background:#0b1b2c;color:#dce9f5;border-radius:12px;font-size:21px}
      .rent-detail-monthbtn:disabled{opacity:.28}
      .rent-detail-month{text-align:center;font-size:15px;font-weight:820}
      .rent-detail-sortbar{display:flex;justify-content:flex-end;gap:7px;margin-top:10px}
      .rent-detail-sortbtn{min-width:82px;height:34px;border:1px solid #294c6d;background:#0a1929;color:#8fa7bd;border-radius:11px;padding:0 11px;font-size:10px;font-weight:780}
      .rent-detail-sortbtn.active{background:#16446d;border-color:#5aa8e7;color:#fff;box-shadow:inset 0 0 0 1px rgba(90,168,231,.12)}
      .rent-detail-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:13px}
      .rent-detail-summary-card{background:#091827;border:1px solid #234563;border-radius:15px;padding:11px 10px;min-width:0}
      .rent-detail-summary-k{font-size:9px;color:#7e95ac}
      .rent-detail-summary-v{font-size:16px;font-weight:850;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rent-detail-statusline{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
      .rent-detail-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 8px;border:1px solid #294c6d;border-radius:999px;background:#0a1929;font-size:10px;color:#cfe0ef}
      .rent-detail-chip b{font-size:11px}
      .rent-detail-list{margin-top:13px;border-top:1px solid #213e59}
      .rent-detail-room{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px 2px;border-bottom:1px solid #1c354d;align-items:center}
      .rent-detail-roomname{display:flex;align-items:center;gap:7px;font-size:15px;font-weight:840;line-height:1.25}
      .rent-detail-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:820;white-space:nowrap}
      .rent-detail-badge.paid{background:rgba(66,214,155,.12);border:1px solid rgba(66,214,155,.38);color:#61e5ae}
      .rent-detail-badge.unpaid{background:rgba(255,91,101,.11);border:1px solid rgba(255,91,101,.38);color:#ff7d86}
      .rent-detail-badge.partial{background:rgba(255,179,60,.11);border:1px solid rgba(255,179,60,.38);color:#ffc263}
      .rent-detail-badge.vacant{background:rgba(111,142,174,.12);border:1px solid rgba(111,142,174,.34);color:#9ab0c4}
      .rent-detail-contract{font-size:10px;color:#95aac0;margin-top:6px;line-height:1.5}
      .rent-detail-due{font-size:9px;color:#667f98;margin-top:3px}
      .rent-detail-paidamt{text-align:right;min-width:82px}
      .rent-detail-paidamt .v{font-size:13px;font-weight:850;white-space:nowrap}
      .rent-detail-paidamt .k{font-size:9px;color:#71879d;margin-top:4px;white-space:nowrap}
      .rent-detail-empty{padding:32px 10px;text-align:center;color:#7f96ad;font-size:12px;line-height:1.7}
      .rent-detail-loading{padding:34px 10px;text-align:center;color:#9ab0c4;font-size:12px}
      .rent-detail-error{padding:24px 12px;text-align:center;color:#ff9aa0;font-size:12px;line-height:1.7}
      .rent-detail-retry{margin-top:12px;border:1px solid #3a668c;background:#102842;color:#e8f3fc;border-radius:12px;padding:10px 14px;font-size:11px;font-weight:760}
      @media(max-width:380px){.rent-detail-summary-v{font-size:14px}.rent-detail-room{grid-template-columns:minmax(0,1fr) 74px}.rent-detail-paidamt{min-width:68px}.rent-detail-contract{font-size:9px}.rent-detail-sortbtn{min-width:75px}}
    `;
    document.head.appendChild(style);
  }

  function roomStatus(room){
    const rent=num(room?.monthlyRent),fee=num(room?.maintenanceFee),deposit=num(room?.deposit);
    const charge=rent+fee,paid=num(room?.paidAmount);
    if(charge<=0&&deposit<=0)return {key:'vacant',label:'공실'};
    if(charge>0&&paid>=charge)return {key:'paid',label:'입금완료'};
    if(paid>0)return {key:'partial',label:'일부입금'};
    return {key:'unpaid',label:'미입금'};
  }

  function roomCompare(a,b){
    return String(a?.roomName||'').localeCompare(String(b?.roomName||''),'ko',{numeric:true,sensitivity:'base'});
  }

  function paymentDayValue(room){
    const match=String(room?.paymentDay??'').match(/\d+/);
    const day=match?Number(match[0]):NaN;
    return Number.isFinite(day)&&day>=1&&day<=31?day:Number.POSITIVE_INFINITY;
  }

  function sortRooms(rooms,mode='room'){
    const list=[...rooms];
    if(mode==='paymentDay'){
      return list.sort((a,b)=>paymentDayValue(a)-paymentDayValue(b)||roomCompare(a,b));
    }
    return list.sort(roomCompare);
  }

  function installRentDetail(options,apiLoad){
    const grid=document.getElementById('rentGrid');
    if(!grid||grid.dataset.rentDetailBound==='1')return;
    grid.dataset.rentDetailBound='1';
    installStyle();

    const configs=Object.values(options?.properties||{}).filter(Boolean);
    const cache=new Map();
    let selectedConfig=null;
    let selectedMonth=currentYM();
    let selectedSort='room';
    let selectedProperty=null;
    let requestSeq=0;

    const wrappedLoad=async(yearMonth=currentYM(),force=false)=>{
      if(!force&&cache.has(yearMonth))return cache.get(yearMonth);
      const payload=await apiLoad(yearMonth);
      cache.set(yearMonth,payload);
      return payload;
    };

    function cfgForCard(card){
      const name=String(card.querySelector('.rent-name')?.textContent||'').trim();
      const byName=configs.find(c=>String(c?.name||'').trim()===name);
      if(byName)return byName;
      const cards=[...grid.querySelectorAll('.rent-card')];
      return configs[cards.indexOf(card)]||null;
    }

    function ensureSheet(){
      let root=document.getElementById('rentDetailBackdrop');
      if(root)return root;
      root=document.createElement('div');
      root.id='rentDetailBackdrop';
      root.hidden=true;
      root.innerHTML=`<section id="rentDetailSheet" role="dialog" aria-modal="true" aria-labelledby="rentDetailTitle"><div class="rent-detail-handle"></div><div class="rent-detail-head"><div><div id="rentDetailTitle" class="rent-detail-title">임대 현황</div><div id="rentDetailAddress" class="rent-detail-address"></div></div><button type="button" class="rent-detail-close" aria-label="닫기">×</button></div><div class="rent-detail-monthbar"><button type="button" class="rent-detail-monthbtn" data-rent-month="-1" aria-label="이전 달">‹</button><div id="rentDetailMonth" class="rent-detail-month"></div><button type="button" class="rent-detail-monthbtn" data-rent-month="1" aria-label="다음 달">›</button></div><div class="rent-detail-sortbar" aria-label="호실 정렬"><button type="button" class="rent-detail-sortbtn active" data-rent-sort="room" aria-pressed="true">호수순</button><button type="button" class="rent-detail-sortbtn" data-rent-sort="paymentDay" aria-pressed="false">납부일순</button></div><div id="rentDetailBody"></div></section>`;
      root.addEventListener('click',event=>{
        if(event.target===root||event.target.closest('.rent-detail-close')){closeSheet();return;}
        const monthButton=event.target.closest('[data-rent-month]');
        if(monthButton&&!monthButton.disabled){changeMonth(Number(monthButton.dataset.rentMonth||0));return;}
        const sortButton=event.target.closest('[data-rent-sort]');
        if(sortButton){
          selectedSort=sortButton.dataset.rentSort==='paymentDay'?'paymentDay':'room';
          updateSortButtons();
          if(selectedProperty)renderProperty(selectedProperty);
          return;
        }
        if(event.target.closest('.rent-detail-retry'))renderSelected(true);
      });
      document.body.appendChild(root);
      return root;
    }

    function updateSortButtons(){
      document.querySelectorAll('#rentDetailBackdrop [data-rent-sort]').forEach(button=>{
        const active=button.dataset.rentSort===selectedSort;
        button.classList.toggle('active',active);
        button.setAttribute('aria-pressed',String(active));
      });
    }

    function closeSheet(){
      const root=document.getElementById('rentDetailBackdrop');
      if(root)root.hidden=true;
      document.body.style.overflow='';
    }

    function openSheet(cfg){
      if(!cfg)return;
      selectedConfig=cfg;
      selectedMonth=currentYM();
      selectedSort='room';
      selectedProperty=null;
      const root=ensureSheet();
      updateSortButtons();
      root.hidden=false;
      document.body.style.overflow='hidden';
      renderSelected(false);
    }

    function changeMonth(delta){
      const next=shiftYM(selectedMonth,delta);
      if(next>currentYM())return;
      selectedMonth=next;
      selectedProperty=null;
      renderSelected(false);
    }

    function updateHeader(property){
      document.getElementById('rentDetailTitle').textContent=selectedConfig?.name||'임대 현황';
      document.getElementById('rentDetailAddress').textContent=property?.address||selectedConfig?.address||'자리톡 호실별 임대 현황';
      document.getElementById('rentDetailMonth').textContent=ymLabel(selectedMonth);
      const next=document.querySelector('#rentDetailBackdrop [data-rent-month="1"]');
      if(next)next.disabled=selectedMonth>=currentYM();
      updateSortButtons();
    }

    function renderProperty(property){
      selectedProperty=property;
      updateHeader(property);
      const body=document.getElementById('rentDetailBody');
      const sourceRooms=Array.isArray(property?.rooms)?property.rooms:[];
      const rooms=sortRooms(sourceRooms,selectedSort);
      const rows=rooms.map(room=>{
        const status=roomStatus(room);
        const rent=num(room.monthlyRent),fee=num(room.maintenanceFee),deposit=num(room.deposit),paid=num(room.paidAmount),charge=rent+fee;
        const due=room.paymentDay?`매월 ${esc(room.paymentDay)}일 납부`:'납부일 미등록';
        let contract=`보증금 ${won(deposit)} · 월세 ${won(rent)}`;
        if(fee>0)contract+=` · 관리비 ${won(fee)}`;
        if(status.key==='vacant')contract='현재 계약정보 없음';
        const amountLabel=status.key==='vacant'?'공실':status.key==='unpaid'?'0원':fullWon(paid);
        const amountSub=status.key==='vacant'?'':'청구 '+fullWon(charge);
        return `<div class="rent-detail-room"><div><div class="rent-detail-roomname"><span>${esc(room.roomName||'호실')}</span><span class="rent-detail-badge ${status.key}">${status.label}</span></div><div class="rent-detail-contract">${contract}</div><div class="rent-detail-due">${due}</div></div><div class="rent-detail-paidamt"><div class="v">${amountLabel}</div><div class="k">${amountSub}</div></div></div>`;
      }).join('');

      const stats=sourceRooms.reduce((acc,room)=>{
        const st=roomStatus(room);const charge=num(room.monthlyRent)+num(room.maintenanceFee);const paid=num(room.paidAmount);
        acc.charge+=charge;acc.paid+=paid;acc.deposit+=num(room.deposit);
        if(st.key==='vacant')acc.vacant++;else{acc.occupied++;if(st.key==='paid')acc.paidRooms++;else if(st.key==='partial')acc.partial++;else acc.unpaid++;}
        return acc;
      },{charge:0,paid:0,deposit:0,vacant:0,occupied:0,paidRooms:0,partial:0,unpaid:0});

      body.innerHTML=`<div class="rent-detail-summary"><div class="rent-detail-summary-card"><div class="rent-detail-summary-k">이번달 수납</div><div class="rent-detail-summary-v">${won(property?.paidAmount??stats.paid)}</div></div><div class="rent-detail-summary-card"><div class="rent-detail-summary-k">월 청구액</div><div class="rent-detail-summary-v">${won(property?.monthlyCharge??stats.charge)}</div></div><div class="rent-detail-summary-card"><div class="rent-detail-summary-k">총 보증금</div><div class="rent-detail-summary-v">${won(property?.totalDeposit??stats.deposit)}</div></div></div><div class="rent-detail-statusline"><span class="rent-detail-chip">입금완료 <b>${stats.paidRooms}</b></span>${stats.partial?`<span class="rent-detail-chip">일부입금 <b>${stats.partial}</b></span>`:''}<span class="rent-detail-chip">미입금 <b>${stats.unpaid}</b></span><span class="rent-detail-chip">공실 <b>${stats.vacant}</b></span></div><div class="rent-detail-list">${rows||'<div class="rent-detail-empty">자리톡에서 불러온 호실 정보가 없습니다.</div>'}</div>`;
    }

    async function renderSelected(force){
      if(!selectedConfig)return;
      const seq=++requestSeq;
      updateHeader(null);
      const body=document.getElementById('rentDetailBody');
      if(body)body.innerHTML='<div class="rent-detail-loading">자리톡 임대 현황을 불러오는 중…</div>';
      try{
        const payload=await wrappedLoad(selectedMonth,force);
        if(seq!==requestSeq)return;
        const property=(payload?.properties||[]).find(p=>String(p?.propertyPk)===String(selectedConfig.propertyPk));
        if(payload?.ok!==true||!property){
          selectedProperty=null;
          updateHeader(null);
          body.innerHTML='<div class="rent-detail-error">자리톡에서 이 건물의 호실 정보를 확인하지 못했습니다.<br>잠시 후 다시 시도해 주세요.<br><button class="rent-detail-retry" type="button">다시 불러오기</button></div>';
          return;
        }
        renderProperty(property);
      }catch(error){
        if(seq!==requestSeq)return;
        selectedProperty=null;
        console.warn('rent detail',error);
        body.innerHTML='<div class="rent-detail-error">호실별 임대 현황을 불러오지 못했습니다.<br><button class="rent-detail-retry" type="button">다시 불러오기</button></div>';
      }
    }

    function decorateCards(){
      grid.querySelectorAll('.rent-card').forEach(card=>{
        card.setAttribute('role','button');
        card.setAttribute('tabindex','0');
        card.setAttribute('aria-label',`${card.querySelector('.rent-name')?.textContent||'건물'} 호실별 자리톡 임대현황 보기`);
      });
    }

    grid.addEventListener('click',event=>{
      const card=event.target.closest('.rent-card');
      if(!card||!grid.contains(card))return;
      openSheet(cfgForCard(card));
    });
    grid.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const card=event.target.closest('.rent-card');
      if(!card||!grid.contains(card))return;
      event.preventDefault();openSheet(cfgForCard(card));
    });
    new MutationObserver(decorateCards).observe(grid,{childList:true,subtree:true});
    decorateCards();
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('rentDetailBackdrop')?.hidden)closeSheet();});

    return {cache,wrappedLoad};
  }

  global.FinanceCore.createCashFlow=function(options){
    const api=originalCreateCashFlow(options);
    const originalLoad=api.loadZaritalk;
    const installer=installRentDetail(options,originalLoad);
    if(installer){
      api.loadZaritalk=installer.wrappedLoad;
    }
    return api;
  };
})(window);
