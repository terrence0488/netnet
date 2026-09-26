import { chromium, devices, shots } from './pw.mjs';
const SP=shots('');
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch(); const errs=[];
for (const w of [1280,1600,2000,2560]) {
  const ctx=await b.newContext({viewport:{width:w,height:1000},colorScheme:'dark'});
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(w+': '+e.message));
  await p.goto(URL+'#/home',{waitUntil:'load'}); await p.evaluate(()=>document.fonts.ready);
  await p.waitForTimeout(350);
  const m=await p.evaluate(()=>{const el=document.querySelector('.main');const r=el.getBoundingClientRect();
    return {left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),vw:innerWidth};});
  const voidRight = m.vw - m.right;
  console.log(`${w}px → content ${m.width}px, left gap ${m.left - 232}px, right gap ${voidRight}px`);
  if (w===2000) await p.screenshot({path:`${SP}/wide-2000.png`});
  await ctx.close();
}
await b.close(); console.log(errs.length?errs.join('\n'):'no errors');
