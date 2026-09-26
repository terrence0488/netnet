import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch();
const ctx=await b.newContext({...devices['iPhone 13'], timezoneId:'Asia/Singapore'});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const hash=()=>p.evaluate(()=>location.hash);
const ev=()=>p.evaluate(()=>S.events.map(e=>e.name+(e.props.method?':'+e.props.method:'')));
/* "Start from an empty account (first-run)" in the PROTO sheet */
const fresh=async()=>{ await p.evaluate(()=>reset('empty')); await p.waitForTimeout(250); };

// ---- a fresh visit goes straight to Create your account; no landing page exists
await p.goto(URL,{waitUntil:'load'}); await fresh();
t('fresh account → straight to #/signup', await hash()==='#/signup', await hash());
t('no landing page in the prototype', !(await p.$('#s-landing')) && !(await p.evaluate(()=>S.events.some(e=>e.name==='landing_view'))));
const auth=await p.textContent('#s-auth');
t('sign-up asks for nothing but a way in', /Create your account/.test(auth) && /Continue with Google/.test(auth) && /Continue with Apple/.test(auth)
  && /Continue with email/.test(auth) && !/Where do you live|Totals in|closest to you/.test(auth));
t('no chrome on sign-up (no tab bar, no sidebar, no PROTO)', await p.evaluate(()=>document.getElementById('tabbar').classList.contains('hidden') && getComputedStyle(document.getElementById('devbtn')).display==='none'));

// ---- email path: email → set password → (verification sent) → onboarding → Home
await p.click('[data-act="auth-email"]'); await p.waitForTimeout(150);
t('empty email is refused inline', (await p.textContent('#s-auth')).includes('Enter an email address'));
await p.fill('#au-email','ana@example.com'); await p.click('[data-act="auth-email"]'); await p.waitForTimeout(250);
t('email → Set a password', await hash()==='#/signup/password' && (await p.textContent('#s-auth')).includes('Set a password'));
t('password field is a new-password field', await p.getAttribute('#au-pw','autocomplete')==='new-password');
await p.fill('#au-pw','short'); await p.click('[data-act="auth-create"]'); await p.waitForTimeout(150);
t('short password refused', (await p.textContent('#s-auth')).includes('at least 8'));
await p.fill('#au-pw','correct horse'); await p.click('[data-act="auth-reveal"]');
t('Show reveals the password', await p.getAttribute('#au-pw','type')==='text');
await p.click('[data-act="auth-create"]'); await p.waitForTimeout(250);
t('account created → onboarding step 1', await hash()==='#/welcome' && (await p.textContent('#s-auth')).includes('Where do you live?'));
t('the password is not stored anywhere', !(await p.evaluate(()=>localStorage.getItem('netnet-proto-v3')||JSON.stringify(S))).includes('correct horse'));
t('verification email sent, not blocking', (await p.textContent('#s-auth')).includes('sent a link to ana@example.com'));
t('region is inferred and shown for confirmation', (await p.textContent('#s-auth .choice')).includes('Singapore'));
t('totals currency follows the region', (await p.textContent('#s-auth .auth-ccy')).includes('SGD'));
t('Home is not reachable before onboarding', await (async()=>{ await p.evaluate(()=>{location.hash='#/home';}); await p.waitForTimeout(200); return await hash()==='#/welcome'; })());
await p.click('[data-act="ob-next"]'); await p.waitForTimeout(250);
t('step 2: segment, optional', await hash()==='#/welcome/2' && (await p.textContent('#s-auth')).includes('Which is closest to you?') && (await p.textContent('[data-act="ob-finish"]'))==='Skip');
await p.click('[data-act="ob-seg"][data-v="accumulating"]'); await p.waitForTimeout(100);
await p.click('[data-act="ob-finish"]'); await p.waitForTimeout(300);
t('segment → the intro screen', await hash()==='#/welcome/start');
await p.click('[data-act="ob-start"]'); await p.waitForTimeout(250);
t('segment → the basics, full screen, no chrome', await hash()==='#/basics' && (await p.textContent('#s-auth')).includes('Do you have money in a bank account?')
  && await p.evaluate(()=>document.getElementById('tabbar').classList.contains('hidden')));
t('Home is not reachable until the basics are done or left', await (async()=>{ await p.evaluate(()=>{location.hash='#/home';}); await p.waitForTimeout(200); return await hash()==='#/basics'; })());
await p.click('[data-act="guide-stop"]'); await p.waitForTimeout(300);
t('"Done for now" → Home', await hash()==='#/home');
const acc=await p.evaluate(()=>S.account);
t('account: SG pack, segment recorded, unverified', acc.region==='SG' && acc.pack==='sg' && acc.segment==='accumulating' && acc.verified===false && acc.onboarded===true, JSON.stringify({r:acc.region,p:acc.pack,s:acc.segment,v:acc.verified}));
t('events: signup_started:email → account_created:email → session_started', JSON.stringify(await ev())===JSON.stringify(['session_started','account_created:email','signup_started:email']), (await ev()).join(','));
t('auth screens are unreachable once in', await (async()=>{ await p.evaluate(()=>{location.hash='#/signup';}); await p.waitForTimeout(200); return await hash()==='#/home'; })());

// ---- connecting an agent: an unverified email meets the gate, and can resend the link
await p.evaluate(()=>{location.hash='#/agent';}); await p.waitForTimeout(200);
await p.click('[data-act="connect-start"][data-client="claude"]'); await p.waitForTimeout(200);
t('unverified → "Verify your email first"', (await p.textContent('#s-auth')).includes('Verify your email first'));
await p.click('[data-act="resend-verify"]'); await p.waitForTimeout(150);
t('resend the verification link', (await p.textContent('#s-auth')).includes('Sent again'));
await p.click('#s-auth .back'); await p.waitForTimeout(200);

// ---- log out → log in → onboarded? yes → Home
await p.evaluate(()=>{location.hash='#/account';}); await p.waitForTimeout(200);
await p.click('[data-act="logout"]'); await p.waitForTimeout(250);
t('log out → #/login with the email remembered', await hash()==='#/login' && await p.inputValue('#au-email')==='ana@example.com');
await p.fill('#au-pw',''); await p.click('[data-act="auth-login"]'); await p.waitForTimeout(150);
t('no password → refused', (await p.textContent('#s-auth')).includes('don’t match'));
await p.click('[data-act="auth-forgot"]'); await p.waitForTimeout(150);
t('forgot password confirms without revealing the account', (await p.textContent('#s-auth')).includes('If there’s an account for ana@example.com'));
await p.fill('#au-pw','anything1'); await p.press('#au-pw','Enter'); await p.waitForTimeout(300);
t('log in (onboarded) → Home, not onboarding', await hash()==='#/home');

// ---- signing up with an email that already has an account → log in instead
await p.evaluate(()=>{location.hash='#/account';}); await p.waitForTimeout(150);
await p.click('[data-act="logout"]'); await p.waitForTimeout(200);
await p.evaluate(()=>{location.hash='#/signup';}); await p.waitForTimeout(200);
await p.fill('#au-email','ANA@example.com'); await p.click('[data-act="auth-email"]'); await p.waitForTimeout(250);
t('existing email on sign-up → Log in, told why', await hash()==='#/login' && (await p.textContent('#s-auth')).includes('already have an account'));

// ---- provider path: Google → onboarding (verified, no password) ; resume onboarding on log-in
await fresh();
await p.click('[data-act="auth-provider"][data-v="google"]'); await p.waitForTimeout(300);
t('Google → straight to onboarding', await hash()==='#/welcome');
t('provider accounts are verified, with no verification notice', await p.evaluate(()=>S.account.verified===true) && !(await p.textContent('#s-auth')).includes('sent a link'));
t('events carry method google', (await ev()).includes('account_created:google') && (await ev()).includes('signup_started:google'));
// leave mid-onboarding, come back: "Completed onboarding? NO → onboarding"
await p.evaluate(()=>{ S.account.signedIn=false; save(); location.hash='#/login'; }); await p.waitForTimeout(250);
await p.click('[data-act="auth-provider"][data-v="google"]'); await p.waitForTimeout(300);
t('log in before finishing onboarding → back to onboarding', await hash()==='#/welcome');
t('logging in does not create a second account', (await ev()).filter(e=>e.startsWith('account_created')).length===1);

// ---- no region inferred: must choose, cannot skip
await p.evaluate(()=>{ localStorage.setItem('netnet-proto-locale','none'); S.signup={}; save(); }); await p.reload({waitUntil:'load'}); await p.waitForTimeout(250);
await p.click('[data-act="ob-next"]'); await p.waitForTimeout(150);
t('no guess → must choose where you live', (await p.textContent('#s-auth')).includes('Choose where you live') && await hash()==='#/welcome');
await p.selectOption('#ob-region','MY'); await p.waitForTimeout(150);
t('choosing Malaysia sets MYR totals', (await p.textContent('#s-auth .auth-ccy')).includes('MYR'));
await p.click('[data-act="ob-ccy-open"]'); await p.selectOption('#ob-ccy','USD');
await p.click('[data-act="ob-next"]'); await p.waitForTimeout(200); await p.click('[data-act="ob-finish"]'); await p.waitForTimeout(250);
await p.click('[data-act="ob-start"]'); await p.waitForTimeout(250);
await p.click('[data-act="guide-stop"]'); await p.waitForTimeout(250);
t('skip segment → basics → Home; currency override kept; segment unknown', await hash()==='#/home' && await p.evaluate(()=>S.settings.defaultCcy==='USD' && S.account.segment==='unknown' && S.account.region==='MY'));
await p.evaluate(()=>localStorage.removeItem('netnet-proto-locale'));

// ---- saved state from before this change still opens (signed in → onboarded)
await p.evaluate(()=>{ const st=JSON.parse(localStorage.getItem(LS)); delete st.account.onboarded; localStorage.setItem(LS, JSON.stringify(st)); });
await p.reload({waitUntil:'load'}); await p.waitForTimeout(250);
t('old saved state (no onboarded flag) opens Home', await hash()==='#/home');
t('no page errors', !errs.length, errs.join(' | '));
await b.close();
