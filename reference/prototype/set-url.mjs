// Usage: node set-url.mjs https://your-real-address.com
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const site = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(site)) { console.error('Give the full address, e.g. https://ramakrishna.dev'); process.exit(1); }
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? (f === 'node_modules' ? [] : walk(p)) : [p]; });
let n = 0;
for (const f of walk('.')) if (/\.(html|xml|txt)$/.test(f)) { const s = readFileSync(f, 'utf8'); if (s.includes('__SITE__')) { writeFileSync(f, s.replaceAll('__SITE__', site)); n++; } }
console.log('Updated ' + n + ' files to ' + site);
