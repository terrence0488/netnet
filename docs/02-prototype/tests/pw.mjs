/* Shared by every prototype test: Playwright (the project's own if installed, else this
   environment's global install), a folder for screenshots outside the repo, and a way to
   put a stand-in file into agents/ or connect/ without ever losing a real one. */
import os from 'os';
import fs from 'fs';
import path from 'path';

let pw;
try { pw = await import('playwright'); }
catch (e) { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
export const chromium = pw.chromium || pw.default.chromium;
export const devices = pw.devices || pw.default.devices;

export const shots = sub => {
  const d = path.join(process.env.SHOTS || path.join(os.tmpdir(), 'netnet-shots'), sub || '');
  fs.mkdirSync(d, { recursive:true });
  return d;
};

/* Puts `content` at `file` for the length of `fn`, then restores whatever was there. */
export async function withFile(file, content, fn) {
  const had = fs.existsSync(file), before = had ? fs.readFileSync(file) : null;
  fs.writeFileSync(file, content);
  try { return await fn(); }
  finally { had ? fs.writeFileSync(file, before) : fs.unlinkSync(file); }
}
export const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
