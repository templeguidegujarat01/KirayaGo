// Verifies that every translation key used in the code exists in every locale file.
// Run: npm run check:i18n
import fs from 'fs'; import path from 'path';
import { OPTS, NEARBY_KINDS, AMENITY_GROUPS } from '../public/js/constants.js';
const root = new URL('../public/', import.meta.url).pathname;
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.(js|html)$/.test(f) && files.push(p); } })(root);
const used = new Set(); let src = '';
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8'); src += s;
  for (const m of s.matchAll(/\bt\(\s*'([^']+)'/g)) if (!/[._]$/.test(m[1])) used.add(m[1]);
  for (const m of s.matchAll(/data-i18n(?:-ph|-aria)?="([^"]+)"/g)) used.add(m[1]);
}
// Dynamic families
for (const [field, vals] of Object.entries(OPTS)) for (const v of vals) used.add(`opt.${field}.${v}`);
for (const k of NEARBY_KINDS) used.add(`nearby.${k}`);
for (const g of AMENITY_GROUPS) used.add(`agroup.${g}`);
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
for (const m of schema.matchAll(/\('([a-z_]+)','(?:appliances|furniture|building|outdoor)',\d+\)/g)) used.add(`amenity.${m[1]}`);
const lf = fs.readFileSync(path.join(root, 'js/listform.js'), 'utf8');
for (const m of lf.matchAll(/F\('[a-z]+\.([a-z_]+)'/g)) used.add(`f.${m[1]}`);
for (const m of lf.matchAll(/\{ k: '([a-z]+)'/g)) used.add(`step.${m[1]}`);
['car', 'bike'].forEach((v) => used.add(`s.parking_${v}`));
['type', 'size', 'decode'].forEach((v) => used.add(`form.err_img_${v}`));
let bad = 0;
for (const f of fs.readdirSync(path.join(root, 'locales')).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(root, 'locales', f), 'utf8'));
  const missing = [...used].filter((k) => !(k in d)).sort();
  const varsEn = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8'));
  const varMismatch = Object.keys(d).filter((k) => varsEn[k] && (varsEn[k].match(/\{\w+\}/g) || []).sort().join() !== (d[k].match(/\{\w+\}/g) || []).sort().join());
  console.log(`${f}: ${Object.keys(d).length} keys, ${missing.length} missing, ${varMismatch.length} placeholder mismatches`);
  if (missing.length) console.log('  missing:', missing.join(', '));
  if (varMismatch.length) console.log('  placeholders differ:', varMismatch.join(', '));
  bad += missing.length + varMismatch.length;
}
process.exit(bad ? 1 : 0);
