/* The comeback reminder (PRD J12) and the security email (J5): Home's one-time card, the
   browser's permission prompt, Settings → Notifications, who gets what by which channel, the
   wording, and the events. Phone (iPhone 13) in Singapore time, plus two clock-pinned pages. */
import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const ctx=await b.newContext({...devices['iPhone 13'], timezoneId:'Asia/Singapore'}); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
const evs=()=>p.evaluate(()=>S.events.map(e=>[e.name,e.props.entry,e.props.result,e.props.channel,e.props.by,e.props.client].filter(Boolean).join(':')));
const count=async n=>(await evs()).filter(e=>e===n).length;
const go=async h=>{ await p.evaluate(h=>{ closeSheet(); location.hash=h; },h); await p.waitForTimeout(220); };
const seeded=async()=>{ await p.evaluate(()=>{ localStorage.removeItem('netnet-proto-push'); reset('seeded'); }); await p.waitForTimeout(300); };
const card=()=>p.$('#s-home .nudge');
const cardText=async()=>{ const c=await card(); return c ? (await c.textContent()).replace(/\s+/g,' ').trim() : ''; };
const proto=async act=>{ await p.evaluate(()=>sheetProto()); await p.waitForTimeout(150); await p.click(`#sheet [data-act="${act}"]`); await p.waitForTimeout(250); };
const sheetText=async()=>(await p.textContent('#sheet')).replace(/\s+/g,' ');
const thisSwitch='#s-sub [data-act="notif-this"]';

await p.goto(URL+'#/home',{waitUntil:'load'});

// ================= Home's card: the offer
await seeded();
t('Home offers push once there is a first picture, in a card', !!(await card()));
t('…below the Position ledger, before the holdings', await p.evaluate(()=>{
  const n=document.querySelector('#s-home .nudge'), l=document.querySelector('#s-home .ledger'), h=document.querySelector('#s-home .o-list');
  return !!(l.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING) && !!(n.compareDocumentPosition(h)&Node.DOCUMENT_POSITION_FOLLOWING); }));
t('it asks the PRD’s question', (await cardText()).includes('Want a gentle nudge on this device if you haven’t looked in a while?'), await cardText());
t('Turn on is an outlined button and Not now a link: no filled button, no pop-up', !!(await p.$('#s-home .nudge .btn.sec[data-act="push-on"]'))
  && !(await p.$('#s-home .nudge .btn:not(.sec)')) && !!(await p.$('#s-home .nudge [data-act="push-not-now"]')) && !(await p.evaluate(()=>document.querySelector('#sheet.on'))));
await p.evaluate(()=>{ render(true); render(true); }); await go('#/insights'); await go('#/home');
t('push_prompt_shown {entry: home} fires once for the showing, not per render', await count('push_prompt_shown:home')===1, (await evs()).join(' '));
await p.click('[data-act="push-on"]'); await p.waitForTimeout(150);
t('Turn on → the browser’s own prompt follows that tap (stood in for, and marked Prototype)', !!(await p.$('#s-home .nudge .bprompt'))
  && (await p.textContent('#s-home .nudge .bprompt')).includes('Prototype') && !(await p.$('#s-home .nudge [data-act="push-on"]')));
t('…nothing is turned on before the browser answers', await count('push_enabled')===0 && !(await p.evaluate(()=>S.notif.thisOn)));
await p.click('[data-act="push-perm"][data-v="granted"]'); await p.waitForTimeout(150);
t('Allow → NetNet confirms it in one line', (await cardText())==='Notifications are on for this device.', await cardText());
const ev1=await p.evaluate(()=>S.events.slice(0,2).map(e=>e.name+JSON.stringify(e.props)));
t('…push_prompt_result {home, granted} and push_enabled {platform: phone}', ev1.some(e=>e.startsWith('push_enabled')&&e.includes('"platform":"phone"'))
  && ev1.some(e=>e.startsWith('push_prompt_result')&&e.includes('"entry":"home"')&&e.includes('"result":"granted"')), ev1.join(' '));
await go('#/insights'); await go('#/home');
t('…and once seen, the card is gone for good', !(await card()));
await go('#/sub/notifications');
t('Settings shows this device on: reminders come here, not by email', await p.$eval(thisSwitch, e=>e.checked)
  && (await p.textContent('#s-sub')).includes('Reminders come here, not by email.'));

// ================= Block
await seeded();
await p.click('[data-act="push-on"]'); await p.waitForTimeout(120);
await p.click('[data-act="push-perm"][data-v="denied"]'); await p.waitForTimeout(150);
t('Block → one line saying where to allow them, for a phone', /blocked in this browser/i.test(await cardText()) && (await cardText()).includes('tap the icon beside the address'), await cardText());
t('…push_prompt_result {home, denied}, and no push_enabled', await count('push_prompt_result:home:denied')===1 && await count('push_enabled')===0);
await go('#/insights'); await go('#/home');
t('…and NetNet never asks again on its own', !(await card()));
await go('#/sub/notifications');
const blocked=await p.$eval(thisSwitch, e=>({on:e.checked, dis:e.getAttribute('aria-disabled'), sub:e.closest('.switch').textContent.replace(/\s+/g,' ')}));
t('Settings: the switch stays off, unavailable, with the where-to-allow line', !blocked.on && blocked.dis==='true' && blocked.sub.includes('Blocked in this browser'), JSON.stringify(blocked));
await p.click('label.switch:has([data-act="notif-this"])', { force:true }); await p.waitForTimeout(150);
t('…tapping it changes nothing and raises no prompt', !(await p.$eval(thisSwitch, e=>e.checked)) && !(await p.$('#s-sub .bprompt')));

// ================= Not now
await seeded();
await p.click('[data-act="push-not-now"]'); await p.waitForTimeout(150);
t('Not now hides the card', !(await card()));
t('…push_prompt_result {home, not_now}', await count('push_prompt_result:home:not_now')===1);
await go('#/sub/notifications');
t('…and the setting stays in Settings', !!(await p.$(thisSwitch)));
await go('#/home'); await proto('sim-away'); await go('#/home');
t('30 days later the card is back, and counted as shown again', !!(await card()) && await count('push_prompt_shown:home')===2, (await evs()).filter(e=>e.startsWith('push_prompt')).join(' '));
await p.click('[data-act="push-not-now"]'); await p.waitForTimeout(150);
await proto('sim-away'); await proto('sim-away'); await go('#/home');
t('a second Not now hides it for good (60 days on, still gone)', !(await card()));

// ================= a browser that cannot receive push (an iPhone Safari tab)
await p.evaluate(()=>{ localStorage.setItem('netnet-proto-push','no'); reset('seeded'); }); await p.waitForTimeout(300);
t('no push option on Home', !(await card()));
await go('#/sub/notifications');
t('no push option in Settings; email reminders are there', !(await p.$(thisSwitch)) && !!(await p.$('#s-sub [data-act="notif-email"]')));
t('no push_prompt_shown at all', (await evs()).every(e=>!e.startsWith('push_prompt_shown')));
t('nothing explains adding NetNet to the Home Screen', !/home screen/i.test(await p.textContent('#s-sub')));
await p.evaluate(()=>localStorage.removeItem('netnet-proto-push'));

// ================= never during sign-up or the basics
await p.evaluate(()=>{ reset('empty'); Object.assign(S.account,{ signedIn:true, email:'ana@example.com', verified:true, region:'SG', pack:'sg', obStep:'basics' });
  S.guide=newGuide(); save(); location.hash='#/basics'; render(); }); await p.waitForTimeout(250);
await p.click('[data-act="guide-yes"]'); await p.waitForTimeout(120); await p.fill('#g-amount','4000'); await p.click('[data-act="guide-add"]'); await p.waitForTimeout(250);
t('the basics: a first holding, and no card and no prompt event', await p.evaluate(()=>S.holdings.length)===1 && !(await p.$('.nudge'))
  && (await evs()).every(e=>!e.startsWith('push_prompt')));
await p.evaluate(()=>finishBasics()); await p.waitForTimeout(300);
t('Home after the basics: the card, now', !!(await card()) && await count('push_prompt_shown:home')===1);
await p.evaluate(()=>{ reset('empty'); Object.assign(S.account,{ signedIn:true, onboarded:true, email:'ana@example.com', verified:true }); save(); location.hash='#/home'; render(); });
await p.waitForTimeout(250);
t('an empty Home never offers it', !(await p.$('.nudge')));

// ================= Settings → Notifications
await seeded(); await go('#/account');
const accRow=(await p.textContent('#s-account [data-go="#/sub/notifications"]')).replace(/\s+/g,' ');
t('Account → Notifications · On (the old Reminders row is gone)', /Notifications\s*On/.test(accRow) && !(await p.$('#s-account [data-go="#/sub/reminders"]')), accRow);
await go('#/sub/reminders');
t('an old link to Reminders opens Notifications', (await p.textContent('#s-sub h1'))==='Notifications');
await go('#/sub/notifications');
const subTxt=(await p.textContent('#s-sub')).replace(/\s+/g,' ');
t('it shows Reminders, this device, email reminders and other devices', ['Reminders','Notifications on this device','Email reminders','Other devices','Android · Chrome','Remove'].every(s=>subTxt.includes(s)), subTxt.slice(0,200));
t('email says it is used only when no device has notifications on', subTxt.includes('Only when no device has notifications on. Sent to sam@example.com.'));
t('reminders never carry an amount or a holding name: said once', subTxt.includes('Reminders never include an amount or a holding name.'));
t('the security email is listed as always on, and cannot be switched', subTxt.includes('Email when an agent is connected') && subTxt.includes('can’t be turned off')
  && (await p.$$('#s-sub input[type=checkbox]')).length===3);
t('the stale-holding email and its cadence are gone (J9)', !/weekly|quarterly|go stale/i.test(subTxt));
t('opening it with this device undecided counts as the offer being shown', await count('push_prompt_shown:settings')>=1);
await p.click('label.switch:has([data-act="notif-this"])'); await p.waitForTimeout(150);
t('this device → the browser’s prompt, under the switch', !!(await p.$('#s-sub .bprompt')) && !(await p.$eval(thisSwitch, e=>e.checked)));
await p.click('[data-act="push-perm"][data-v="granted"]'); await p.waitForTimeout(150);
t('Allow → on, confirmed in one line', await p.$eval(thisSwitch, e=>e.checked) && (await p.textContent('#s-sub')).includes('On. Reminders come here, not by email.')
  && await count('push_prompt_result:settings:granted')===1);
await p.click('label.switch:has([data-act="notif-this"])'); await p.waitForTimeout(150);
t('off → push_disabled {by: user}', await count('push_disabled:user')===1 && !(await p.$eval(thisSwitch, e=>e.checked)));
await p.click('label.switch:has([data-act="notif-this"])'); await p.waitForTimeout(150);
t('on again: the browser already allowed it, so no second prompt', await p.$eval(thisSwitch, e=>e.checked) && !(await p.$('#s-sub .bprompt')) && await count('push_enabled')===2);
await p.click('#s-sub [data-act="device-remove"]'); await p.waitForTimeout(150);
t('Remove another device → gone, push_disabled {platform: phone, by: user}', !(await p.textContent('#s-sub')).includes('Android · Chrome')
  && await p.evaluate(()=>S.events.some(e=>e.name==='push_disabled'&&e.props.platform==='phone'&&e.props.by==='user')));
await p.click('label.switch:has([data-act="notif-master"])'); await p.waitForTimeout(150);
const offTxt=(await p.textContent('#s-sub')).replace(/\s+/g,' ');
t('Reminders off: every channel goes quiet; the security email stays', !offTxt.includes('How they reach you') && !(await p.$(thisSwitch)) && offTxt.includes('Email when an agent is connected'));
await proto('sim-away');
t('…30 days away with Reminders off: nothing is sent, and PROTO says why', await count('reminder_sent:push')+await count('reminder_sent:email')===0
  && (await sheetText()).includes('Reminders are off, so nothing was sent.'));
await go('#/account');
t('…Account shows Notifications · Off', /Notifications\s*Off/.test((await p.textContent('#s-account [data-go="#/sub/notifications"]')).replace(/\s+/g,' ')));

// ================= sending: push first
const leak=async sel=>p.evaluate(sel=>{
  const txt=[...document.querySelectorAll(sel)].map(e=>e.textContent).join(' ');
  const names=[...S.holdings.map(h=>h.name), ...S.types.map(t=>typeName(t)), ...S.tags];
  const hits=names.filter(n=>n && txt.includes(n));
  if (/[$£€]|\bS\$|\bRM\s?\d|\d{1,3},\d{3}/.test(txt)) hits.push('an amount');
  return hits; }, sel);
await seeded(); await proto('sim-away');
const lock=(await p.textContent('#sheet .lock-note')||'').replace(/\s+/g,' ').trim();
t('30 days away, push on another device → a push, on a lock screen', !!(await p.$('#sheet .lock')) && await count('reminder_sent:push')===1 && await count('reminder_sent:email')===0);
t('titled NetNet, reading the chosen wording with the agent’s name', lock.includes('NetNet') && lock.endsWith('Your net worth is due for an update. Just ask Claude.'), lock);
t('the lock screen shows day 30 on the calendar (23 Oct)', /23 October/.test(await p.textContent('#sheet .lock-date')));
t('no amount, total, holding, type or tag name on the lock screen', (await leak('#sheet .lock-note')).length===0, (await leak('#sheet .lock-note')).join(', '));
t('the email is not sent as well', !(await p.$('#sheet .mail')));
await p.click('#sheet .lock-note'); await p.waitForTimeout(300);
t('tapping it opens Home, as a new visit', await p.evaluate(()=>location.hash)==='#/home' && await count('reminder_opened:push')===1
  && (await evs())[0]==='session_started' && await p.evaluate(()=>S.notif.away)===0, (await evs()).slice(0,3).join(' '));

// ================= email, when no device has push
await seeded(); await p.evaluate(()=>{ S.notif.devices=[]; save(); });
await proto('sim-away');
const mail=(await p.textContent('#sheet .mail')).replace(/\s+/g,' ');
t('no device has push → the reminder goes by email instead', !!(await p.$('#sheet .mail')) && await count('reminder_sent:email')===1 && await count('reminder_sent:push')===0);
t('its subject is the same line', (await p.textContent('#sheet .mi-subj')).trim()==='Your net worth is due for an update.');
t('one line, "Just ask Claude.", and one button, Open NetNet', (await p.textContent('#sheet .mail-open h4')).trim()==='Your net worth is due for an update.'
  && mail.includes('Just ask Claude.') && (await p.$$('#sheet .mail-open .btn')).length===1 && (await p.textContent('#sheet .mail-open .btn')).trim()==='Open NetNet');
t('no amount, total, holding, type or tag name in the email', (await leak('#sheet .mail')).length===0, (await leak('#sheet .mail')).join(', '));
t('no guilt, no streak, no urgency', !/streak|don’t forget|hurry|now!|miss out|overdue|urgent/i.test(mail));
await p.click('#sheet [data-act="mail-unsub"]'); await p.waitForTimeout(200);
t('one-click unsubscribe turns email reminders off', !(await p.evaluate(()=>S.notif.email)) && (await sheetText()).includes('Reminder emails are off.'));
await p.evaluate(()=>{ S.notif.email=true; save(); });
await p.click('#sheet [data-act="open-reminder"]'); await p.waitForTimeout(300);
t('Open NetNet → Home, reminder_opened {email}', await p.evaluate(()=>location.hash)==='#/home' && await count('reminder_opened:email')===1);

// ================= monthly while away; checking restarts the clock
await seeded(); await p.evaluate(()=>{ S.notif.devices=[]; save(); });
await proto('sim-away'); await proto('sim-away');
const labels=await p.evaluate(()=>S.notif.outbox.filter(m=>m.kind==='reminder').map(m=>m.day));
t('still away → another reminder every 30 days (day 30, then day 60)', JSON.stringify(labels)==='[60,30]', JSON.stringify(labels));
await proto('sim-agent');
t('the agent reading NetNet counts as checking: the clock starts again', await p.evaluate(()=>S.notif.away)===0 && (await sheetText()).includes('Checked NetNet today')
  && (await evs()).includes('agent_tool_called:Claude'));
await proto('sim-away');
t('…so the next one is a day-30 reminder again', await p.evaluate(()=>S.notif.outbox[0].day)===30);
await p.evaluate(()=>{ S.chatStep=0; S.notif.away=45; save(); });
await go('#/agent/chat'); for (let i=0;i<3;i++){ await p.click('[data-act="chat-next"]'); await p.waitForTimeout(120); }
t('…as does the agent writing through NetNet (the demo turn)', await p.evaluate(()=>S.notif.away)===0);

// ================= the agent named, or none
await seeded(); await p.evaluate(()=>{ S.notif.devices=[]; S.account.connections.forEach(c=>c.active=false); save(); });
await proto('sim-away');
t('no agent connected → the line alone, no "Just ask"', !(await sheetText()).includes('Just ask') && (await p.textContent('#sheet .mail-open h4')).trim()==='Your net worth is due for an update.');
await p.evaluate(()=>{ S.account.connections.push({ id:'c-gpt', client:'ChatGPT', connectedAt:new Date().toISOString(), lastCall:new Date().toISOString(), active:true }); save(); });
await proto('sim-away');
t('ChatGPT connected → "Just ask ChatGPT."', (await sheetText()).includes('Just ask ChatGPT.'));

// ================= nothing to send to; push that fails
await seeded(); await p.evaluate(()=>{ S.notif.devices=[]; S.account.verified=false; save(); });
await proto('sim-away');
t('no push anywhere and the email not verified → nothing is sent, and PROTO says why', await count('reminder_sent:email')===0 && (await sheetText()).includes('isn’t verified'));
await seeded(); await proto('sim-fail'); await p.click('#sheet [data-act="sim-away"]'); await p.waitForTimeout(250);
t('every push fails → the device is dropped (push_disabled {by: browser}) and email takes over', await count('push_disabled:browser')===1
  && await count('reminder_sent:email')===1 && await p.evaluate(()=>S.notif.devices.length)===0 && !!(await p.$('#sheet .mail')));

// ================= the security email (J5)
await seeded(); await p.evaluate(()=>sheetOutside('m-sec-claude')); await p.waitForTimeout(200);
const sec=(await p.textContent('#sheet .mail')).replace(/\s+/g,' ');
t('the sample account holds the email sent when Claude was connected', sec.includes('Claude was connected to your NetNet') && sec.includes('you allowed Claude'));
t('it says when, in the person’s own time, as the Agent tab does', sec.includes('5 Aug 2026') && (await p.evaluate(()=>{ location.hash='#/agent'; render(); return document.querySelector('#s-agent').textContent; })).includes('Connected 5 Aug 2026'));
await p.evaluate(()=>sheetOutside('m-sec-claude')); await p.waitForTimeout(200);
t('"Not you? Revoke it", and it cannot be turned off', sec.includes('Not you? Revoke it') && sec.includes('It can’t be turned off.'));
t('no financial data in it', (await leak('#sheet .mail')).length===0, (await leak('#sheet .mail')).join(', '));
await p.click('#sheet [data-act="mail-revoke"]'); await p.waitForTimeout(250);
t('Revoke it → the Agent tab', await p.evaluate(()=>location.hash)==='#/agent');
await p.evaluate(()=>{ S.notif.reminders=false; S.notif.email=false; save(); });
await p.click('#s-agent [data-act="connect-start"][data-client="chatgpt"]'); await p.waitForTimeout(250);
await go('#/connect/chatgpt/allow'); await p.click('[data-act="connect-allow"]'); await p.waitForTimeout(300);
const top=await p.evaluate(()=>S.notif.outbox[0]);
t('connecting ChatGPT sends one at once: security_email_sent {client: ChatGPT}', await count('security_email_sent:ChatGPT')===1 && top.kind==='security' && top.client==='ChatGPT');
t('…by email only, even with Reminders and email reminders off', top.channel==='email' && await p.evaluate(()=>S.notif.outbox.filter(m=>m.kind==='security').every(m=>m.channel==='email')));

// ================= signing out
await seeded(); await p.click('[data-act="push-on"]'); await p.waitForTimeout(120); await p.click('[data-act="push-perm"][data-v="granted"]'); await p.waitForTimeout(150);
await go('#/account'); await p.click('[data-act="logout"]'); await p.waitForTimeout(250);
t('signing out stops push on this device: push_disabled {by: signout}', await count('push_disabled:signout')===1 && !(await p.evaluate(()=>S.notif.thisOn)));
await p.evaluate(()=>{ S.account.signedIn=true; save(); location.hash='#/home'; render(); }); await p.waitForTimeout(250);
t('signed in again: no card (the browser already decided), and the switch is off', !(await card()));
await go('#/sub/notifications');
t('…until it is turned on again', !(await p.$eval(thisSwitch, e=>e.checked)));

// ================= N9: the events carry no money and no message text
const props=await p.evaluate(()=>S.events.filter(e=>/^(reminder|push|security)/.test(e.name)).map(e=>JSON.stringify(e.props)));
t('reminder, push and security events carry names and channels only', props.length>0 && props.every(x=>!/\d{3}|\$|update|NetNet/.test(x)), props.slice(0,4).join(' '));

// ================= daytime only (08:00–21:00 in the person's own time)
for (const [when, want] of [['2026-09-23T15:30:00Z', 8], ['2026-09-23T02:15:00Z', 10]]) {
  const c2=await b.newContext({...devices['iPhone 13'], timezoneId:'Asia/Singapore'}); const q=await c2.newPage();
  await q.clock.setFixedTime(new Date(when));
  await q.goto(URL+'#/home',{waitUntil:'load'}); await q.evaluate(()=>{ reset('seeded'); S.notif.devices=[]; save(); }); await q.waitForTimeout(200);
  await q.evaluate(()=>sheetProto()); await q.click('#sheet [data-act="sim-away"]'); await q.waitForTimeout(200);
  const h=await q.evaluate(()=>new Date(S.notif.outbox[0].at).getHours());
  t(`due at ${new Date(when).toLocaleTimeString('en-SG',{timeZone:'Asia/Singapore',hour:'numeric',minute:'2-digit'})} Singapore time → sent at ${want}:00-ish, never overnight`, h===want, 'hour '+h);
  await c2.close();
}

await b.close(); console.log(errs.length?'\nERRORS: '+errs.join('; '):'\nno page errors');
