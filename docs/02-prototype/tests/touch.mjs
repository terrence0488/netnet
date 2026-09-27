import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const MIN=+(process.env.MIN||44);
const b=await chromium.launch();
const ctx=await b.newContext(process.env.DESKTOP?{viewport:{width:1280,height:900},colorScheme:'dark'}:{...devices['iPhone 13'], colorScheme:'dark'});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
const SEL='button, a[href], [data-act], [data-go], [data-tab], input:not([type=hidden]), select, textarea, label.switch, label.check';
async function audit(where){
  return p.evaluate(({SEL,MIN,where})=>{
    const seen=new Set(), out=[];
    const vis=el=>{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&el.closest('.screen:not(.active)')===null
        &&!(el.closest('#sheet')&&!document.querySelector('#sheet.on'))&&!el.closest('.tabbar.hidden');};
    const sheetOpen=!!document.querySelector('#sheet.on');
    const targets=[];
    document.querySelectorAll(SEL).forEach(el=>{
      if(sheetOpen && !el.closest('#sheet')) return;   // a sheet covers the screen: audit only the sheet
      // a label wrapping an input is one target; count the label, not the input
      if(el.matches('input,select')&&el.closest('label.switch,label.check')) return;
      if(seen.has(el)||!vis(el))return; seen.add(el);
      const r=el.getBoundingClientRect();
      targets.push({el,r});
      if(r.width<MIN-0.5||r.height<MIN-0.5){
        const txt=(el.getAttribute('aria-label')||el.textContent||el.value||el.tagName).trim().replace(/\s+/g,' ').slice(0,28);
        const key=(el.dataset.act||el.dataset.go||el.dataset.tab||el.className||el.tagName).toString().slice(0,26);
        out.push({where,key,txt,w:Math.round(r.width),h:Math.round(r.height)});
      }});
    // overlapping targets: a bigger target that steals its neighbour's taps is a regression
    const name=el=>(el.dataset.act||el.dataset.go||el.dataset.tab||el.textContent||el.tagName).toString().trim().replace(/\s+/g,' ').slice(0,22);
    for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){
      const A=targets[i],B=targets[j]; if(A.el.contains(B.el)||B.el.contains(A.el))continue;
      // content scrolling under a fixed layer is not an overlap; fixed-vs-fixed and flow-vs-flow are
      const fixed=el=>{for(let n=el;n&&n!==document.body;n=n.parentElement){if(getComputedStyle(n).position==='fixed')return true;}return false;};
      if(fixed(A.el)!==fixed(B.el))continue;
      const ox=Math.min(A.r.right,B.r.right)-Math.max(A.r.left,B.r.left), oy=Math.min(A.r.bottom,B.r.bottom)-Math.max(A.r.top,B.r.top);
      if(ox>1&&oy>1) out.push({where,key:'OVERLAP',txt:name(A.el)+' ⟷ '+name(B.el),w:Math.round(ox),h:Math.round(oy)});
    }
    return out;},{SEL,MIN,where});
}
const go=async h=>{await p.evaluate(()=>{try{closeSheet()}catch(e){}});await p.goto(URL+h,{waitUntil:'load'});await p.waitForTimeout(250);};
const sheet=async (h,sel)=>{await go(h);const el=await p.$(sel);if(el){await el.click();await p.waitForTimeout(300);}return !!el;};
await go('#/home'); await p.evaluate(()=>{reset('seeded');}); await p.waitForTimeout(300);
let all=[];
const routes=['#/home','#/holding/h-dbs','#/add/asset','#/insights','#/period/quarterly/1','#/agent','#/agent/chat','#/activity','#/account',
 '#/sub/general','#/sub/view','#/sub/types','#/sub/tags','#/sub/notifications','#/sub/region','#/sub/export','#/sub/delete','#/sub/archived'];
for(const r of routes){await go(r); all=all.concat(await audit(r));}
// sign-up, log-in and onboarding are only reachable signed out / not yet onboarded
await p.evaluate(()=>{ S.account.signedIn=false; S.signup={email:'x@example.com'}; save(); });
for(const r of ['#/signup','#/signup/password','#/login']){await go(r); all=all.concat(await audit(r));}
await p.evaluate(()=>{ S.account.signedIn=true; S.account.onboarded=false; S.signup={}; save(); });
for(const r of ['#/welcome','#/welcome/2','#/welcome/start','#/connect','#/connect/claude','#/connect/claude/allow']){await go(r); all=all.concat(await audit(r));}
await p.evaluate(()=>{ S.account.obStep='basics'; S.guide=newGuide(); save(); });
await go('#/basics'); all=all.concat(await audit('#/basics'));
await p.evaluate(()=>{ S.guide.stage='amount'; save(); }); await go('#/home'); await go('#/basics'); all=all.concat(await audit('#/basics:amount'));
await p.evaluate(()=>{ S.account.onboarded=true; S.account.obStep=null; S.signup=null; S.guide.done=true; save(); });
const sheets=[['#/home','[data-act="open-filter"]','sheet:filters'],['#/home','[data-act="open-sort"]','sheet:sort'],
 ['#/home','[data-act="open-add-menu"]','sheet:add-menu'],['#/home','[data-act="open-baseline"]','sheet:comparison'],
 ['#/holding/h-dbs','[data-act="add-value"]','sheet:add-value'],['#/holding/h-dbs','[data-act="holding-menu"]','sheet:holding-menu'],
 ['#/insights','[data-act="open-insights-filter"]','sheet:insights-filters'],['#/home','#devbtn','sheet:proto']];
for(const [h,s,n] of sheets){ if(await sheet(h,s)) all=all.concat(await audit(n)); else console.log('(could not open '+n+')'); }
// the comeback reminder (J12): the browser-prompt stand-in on Home and in Settings, and what arrives outside NetNet
const state=async (name,fn)=>{ await p.evaluate(fn); await p.waitForTimeout(300); all=all.concat(await audit(name)); };
await state('home:push-asking', ()=>{ closeSheet(); reset('seeded'); S.notif.asking='home'; save(); render(true); });
await state('home:push-denied', ()=>{ S.notif.asking=null; S.notif.flash={ where:'home', result:'denied' }; save(); render(true); });
await state('notifications:asking', ()=>{ reset('seeded'); location.hash='#/sub/notifications'; render(); S.notif.asking='settings'; save(); render(true); });
await state('notifications:blocked', ()=>{ S.notif.asking=null; S.notif.perm='denied'; save(); render(true); });
await state('sheet:outside-push', ()=>{ S.notif.perm='default'; save(); sheetProto(); document.querySelector('#sheet [data-act="sim-away"]').click(); });
await state('sheet:outside-email', ()=>{ closeSheet(); S.notif.devices=[]; save(); sheetProto(); document.querySelector('#sheet [data-act="sim-away"]').click(); });
await state('sheet:outside-security', ()=>{ closeSheet(); sheetOutside('m-sec-claude'); });
const coarse=await p.evaluate(()=>matchMedia('(pointer: coarse)').matches);
// group by component so the fix list reads as patterns, not 200 rows
const groups={}; all.forEach(x=>{(groups[x.key]=groups[x.key]||[]).push(x);});
const rows=Object.entries(groups).sort((a,b)=>b[1].length-a[1].length);
console.log(`pointer:coarse=${coarse}  target ${MIN}x${MIN}  —  ${all.length} undersized targets in ${rows.length} component patterns\n`);
if(process.env.DETAIL){const o=all.filter(x=>x.key==="OVERLAP");const g={};o.forEach(x=>{const k=x.txt.replace(/"[^"]*"/g,"").replace(/[0-9]/g,"#");(g[x.txt]=g[x.txt]||[]).push(x.where)});Object.entries(g).sort((a,b)=>b[1].length-a[1].length).forEach(([k,v])=>console.log(String(v.length).padStart(3)+"×  "+k+"   @ "+[...new Set(v)].slice(0,3).join(", ")));process.exit(0);}
for(const [k,v] of rows){const ws=v.map(x=>x.w),hs=v.map(x=>x.h);
  console.log(`${String(v.length).padStart(3)}×  ${k.padEnd(26)} ${Math.min(...ws)}-${Math.max(...ws)}w × ${Math.min(...hs)}-${Math.max(...hs)}h   e.g. "${v[0].txt}" @ ${[...new Set(v.map(x=>x.where))].slice(0,3).join(', ')}`);}
await b.close(); if(errs.length)console.log('\nERRORS',errs);
