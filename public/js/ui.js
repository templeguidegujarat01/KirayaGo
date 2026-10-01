import { configured, sb, getUser, isAdmin, imgUrl } from './supabase.js';
import { OPTS } from './constants.js';
import { initI18n, t, tOpt, LANGS, getLang, setLang, applyStatic } from './i18n.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const inr = (n) => (n == null ? '' : '₹' + new Intl.NumberFormat('en-IN').format(n));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function toast(msg, kind = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = msg; box.append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 3500);
}
export const errMsg = (e) => (e?.message || String(e || '')).replace(/^.*?: /, (m) => (m.length < 30 ? '' : m));

export const LOGO = `<svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0B5D4B"/><path d="M12 32 32 14l20 18v18H38V38H26v12H12z" fill="#fff"/><circle cx="32" cy="29" r="4" fill="#E8590C"/></svg>`;

async function renderHeader() {
  const el = $('#site-header'); if (!el) return;
  const user = await getUser();
  const admin = user ? await isAdmin() : false;
  const opts = LANGS.map((l) => `<option value="${l.code}" ${l.code === getLang() ? 'selected' : ''}>${l.label}</option>`).join('');
  el.innerHTML = `<div class="wrap bar">
    <a class="brand" href="/" aria-label="KirayaGo">${LOGO}<span>Kiraya<b>Go</b></span></a>
    <nav class="nav" aria-label="Main">
      <a href="/rent/">${t('nav.find')}</a>
      <a href="/list.html" class="btn small accent">${t('nav.list')}</a>
      ${user ? `<a href="/dashboard.html">${t('nav.dashboard')}</a>${admin ? `<a href="/admin.html">${t('nav.admin')}</a>` : ''}<button class="linklike" id="logout">${t('nav.logout')}</button>`
             : `<a href="/login.html">${t('nav.login')}</a>`}
      <label class="sr" for="lang">${t('lang.label')}</label>
      <select id="lang" class="lang">${opts}</select>
    </nav></div>`;
  $('#lang').addEventListener('change', (e) => setLang(e.target.value));
  $('#logout')?.addEventListener('click', async () => { await sb.auth.signOut(); location.href = '/'; });
}
function renderFooter() {
  const el = $('#site-footer'); if (!el) return;
  el.innerHTML = `<div class="wrap foot">
    <div><a class="brand" href="/">${LOGO}<span>Kiraya<b>Go</b></span></a><p class="muted">${t('footer.tag')}</p></div>
    <div><a href="/rent/">${t('nav.find')}</a><br><a href="/list.html">${t('nav.list')}</a><br><a href="/login.html">${t('nav.login')}</a></div>
    <p class="muted small">${t('footer.note')}</p></div>`;
}

/** Page bootstrap: i18n, header/footer, config check, then page code. */
export async function boot(init) {
  await initI18n();
  await renderHeader(); renderFooter();
  if (!configured) {
    const main = $('main') || document.body;
    main.insertAdjacentHTML('afterbegin', `<div class="wrap"><div class="notice err"><b>Setup needed.</b> SUPABASE_URL and SUPABASE_ANON_KEY are not configured. See README.md → "Connect Supabase".</div></div>`);
    return;
  }
  try { await init(); } catch (e) { console.error(e); toast(errMsg(e), 'err'); }
}

export function setMeta({ title, description, canonical, image, noindex, jsonld }) {
  document.title = title;
  const set = (sel, attr, val, create) => {
    let el = document.head.querySelector(sel);
    if (!el && create) { el = create(); document.head.append(el); }
    if (el) el.setAttribute(attr, val);
  };
  const meta = (name, val, prop) => set(`meta[${prop ? 'property' : 'name'}="${name}"]`, 'content', val, () => { const m = document.createElement('meta'); m.setAttribute(prop ? 'property' : 'name', name); return m; });
  if (description) { meta('description', description); meta('og:description', description, true); }
  meta('og:title', title, true); meta('og:type', 'website', true); meta('og:site_name', 'KirayaGo', true);
  if (image) meta('og:image', image, true);
  if (canonical) { meta('og:url', canonical, true); set('link[rel="canonical"]', 'href', canonical, () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; }); }
  if (noindex) meta('robots', 'noindex,nofollow');
  if (jsonld) { const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(jsonld); document.head.append(s); }
}

export const badge = (text, cls = '') => `<span class="badge ${cls}">${esc(text)}</span>`;
export const postedByLabel = (v) => (v === 'owner' ? t('badge.direct_owner') : tOpt('listing_by', v));

export function tenantsText(arr = []) {
  const s = new Set(arr);
  if (s.has('family') && s.has('bachelors')) return [t('card.family_bachelor'), ...arr.filter((x) => !['family', 'bachelors'].includes(x)).map((x) => tOpt('allowed_tenants', x))].join(' · ');
  return arr.map((x) => tOpt('allowed_tenants', x)).join(' · ');
}
export function parkingText(p) {
  const bits = [];
  if (p.car_parking > 0) bits.push(t('card.cars', { n: p.car_parking }));
  if (p.bike_parking > 0) bits.push(t('card.bikes', { n: p.bike_parking }));
  return bits.length ? bits.join(', ') : t('card.no_parking');
}
export function availText(d) {
  if (!d || new Date(d) <= new Date()) return t('card.available_now');
  return t('card.available_from', { date: fmtDate(d) });
}

/** Reusable property card (search results). */
export function propertyCard(p) {
  const img = p.cover_thumb || p.cover_path;
  const alt = `${p.title || ''} — ${p.locality}, ${p.city}`;
  const area = p.builtup_area ? ` · ${Number(p.builtup_area)} ${tOpt('area_unit', p.area_unit)}` : '';
  return `<article class="card">
    <a class="card-img" href="/property/${p.id}" tabindex="-1" aria-hidden="true">
      ${img ? `<img src="${esc(imgUrl(img))}" alt="${esc(alt)}" loading="lazy" decoding="async" width="480" height="320">` : `<div class="noimg">${t('card.no_photo')}</div>`}
      <span class="badge ${p.listing_by === 'owner' ? 'green' : 'grey'} overlay">${esc(postedByLabel(p.listing_by))}</span>
    </a>
    <div class="card-body">
      <p class="price">${inr(p.monthly_rent)}<small>${t('card.per_month')}</small></p>
      <p class="sub">${p.bhk === 0 ? tOpt('property_type', p.property_type) : p.bhk + ' BHK'} · ${p.bathrooms ?? '–'} ${t('card.bath')}${area}</p>
      <h3><a href="/property/${p.id}">${esc(p.city)} · ${esc(p.locality)}</a></h3>
      <ul class="facts">
        <li><b>${t('card.deposit')}:</b> ${inr(p.security_deposit)}${p.maintenance_amount && !p.maintenance_included ? ` · ${t('card.maint')} ${inr(p.maintenance_amount)}` : ''}</li>
        <li>${esc(tOpt('furnishing', p.furnishing))} · ${esc(tenantsText(p.allowed_tenants))}</li>
        <li><b>${t('card.parking')}:</b> ${esc(parkingText(p))}</li>
        <li><b>${t('card.electricity')}:</b> ${esc(tOpt('electricity_arrangement', p.electricity_arrangement))}</li>
        <li><b>${t('card.owner')}:</b> ${esc(tOpt('owner_lives', p.owner_lives))}</li>
      </ul>
      <p class="avail">${esc(availText(p.available_from))}</p>
      <a class="btn full" href="/property/${p.id}">${t('card.view')}</a>
    </div></article>`;
}

/** Option list helper: <option> tags for a field. */
export const optionTags = (field, selected, withBlank) =>
  (withBlank ? `<option value="">${esc(withBlank)}</option>` : '') +
  (OPTS[field] || []).map((v) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${esc(tOpt(field, v))}</option>`).join('');

/** Aggregates location_stats rows: group by keys, summing listing_count. */
export function groupStats(rows, keyFn, labelFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const cur = m.get(k) || { ...labelFn(r), count: 0 };
    cur.count += r.listing_count; m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}
export { t, tOpt, applyStatic, imgUrl };
