/* Runs every prototype test and prints one line per suite. Exit code 1 if anything fails.
   Usage: node docs/02-prototype/tests/run.mjs [suite ...]   (default: all) */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
/* PASS/FAIL suites, then the audits, each with the line that means "clean". */
const SUITES = ['func','content','scroll','auth','geo','basics','agent','packs','back','skip','via',
  'ph','pc','fab','lc','filt','car'];
const AUDITS = [
  ['smoke', [], /NO ERRORS/],
  ['touch', [], / 0 undersized/],
  ['wide', [], /no errors/],
  ['ovf', ['iPhone 13'], /: 0 issues; page errors: none/],
  ['ovf', ['iPhone SE'], /: 0 issues; page errors: none/],
  ['ovf', ['desk'], /: 0 issues; page errors: none/]
];
const only = process.argv.slice(2);
let bad = 0;
for (const s of SUITES.filter(s => !only.length || only.includes(s))) {
  const r = spawnSync('node', [path.join(here, s + '.mjs')], { encoding:'utf8', timeout:300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const pass = (out.match(/^PASS/gm) || []).length, fail = (out.match(/^FAIL/gm) || []).length;
  const broke = r.status !== 0 || fail > 0 || pass === 0;
  if (broke) bad++;
  console.log(`${broke ? 'FAIL' : 'ok  '}  ${s.padEnd(8)} ${pass} passed, ${fail} failed`);
  if (broke) console.log(out.split('\n').filter(l => /^FAIL|Error/.test(l)).slice(0, 8).map(l => '        ' + l).join('\n'));
}
for (const [s, args, clean] of AUDITS.filter(([s]) => !only.length || only.includes(s))) {
  const r = spawnSync('node', [path.join(here, s + '.mjs'), ...args], { encoding:'utf8', timeout:300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0 && clean.test(out);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${(s + (args.length ? ' ' + args[0] : '')).padEnd(18)} ${ok ? 'clean' : ''}`);
  if (!ok) console.log(out.split('\n').filter(l => l.trim()).slice(-12).map(l => '        ' + l).join('\n'));
}
console.log(bad ? `\n${bad} failing` : '\nall clean');
process.exit(bad ? 1 : 0);
