import { boot, $, $$, esc, t, tOpt, inr, propertyCard, groupStats, setMeta } from './ui.js';
import { sb, siteUrl } from './supabase.js';
import { OPTS, BUDGETS, AMENITY_GROUPS } from './constants.js';

const PAGE = 12;
const ARR = ['bhk', 'tenants', 'furnishing', 'parking', 'amenities', 'owner_lives', 'electricity', 'water', 'listing_by'];
let states = [], stats = [], amenities = [];

function parseUrl() {
  const seg = location.pathname.replace(/^\/rent\/?/, '').split('/').filter(Boolean);
  const q = new URLSearchParams(location.search);
  const f = { state: q.get('state') || seg[0] || '', city: q.get('city') || seg[1] || '', locality: q.get('locality') || seg[2] || '' };
  for (const k of ['min_rent', 'max_rent', 'type', 'max_deposit', 'min_bathrooms', 'occupants', 'metro_max_m', 'bus_max_m']) if (q.get(k)) f[k] = q.get(k);
  if (q.get('available_now')) f.available_now = true;
  for (const k of ARR) if (q.get(k)) f[k] = q.get(k).split(',').filter(Boolean);
  f.sort = q.get('sort') || 'newest'; f.page = Math.max(1, parseInt(q.get('page') || '1', 10) || 1);
  return f;
}
function toUrl(f) {
  const path = ['rent', f.state, f.state && f.city, f.state && f.city && f.locality].filter(Boolean).join('/');
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (['state', 'city', 'locality'].includes(k) || v == null || v === '' || v === false) continue;
    if (Array.isArray(v)) { if (v.length) q.set(k, v.join(',')); continue; }
    if (k === 'sort' && v === 'newest') continue;
    if (k === 'page' && v === 1) continue;
    q.set(k, v === true ? '1' : v);
  }
  return `/${path}/${q.toString() ? '?' + q : ''}`;
}
function toRpc(f) {
  const o = {};
  for (const [k, v] of Object.entries(f)) {
    if (['sort', 'page'].includes(k) || v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    o[k] = Array.isArray(v) ? (k === 'bhk' ? v.map(Number) : v) : v;
  }
  return o;
}
const checks = (name, values, selected = [], label) =>
  values.map((v) => `<label class="check"><input type="checkbox" name="${name}" value="${v}" ${selected.includes(String(v)) ? 'checked' : ''}> <span>${esc(label(v))}</span></label>`).join('');
const optHtml = (items, sel, anyLabel) => `<option value="">${anyLabel}</option>` + items.map((i) => `<option value="${i.slug}" ${i.slug === sel ? 'selected' : ''}>${esc(i.name)} (${i.count})</option>`).join('');

function readForm() {
  const fd = new FormData($('#fform'));
  const f = { state: fd.get('state') || '', city: fd.get('city') || '', locality: fd.get('locality') || '' };
  for (const k of ['min_rent', 'max_rent', 'type', 'max_deposit', 'min_bathrooms', 'occupants', 'metro_max_m', 'bus_max_m']) if (fd.get(k)) f[k] = fd.get(k);
  if (fd.get('available_now')) f.available_now = true;
  for (const k of ARR) { const v = fd.getAll(k); if (v.length) f[k] = v; }
  if (!f.state) { f.city = ''; f.locality = ''; } if (!f.city) f.locality = '';
  f.sort = $('#sort').value; f.page = 1;
  return f;
}
function fillLocation(f) {
  $('#f-state').innerHTML = `<option value="">${t('s.any_state')}</option>` + states.map((s) => `<option value="${s.slug}" ${s.slug === f.state ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const cities = groupStats(stats.filter((r) => r.state_slug === f.state), (r) => r.city_slug, (r) => ({ slug: r.city_slug, name: r.city }));
  $('#f-city').innerHTML = optHtml(cities, f.city, f.state && !cities.length ? t('s.no_listings_here') : t('s.any_city')); $('#f-city').disabled = !f.state;
  const areas = groupStats(stats.filter((r) => r.state_slug === f.state && r.city_slug === f.city), (r) => r.locality_slug, (r) => ({ slug: r.locality_slug, name: r.locality }));
  $('#f-area').innerHTML = optHtml(areas, f.locality, t('s.any_area')); $('#f-area').disabled = !f.city;
}
function buildForm(f) {
  fillLocation(f);
  $('#f-min').value = f.min_rent || ''; $('#f-max').value = f.max_rent || '';
  $('#presets').innerHTML = BUDGETS.map(([a, b]) => `<button type="button" class="chip" data-a="${a}" data-b="${b || ''}">${b ? `${inr(a)}–${inr(b)}` : `${inr(a)}+`}</button>`).join('');
  $('#g-bhk').innerHTML = checks('bhk', [1, 2, 3, 4], f.bhk, (n) => (n === 4 ? '4+' : n));
  $('#f-type').innerHTML = `<option value="">${t('s.any')}</option>` + OPTS.property_type.map((v) => `<option value="${v}" ${f.type === v ? 'selected' : ''}>${esc(tOpt('property_type', v))}</option>`).join('');
  $('#g-tenants').innerHTML = checks('tenants', OPTS.allowed_tenants, f.tenants, (v) => tOpt('allowed_tenants', v));
  $('#g-furnishing').innerHTML = checks('furnishing', OPTS.furnishing, f.furnishing, (v) => tOpt('furnishing', v));
  $('#g-parking').innerHTML = checks('parking', ['car', 'bike'], f.parking, (v) => t('s.parking_' + v));
  $('#g-amenities').innerHTML = amenities.map((a) => a.code).length ? checks('amenities', amenities.map((a) => a.code), f.amenities, (v) => t('amenity.' + v)) : '';
  $('#g-owner_lives').innerHTML = checks('owner_lives', OPTS.owner_lives, f.owner_lives, (v) => tOpt('owner_lives', v));
  $('#g-electricity').innerHTML = checks('electricity', OPTS.electricity_arrangement, f.electricity, (v) => tOpt('electricity_arrangement', v));
  $('#g-water').innerHTML = checks('water', OPTS.water_arrangement, f.water, (v) => tOpt('water_arrangement', v));
  $('#g-listing_by').innerHTML = checks('listing_by', OPTS.listing_by, f.listing_by, (v) => (v === 'owner' ? t('badge.direct_owner') : tOpt('listing_by', v)));
  const dist = (sel, cur) => { $(sel).innerHTML = `<option value="">${t('s.any')}</option>` + [500, 1000, 2000, 5000].map((m) => `<option value="${m}" ${String(cur) === String(m) ? 'selected' : ''}>${m < 1000 ? m + ' m' : m / 1000 + ' km'}</option>`).join(''); };
  dist('#f-metro', f.metro_max_m); dist('#f-bus', f.bus_max_m);
  $('#f-dep').value = f.max_deposit || ''; $('#f-bath').value = f.min_bathrooms || ''; $('#f-occ').value = f.occupants || '';
  $('#fform [name=available_now]').checked = !!f.available_now;
  $('#sort').value = f.sort;
  const adv = ['furnishing', 'parking', 'amenities', 'owner_lives', 'electricity', 'water', 'listing_by'].some((k) => f[k]?.length) || f.max_deposit || f.min_bathrooms || f.occupants || f.metro_max_m || f.bus_max_m || f.available_now;
  $('#adv').open = !!adv;
}
function activeCount(f) {
  return Object.entries(f).filter(([k, v]) => !['sort', 'page', 'state', 'city', 'locality'].includes(k) && v && !(Array.isArray(v) && !v.length)).length + (f.state ? 1 : 0);
}
const locName = (f) => {
  const r = stats.find((x) => x.state_slug === f.state && (!f.city || x.city_slug === f.city) && (!f.locality || x.locality_slug === f.locality));
  const st = states.find((s) => s.slug === f.state);
  return { state: r?.state || st?.name || '', city: f.city && r ? r.city : '', area: f.locality && r ? r.locality : '' };
};

async function run(f) {
  history.replaceState(null, '', toUrl(f));
  $('#fcount').textContent = activeCount(f) ? `(${activeCount(f)})` : '';
  const cards = $('#cards'), empty = $('#empty');
  cards.setAttribute('aria-busy', 'true'); cards.innerHTML = Array.from({ length: 6 }, () => '<div class="card skel"></div>').join('');
  const { data, error } = await sb.rpc('search_properties', { p_filters: toRpc(f), p_sort: f.sort, p_limit: PAGE, p_offset: (f.page - 1) * PAGE });
  cards.removeAttribute('aria-busy');
  if (error) { cards.innerHTML = ''; empty.hidden = false; empty.innerHTML = `<div class="notice err">${esc(error.message)}</div>`; return; }
  const total = data[0]?.total_count ?? 0;
  const ln = locName(f);
  const place = [ln.area, ln.city, ln.state].filter(Boolean).join(', ');
  $('#page-h1').textContent = place ? t('s.h1_in', { place }) : t('nav.find');
  $('#count').textContent = total ? t('s.results_count', { n: total }) : '';
  const noindex = !total || activeCount({ ...f, state: '' }) > 0 || f.page > 1;
  setMeta({
    title: place ? `${t('s.h1_in', { place })} | KirayaGo` : 'Houses & flats for rent in India | KirayaGo',
    description: place ? t('s.meta_in', { place }) : t('home.hero_sub'),
    canonical: siteUrl() + '/' + ['rent', f.state, f.state && f.city, f.state && f.city && f.locality].filter(Boolean).join('/') + '/',
    noindex,
  });
  if (!total) {
    cards.innerHTML = '';
    empty.hidden = false;
    const anyFilter = activeCount(f) - (f.state ? 1 : 0) > 0;
    empty.innerHTML = anyFilter
      ? `<div class="notice"><b>${t('empty.title')}</b><ul><li>${t('empty.tip_budget')}</li><li>${t('empty.tip_amenity')}</li><li>${t('empty.tip_area')}</li><li>${t('empty.tip_city')}</li></ul></div>`
      : `<div class="notice"><b>${t('empty.city')}</b><p><a class="btn accent" href="/list.html">${t('nav.list')}</a></p></div>`;
    $('#pager').innerHTML = ''; return;
  }
  empty.hidden = true;
  cards.innerHTML = data.map(propertyCard).join('');
  const pages = Math.ceil(total / PAGE);
  const go = (p) => `<button class="btn ghost small" data-page="${p}">`;
  $('#pager').innerHTML = pages > 1 ? `${f.page > 1 ? go(f.page - 1) + t('s.prev') + '</button>' : ''}<span>${t('s.page_of', { p: f.page, n: pages })}</span>${f.page < pages ? go(f.page + 1) + t('s.next') + '</button>' : ''}` : '';
  $$('#pager [data-page]').forEach((b) => b.addEventListener('click', () => { const nf = { ...f, page: +b.dataset.page }; run(nf); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
}

boot(async () => {
  const [s, st, am] = await Promise.all([
    sb.from('states').select('slug,name').order('name'),
    sb.from('location_stats').select('*').limit(1000),
    sb.from('amenities').select('code,grp,sort_order').order('grp').order('sort_order'),
  ]);
  states = s.data || []; stats = st.data || []; amenities = am.data || [];
  let f = parseUrl();
  buildForm(f);
  const panel = $('#filters');
  $('#open-filters').addEventListener('click', () => panel.classList.add('open'));
  $('#close-filters').addEventListener('click', () => panel.classList.remove('open'));
  $('#f-state').addEventListener('change', () => fillLocation({ state: $('#f-state').value, city: '', locality: '' }));
  $('#f-city').addEventListener('change', () => fillLocation({ state: $('#f-state').value, city: $('#f-city').value, locality: '' }));
  $('#presets').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $('#f-min').value = b.dataset.a; $('#f-max').value = b.dataset.b; });
  $('#fform').addEventListener('submit', (e) => { e.preventDefault(); panel.classList.remove('open'); f = readForm(); run(f); });
  $('#clear').addEventListener('click', () => { f = { state: '', city: '', locality: '', sort: 'newest', page: 1 }; buildForm(f); panel.classList.remove('open'); run(f); });
  $('#sort').addEventListener('change', () => { f = { ...readForm(), sort: $('#sort').value }; run(f); });
  await run(f);
});
