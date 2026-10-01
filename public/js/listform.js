import { boot, $, $$, esc, t, tOpt, inr, toast, errMsg, fmtDate, imgUrl } from './ui.js';
import { sb, requireUser, one } from './supabase.js';
import { OPTS, NEARBY_KINDS, AMENITY_GROUPS, MAX_PHOTOS } from './constants.js';
import { processImage } from './images.js';

// ---------------------------------------------------------------- state
let user, pid = null, status = 'draft', states = [], stats = [], amenityRows = [], images = [], step = 1, dirty = false;
const TOTAL = 12;
const today = () => new Date().toISOString().slice(0, 10);
const data = {
  location: { state: '', city: '', locality: '' },
  property: { listing_by: 'owner', has_hall: true, has_kitchen: true, area_unit: 'sqft', allowed_tenants: [], car_parking: 0, bike_parking: 0, maintenance_amount: 0, maintenance_included: false },
  rules: {}, utilities: {}, amenities: [], nearby: {}, contact: {}, private: {}, ui: {},
};
const getPath = (p) => p.split('.').reduce((o, k) => o?.[k], data);
const setPath = (p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), data)[last] = v; };

// ---------------------------------------------------------------- field specs
const F = (p, type, o = {}) => ({ p, type, ...o });
const is = (p, ...vals) => () => vals.includes(getPath(p));
const STEPS = [
  { k: 'location', fields: [
    F('location.state', 'select', { req: true, list: () => states.map((s) => ({ v: s.slug, label: s.name })) }),
    F('location.city', 'text', { req: true, max: 60, list: 'dl-city' }),
    F('location.locality', 'text', { req: true, max: 80, list: 'dl-area' }),
    F('property.pin_code', 'text', { max: 6, inputmode: 'numeric', pattern: /^[1-9][0-9]{5}$/ }),
    F('property.society_name', 'text', { max: 100 }),
    F('private.address_line', 'textarea', { max: 300 }) ] },
  { k: 'basics', fields: [
    F('property.listing_by', 'radio', { req: true }),
    F('property.property_type', 'select', { req: true }),
    F('property.furnishing', 'select', { req: true }),
    F('property.description', 'textarea', { max: 3000, rows: 5 }) ] },
  { k: 'rooms', fields: [
    F('property.bhk', 'number', { req: true, min: 0, max: 10 }),
    F('property.bedrooms', 'number', { min: 0, max: 20 }),
    F('property.bathrooms', 'number', { req: true, min: 0, max: 20 }),
    F('property.toilets', 'number', { min: 0, max: 20 }),
    F('property.has_hall', 'check'), F('property.has_kitchen', 'check'),
    F('property.balconies', 'number', { min: 0, max: 10 }),
    F('property.floor_no', 'number', { min: -2, max: 200 }),
    F('property.total_floors', 'number', { min: 0, max: 200 }),
    F('property.builtup_area', 'number', { req: true, min: 1, max: 99999999, step: 'any' }),
    F('property.carpet_area', 'number', { min: 1, max: 99999999, step: 'any' }),
    F('property.plot_area', 'number', { min: 1, max: 9999999999, step: 'any' }),
    F('property.area_unit', 'select', { req: true }) ] },
  { k: 'rent', fields: [
    F('property.monthly_rent', 'number', { req: true, min: 500, max: 10000000 }),
    F('property.security_deposit', 'number', { req: true, min: 0, max: 100000000 }),
    F('property.maintenance_amount', 'number', { min: 0, max: 1000000 }),
    F('property.maintenance_included', 'check'),
    F('property.other_recurring_amount', 'number', { min: 0, max: 1000000 }),
    F('property.other_recurring_note', 'text', { max: 200, showIf: () => Number(data.property.other_recurring_amount) > 0 }),
    F('property.one_time_amount', 'number', { min: 0, max: 10000000 }),
    F('property.one_time_note', 'text', { max: 200, showIf: () => Number(data.property.one_time_amount) > 0 }),
    F('property.rent_negotiable', 'select'),
    F('property.available_from', 'date', { req: true }),
    F('property.min_rental_months', 'number', { min: 1, max: 120 }) ] },
  { k: 'tenants', fields: [
    F('property.allowed_tenants', 'multi', { req: true }),
    F('property.max_occupants', 'number', { req: true, min: 1, max: 30 }),
    F('property.min_occupants', 'number', { min: 1, max: 30 }),
    F('rules.gender_preference', 'select'),
    F('rules.pets', 'select'), F('rules.pets_note', 'text', { max: 200, showIf: is('rules.pets', 'conditional') }),
    F('rules.visitors', 'select'), F('rules.visitors_note', 'text', { max: 200, showIf: is('rules.visitors', 'restricted', 'other') }),
    F('rules.cooking', 'select'), F('rules.cooking_note', 'text', { max: 200, showIf: is('rules.cooking', 'conditional') }),
    F('rules.smoking', 'select'),
    F('rules.curfew_time', 'text', { max: 100 }),
    F('rules.other_rules', 'textarea', { max: 1000 }) ] },
  { k: 'utilities', fields: [
    F('utilities.electricity_arrangement', 'select', { req: true, highlight: true }),
    F('utilities.electricity_billing', 'select', { showIf: is('utilities.electricity_arrangement', 'shared_meter', 'sub_meter'), highlight: true }),
    F('utilities.electricity_rate_per_unit', 'number', { min: 0, max: 100, step: '0.01', showIf: is('utilities.electricity_billing', 'submeter_usage') }),
    F('utilities.electricity_fixed_amount', 'number', { min: 0, max: 1000000, showIf: () => getPath('utilities.electricity_arrangement') === 'fixed_charge' || getPath('utilities.electricity_billing') === 'fixed_amount' }),
    F('utilities.electricity_note', 'textarea', { max: 500 }),
    F('utilities.water_source', 'select'),
    F('utilities.water_arrangement', 'select', { req: true }),
    F('utilities.water_shortage', 'select'),
    F('utilities.water_tank_note', 'text', { max: 200, showIf: is('utilities.water_source', 'tank', 'mixed') }),
    F('utilities.water_note', 'textarea', { max: 500 }),
    F('property.car_parking', 'number', { min: 0, max: 20 }), F('property.bike_parking', 'number', { min: 0, max: 50 }),
    F('property.parking_type', 'select', { showIf: () => Number(data.property.car_parking) + Number(data.property.bike_parking) > 0 }),
    F('property.parking_charge', 'number', { min: 0, max: 100000, showIf: () => Number(data.property.car_parking) + Number(data.property.bike_parking) > 0 }),
    F('property.parking_note', 'text', { max: 200, showIf: () => Number(data.property.car_parking) + Number(data.property.bike_parking) > 0 }) ] },
  { k: 'amenities', special: 'amenities', fields: [] },
  { k: 'owner', fields: [
    F('property.owner_lives', 'select', { req: true }),
    F('property.entrance', 'radio', { req: true }),
    F('property.owner_note', 'textarea', { max: 300 }) ] },
  { k: 'nearby', special: 'nearby', fields: [] },
  { k: 'photos', special: 'photos', fields: [] },
  { k: 'contact', fields: [
    F('contact.contact_name', 'text', { max: 80 }),
    F('contact.phone', 'text', { req: true, phone: true, inputmode: 'tel', max: 15 }),
    F('ui.wa_same', 'check'),
    F('contact.whatsapp', 'text', { phone: true, inputmode: 'tel', max: 15, showIf: () => !data.ui.wa_same }),
    F('contact.alt_phone', 'text', { inputmode: 'tel', max: 15, alt: true }) ] },
  { k: 'review', special: 'review', fields: [] },
];

// ---------------------------------------------------------------- rendering
const nameOf = (p) => p.split('.').pop();
const hasKey = (k) => t(k) !== k;
const idOf = (p) => 'fld-' + p.replace('.', '-');
function listOf(f) {
  const n = nameOf(f.p);
  if (typeof f.list === 'function') return f.list();
  return (OPTS[n] || []).map((v) => ({ v, label: tOpt(n, v) }));
}
function fieldHtml(f) {
  const n = nameOf(f.p), id = idOf(f.p), v = getPath(f.p);
  const label = t('f.' + n) + (f.req ? ' <span class="req" aria-hidden="true">*</span>' : '');
  const hint = hasKey('h.' + n) ? `<p class="hint" id="${id}-h">${esc(t('h.' + n))}</p>` : '';
  const desc = `aria-describedby="${id}-e${hint ? ` ${id}-h` : ''}"`;
  const req = f.req ? 'required aria-required="true"' : '';
  let input = '';
  switch (f.type) {
    case 'select':
      input = `<select id="${id}" data-p="${f.p}" ${req} ${desc}><option value="">${esc(t('common.choose'))}</option>${listOf(f).map((o) => `<option value="${esc(o.v)}" ${String(v) === o.v ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`; break;
    case 'radio':
      input = `<div class="checks inline" role="radiogroup">${listOf(f).map((o) => `<label class="check"><input type="radio" name="${id}" data-p="${f.p}" value="${o.v}" ${v === o.v ? 'checked' : ''}> <span>${esc(o.label)}</span></label>`).join('')}</div>`; break;
    case 'multi':
      input = `<div class="checks">${listOf(f).map((o) => `<label class="check"><input type="checkbox" data-p="${f.p}" data-multi value="${o.v}" ${(v || []).includes(o.v) ? 'checked' : ''}> <span>${esc(o.label)}</span></label>`).join('')}</div>`; break;
    case 'check':
      return `<div class="field" data-f="${f.p}"><label class="check"><input type="checkbox" id="${id}" data-p="${f.p}" ${v ? 'checked' : ''}> <span>${esc(t('f.' + n))}</span></label>${hint}</div>`;
    case 'textarea':
      input = `<textarea id="${id}" data-p="${f.p}" rows="${f.rows || 3}" maxlength="${f.max || 500}" ${desc}>${esc(v ?? '')}</textarea>`; break;
    case 'number':
      input = `<input id="${id}" type="number" data-p="${f.p}" inputmode="${f.step ? 'decimal' : 'numeric'}" min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step || 1}" value="${esc(v ?? '')}" ${req} ${desc}>`; break;
    case 'date':
      input = `<input id="${id}" type="date" data-p="${f.p}" value="${esc(v ?? '')}" ${req} ${desc}>`; break;
    default:
      input = `<input id="${id}" type="text" data-p="${f.p}" ${f.list ? `list="${f.list}" autocomplete="off"` : ''} inputmode="${f.inputmode || 'text'}" maxlength="${f.max || 100}" value="${esc(v ?? '')}" ${req} ${desc}>`;
  }
  const grouped = f.type === 'radio' || f.type === 'multi';
  return `<div class="field ${f.highlight ? 'hl-field' : ''}" data-f="${f.p}">${grouped ? `<fieldset><legend>${label}</legend>${input}</fieldset>` : `<label for="${id}">${label}</label>${input}`}${hint}<p class="ferr" id="${id}-e" role="alert"></p></div>`;
}
function applyVisibility() {
  const s = STEPS[step - 1];
  s.fields.forEach((f) => { const el = $(`[data-f="${f.p}"]`); if (el && f.showIf) el.hidden = !f.showIf(); });
}
function updateDatalists() {
  const st = data.location.state;
  const cities = [...new Set(stats.filter((r) => r.state_slug === st).map((r) => r.city))];
  const areas = [...new Set(stats.filter((r) => r.state_slug === st && r.city.toLowerCase() === (data.location.city || '').trim().toLowerCase()).map((r) => r.locality))];
  const dc = $('#dl-city'), da = $('#dl-area');
  if (dc) dc.innerHTML = cities.map((c) => `<option value="${esc(c)}">`).join('');
  if (da) da.innerHTML = areas.map((c) => `<option value="${esc(c)}">`).join('');
}

function autoTitle() {
  const p = data.property, ty = tOpt('property_type', p.property_type);
  return `${p.bhk === 0 || p.bhk === '' || p.bhk == null ? ty : `${p.bhk} BHK ${ty}`} ${t('form.for_rent_in')} ${data.location.locality}, ${data.location.city}`.slice(0, 120);
}
function requiredMissing() {
  const p = data.property, u = data.utilities, m = [];
  const chk = (ok, label, st) => { if (!ok) m.push({ label, st }); };
  chk(data.location.state && data.location.city && data.location.locality, t('f.city'), 1);
  chk(p.property_type, t('f.property_type'), 2); chk(p.furnishing, t('f.furnishing'), 2);
  chk(p.bhk !== '' && p.bhk != null, 'BHK', 3); chk(p.bathrooms !== '' && p.bathrooms != null, t('f.bathrooms'), 3); chk(p.builtup_area, t('f.builtup_area'), 3);
  chk(p.monthly_rent, t('f.monthly_rent'), 4); chk(p.security_deposit !== '' && p.security_deposit != null, t('f.security_deposit'), 4); chk(p.available_from, t('f.available_from'), 4);
  chk((p.allowed_tenants || []).length, t('f.allowed_tenants'), 5); chk(p.max_occupants, t('f.max_occupants'), 5);
  chk(u.electricity_arrangement, t('f.electricity_arrangement'), 6); chk(u.water_arrangement, t('f.water_arrangement'), 6);
  chk(p.owner_lives, t('f.owner_lives'), 8); chk(p.entrance, t('f.entrance'), 8);
  chk(images.length > 0, t('form.at_least_photo'), 10);
  chk(data.contact.phone, t('f.phone'), 11);
  return m;
}

function renderStep() {
  const s = STEPS[step - 1];
  $('#wiz-step').textContent = t('form.step_of', { n: step, total: TOTAL, name: t('step.' + s.k) });
  $('#wiz-progress').value = step;
  $('#step-title').textContent = t('step.' + s.k);
  $('#step-intro').textContent = hasKey('stepi.' + s.k) ? t('stepi.' + s.k) : '';
  $('#step-error').hidden = true;
  const body = $('#step-body');
  if (s.special === 'amenities') body.innerHTML = AMENITY_GROUPS.map((g) => {
    const rows = amenityRows.filter((a) => a.grp === g);
    return rows.length ? `<fieldset class="agroup"><legend>${t('agroup.' + g)}</legend><div class="checks">${rows.map((a) => `<label class="check"><input type="checkbox" data-amen value="${a.code}" ${data.amenities.includes(a.code) ? 'checked' : ''}> <span>${esc(t('amenity.' + a.code))}</span></label>`).join('')}</div></fieldset>` : '';
  }).join('');
  else if (s.special === 'nearby') body.innerHTML = `<p class="hint">${t('form.nearby_hint')}</p><div class="nearby-list">${NEARBY_KINDS.map((k) => {
    const n = data.nearby[k] || {};
    return `<div class="nrow"><label for="nb-${k}">${esc(t('nearby.' + k))}</label><input id="nb-${k}" data-nb="${k}" type="number" min="0" step="any" inputmode="decimal" value="${esc(n.value ?? '')}" placeholder="—"><select data-nbu="${k}" aria-label="${t('form.unit')}"><option value="km" ${n.unit !== 'm' ? 'selected' : ''}>km</option><option value="m" ${n.unit === 'm' ? 'selected' : ''}>m</option></select></div>`;
  }).join('')}</div>`;
  else if (s.special === 'photos') renderPhotos();
  else if (s.special === 'review') renderReview();
  else body.innerHTML = `<datalist id="dl-city"></datalist><datalist id="dl-area"></datalist>` + s.fields.map(fieldHtml).join('');
  applyVisibility(); updateDatalists();
  $('#back').hidden = step === 1;
  const last = step === TOTAL;
  $('#next').hidden = last;
  $('#save-exit').hidden = last;
  $('#step-title').focus({ preventScroll: true }); window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- validation
const phoneOk = (v) => { const d = String(v).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, ''); return /^[6-9]\d{9}$/.test(d); };
function validateStep() {
  const s = STEPS[step - 1]; let first = null;
  for (const f of s.fields) {
    const wrap = $(`[data-f="${f.p}"]`); if (!wrap || wrap.hidden) continue;
    const v = getPath(f.p), err = $('.ferr', wrap); let msg = '';
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (f.req && empty) msg = t('form.err_required');
    else if (!empty) {
      if (f.type === 'number') { const n = Number(v); if (Number.isNaN(n) || (f.min != null && n < f.min) || (f.max != null && n > f.max)) msg = t('form.err_range', { min: f.min, max: f.max }); }
      if (f.pattern && !f.pattern.test(String(v).trim())) msg = t('form.err_pin');
      if (f.phone && !phoneOk(v)) msg = t('form.err_phone');
      if (f.alt && !/^[0-9]{8,12}$/.test(String(v).replace(/\D/g, ''))) msg = t('form.err_phone');
      if (f.p === 'location.city' || f.p === 'location.locality') { const s2 = String(v).trim(); if (s2.length < 2 || /[<>{}\\|/]/.test(s2)) msg = t('form.err_text'); }
    }
    if (f.p === 'property.min_occupants' && !msg && v && data.property.max_occupants && Number(v) > Number(data.property.max_occupants)) msg = t('form.err_min_max');
    if (f.p === 'property.floor_no' && !msg && v !== '' && data.property.total_floors && Number(v) > Number(data.property.total_floors)) msg = t('form.err_floor');
    if (err) err.textContent = msg;
    const input = $('[data-p]', wrap); input?.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg && !first) first = input;
  }
  if (first) { first.focus(); return false; }
  return true;
}

// ---------------------------------------------------------------- saving
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === '' ? null : v]));
function payload() {
  const nearby = Object.entries(data.nearby).filter(([, n]) => n && n.value !== '' && n.value != null && Number(n.value) >= 0)
    .map(([kind, n]) => ({ kind, distance_m: Math.round(Number(n.value) * (n.unit === 'm' ? 1 : 1000)) }));
  const contact = { ...data.contact }; if (data.ui.wa_same) contact.whatsapp = contact.phone;
  const property = clean({ ...data.property, title: data.property.title || null });
  return { location: data.location, property, rules: clean(data.rules), utilities: clean(data.utilities), amenities: data.amenities, nearby, contact, private: data.private };
}
async function save({ quiet } = {}) {
  const { data: id, error } = await sb.rpc('save_property', { p_id: pid, p: payload() });
  if (error) throw error;
  pid = id; dirty = false;
  if (!new URLSearchParams(location.search).get('id')) history.replaceState(null, '', `/list.html?id=${pid}&step=${step}`);
  if (!quiet) toast(t('form.saved'));
}
function showStepError(e) { const b = $('#step-error'); b.textContent = errMsg(e); b.hidden = false; b.scrollIntoView({ block: 'nearest' }); }

// ---------------------------------------------------------------- photos
function renderPhotos() {
  const body = $('#step-body');
  if (!pid) { body.innerHTML = `<div class="notice">${t('form.photos_need_save')}</div>`; return; }
  body.innerHTML = `<p class="hint">${t('form.photos_hint', { max: MAX_PHOTOS })}</p>
    <div class="uploader">
      <label for="ph-cat">${t('form.photo_category')}</label><select id="ph-cat">${OPTS.image_category.map((c) => `<option value="${c}">${esc(tOpt('image_category', c))}</option>`).join('')}</select>
      <label class="btn accent" for="ph-file">＋ ${t('form.add_photos')}</label>
      <input id="ph-file" class="sr-file" type="file" accept="image/jpeg,image/png,image/webp" multiple>
      <p id="ph-status" class="muted" aria-live="polite"></p>
    </div><div id="ph-grid" class="photo-grid"></div>`;
  $('#ph-file').addEventListener('change', (e) => uploadFiles([...e.target.files], $('#ph-cat').value).then(() => (e.target.value = '')));
  drawGrid();
}
function drawGrid() {
  const g = $('#ph-grid'); if (!g) return;
  g.innerHTML = images.map((im, i) => `<figure class="ph" data-id="${im.id}">
    <img src="${esc(imgUrl(im.thumb_path || im.path))}" alt="${esc(im.alt_text || '')}" loading="lazy" width="200" height="150">
    ${im.is_primary ? `<span class="badge green overlay">${t('form.cover')}</span>` : ''}
    <select data-cat aria-label="${t('form.photo_category')}">${OPTS.image_category.map((c) => `<option value="${c}" ${c === im.category ? 'selected' : ''}>${esc(tOpt('image_category', c))}</option>`).join('')}</select>
    <div class="ph-actions">
      <button type="button" data-a="left" ${i === 0 ? 'disabled' : ''} aria-label="${t('form.move_left')}">◀</button>
      <button type="button" data-a="star" ${im.is_primary ? 'disabled' : ''} aria-label="${t('form.make_cover')}">★</button>
      <button type="button" data-a="right" ${i === images.length - 1 ? 'disabled' : ''} aria-label="${t('form.move_right')}">▶</button>
      <button type="button" data-a="del" class="danger" aria-label="${t('common.delete')}">🗑</button>
    </div></figure>`).join('') || `<p class="muted">${t('form.no_photos')}</p>`;
}
async function loadImages() {
  const { data: rows } = await sb.from('property_images').select('*').eq('property_id', pid).order('sort_order').order('created_at');
  images = (rows || []).sort((a, b) => (b.is_primary - a.is_primary) || a.sort_order - b.sort_order);
}
async function uploadFiles(files, category) {
  const st = $('#ph-status'); let ok = 0;
  for (const [i, file] of files.entries()) {
    if (images.length >= MAX_PHOTOS) { toast(t('form.max_photos', { max: MAX_PHOTOS }), 'err'); break; }
    st.textContent = t('form.uploading', { i: i + 1, n: files.length });
    try {
      const { full, thumb } = await processImage(file);
      const base = `${user.id}/${pid}/${crypto.randomUUID()}`;
      const path = `${base}.${full.ext}`, tpath = `${base}_t.${thumb.ext}`;
      const up1 = await sb.storage.from('property-images').upload(path, full.blob, { contentType: full.blob.type, cacheControl: '31536000' });
      if (up1.error) throw up1.error;
      const up2 = await sb.storage.from('property-images').upload(tpath, thumb.blob, { contentType: thumb.blob.type, cacheControl: '31536000' });
      if (up2.error) { await sb.storage.from('property-images').remove([path]); throw up2.error; }
      const row = { property_id: pid, path, thumb_path: tpath, category, is_primary: images.length === 0,
        alt_text: `${tOpt('image_category', category)} · ${data.location.locality}, ${data.location.city}`.slice(0, 200), sort_order: images.length };
      const { data: ins, error } = await sb.from('property_images').insert(row).select().single();
      if (error) { await sb.storage.from('property-images').remove([path, tpath]); throw error; }
      images.push(ins); ok++; drawGrid();
    } catch (e) {
      const key = { type: 'form.err_img_type', size: 'form.err_img_size', decode: 'form.err_img_decode' }[e.message];
      toast(`${file.name}: ${key ? t(key) : errMsg(e)}`, 'err');
    }
  }
  st.textContent = ok ? t('form.uploaded', { n: ok }) : '';
}
async function photoAction(id, a, sel) {
  const i = images.findIndex((x) => x.id === id), im = images[i]; if (!im) return;
  try {
    if (a === 'del') {
      if (!confirm(t('form.confirm_photo_delete'))) return;
      await sb.storage.from('property-images').remove([im.path, im.thumb_path].filter(Boolean));
      const { error } = await sb.from('property_images').delete().eq('id', id); if (error) throw error;
      images.splice(i, 1);
      if (im.is_primary && images[0]) { await sb.from('property_images').update({ is_primary: true }).eq('id', images[0].id); images[0].is_primary = true; }
    } else if (a === 'star') {
      await sb.from('property_images').update({ is_primary: false }).eq('property_id', pid).eq('is_primary', true);
      const { error } = await sb.from('property_images').update({ is_primary: true, sort_order: -1 }).eq('id', id); if (error) throw error;
      images.forEach((x) => (x.is_primary = x.id === id));
      images.sort((x, y) => (y.is_primary - x.is_primary) || x.sort_order - y.sort_order);
    } else if (a === 'left' || a === 'right') {
      const j = a === 'left' ? i - 1 : i + 1; if (j < 0 || j >= images.length) return;
      [images[i], images[j]] = [images[j], images[i]];
    } else if (a === 'cat') {
      const { error } = await sb.from('property_images').update({ category: sel, alt_text: `${tOpt('image_category', sel)} · ${data.location.locality}, ${data.location.city}`.slice(0, 200) }).eq('id', id); if (error) throw error;
      im.category = sel; return;
    }
    // normalise order (cover first) and persist
    await Promise.all(images.map((x, n) => (x.sort_order === n ? null : (x.sort_order = n, sb.from('property_images').update({ sort_order: n }).eq('id', x.id)))).filter(Boolean));
  } catch (e) { toast(errMsg(e), 'err'); await loadImages(); }
  drawGrid();
}

// ---------------------------------------------------------------- review & publish
function renderReview() {
  const p = data.property, l = data.location, u = data.utilities;
  if (!p.title) p.title = autoTitle();
  const miss = requiredMissing();
  const stateName = states.find((s) => s.slug === l.state)?.name || l.state;
  const live = ['published', 'rented', 'unavailable', 'pending_review', 'suspended'].includes(status);
  $('#step-body').innerHTML = `
    <div class="field"><label for="fld-title">${t('f.title')}</label><input id="fld-title" data-p="property.title" maxlength="120" value="${esc(p.title)}"><p class="hint">${t('h.title')}</p></div>
    ${miss.length ? `<div class="notice err"><b>${t('form.missing')}</b><ul>${miss.map((m) => `<li>${esc(m.label)} — <button type="button" class="linklike" data-goto="${m.st}">${t('form.go_to_step', { n: m.st })}</button></li>`).join('')}</ul></div>` : `<div class="notice ok">${t('form.ready')}</div>`}
    <dl class="kvs review">
      <div class="kv"><dt>${t('f.city')}</dt><dd>${esc(l.locality)}, ${esc(l.city)}, ${esc(stateName)}</dd></div>
      <div class="kv"><dt>${t('f.property_type')}</dt><dd>${esc(tOpt('property_type', p.property_type))} · ${p.bhk ?? '–'} BHK · ${esc(tOpt('furnishing', p.furnishing))}</dd></div>
      <div class="kv"><dt>${t('prop.costs')}</dt><dd>${inr(p.monthly_rent)}${t('card.per_month')} · ${t('prop.deposit')} ${inr(p.security_deposit)} · ${t('prop.maintenance')} ${p.maintenance_included ? t('prop.included') : inr(p.maintenance_amount || 0)}</dd></div>
      <div class="kv"><dt>${t('prop.tenants')}</dt><dd>${(p.allowed_tenants || []).map((x) => tOpt('allowed_tenants', x)).join(', ')} · max ${p.max_occupants ?? '–'}</dd></div>
      <div class="kv"><dt>${t('prop.owner_arr')}</dt><dd>${esc(tOpt('owner_lives', p.owner_lives))} · ${esc(tOpt('entrance', p.entrance))}</dd></div>
      <div class="kv"><dt>${t('prop.electricity')}</dt><dd>${esc(tOpt('electricity_arrangement', u.electricity_arrangement))}</dd></div>
      <div class="kv"><dt>${t('prop.water')}</dt><dd>${esc(tOpt('water_arrangement', u.water_arrangement))}</dd></div>
      <div class="kv"><dt>${t('prop.photos')}</dt><dd>${images.length}</dd></div>
    </dl>
    <div class="wiz-final">
      ${pid ? `<a class="btn ghost" href="/property/${pid}" target="_blank" rel="noopener">${t('form.preview')}</a>` : ''}
      <button type="button" class="btn ghost" id="save-draft">${t(live ? 'form.save_changes' : 'form.save_draft')}</button>
      ${live && status !== 'suspended' ? '' : `<button type="button" class="btn accent big" id="publish" ${miss.length ? 'disabled' : ''}>${t('form.publish')}</button>`}
    </div>`;
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => { step = +b.dataset.goto; renderStep(); }));
  $('#save-draft').addEventListener('click', async () => { try { await save(); location.href = '/dashboard.html'; } catch (e) { showStepError(e); } });
  $('#publish')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await save({ quiet: true });
      const { data: st, error } = await sb.rpc('set_property_status', { p_id: pid, p_status: 'published' });
      if (error) throw error;
      $('#wizard').hidden = true; const d = $('#done'); d.hidden = false;
      d.innerHTML = `<h2>${st === 'pending_review' ? t('form.sent_review') : t('form.published')}</h2><p><a class="btn" href="/property/${pid}">${t('dash.view')}</a> <a class="btn ghost" href="/dashboard.html">${t('nav.dashboard')}</a></p>`;
      d.focus?.(); window.scrollTo({ top: 0 });
    } catch (err) { showStepError(err); e.target.disabled = false; }
  });
}

// ---------------------------------------------------------------- load existing
async function loadExisting(id) {
  const { data: p, error } = await sb.from('properties')
    .select('*, locations(*), property_rules(*), property_utilities(*), property_amenities(amenity_code), property_nearby(*), property_contacts(*), property_private(*), property_owners!inner(owner_id)')
    .eq('id', id).eq('property_owners.owner_id', user.id).maybeSingle();
  if (error) throw error;
  if (!p) { toast(t('form.not_yours'), 'err'); setTimeout(() => (location.href = '/dashboard.html'), 1200); return false; }
  pid = p.id; status = p.status;
  const l = p.locations; data.location = { state: l.state_slug, city: l.city, locality: l.locality };
  const skip = new Set(['locations', 'property_rules', 'property_utilities', 'property_amenities', 'property_nearby', 'property_contacts', 'property_private', 'property_owners', 'location_id', 'id', 'status', 'builtup_sqft', 'is_featured', 'published_at', 'created_at', 'updated_at']);
  data.property = Object.fromEntries(Object.entries(p).filter(([k]) => !skip.has(k)).map(([k, v]) => [k, v ?? '']));
  data.property.allowed_tenants = p.allowed_tenants || [];
  const strip = (o) => Object.fromEntries(Object.entries(one(o) || {}).filter(([k, v]) => k !== 'property_id').map(([k, v]) => [k, v ?? '']));
  data.rules = strip(p.property_rules); data.utilities = strip(p.property_utilities);
  data.contact = strip(p.property_contacts); data.private = strip(p.property_private);
  data.ui.wa_same = !!data.contact.phone && data.contact.phone === data.contact.whatsapp;
  data.amenities = (p.property_amenities || []).map((a) => a.amenity_code);
  data.nearby = Object.fromEntries((p.property_nearby || []).map((n) => [n.kind, n.distance_m >= 1000 ? { value: +(n.distance_m / 1000).toFixed(2), unit: 'km' } : { value: n.distance_m, unit: 'm' }]));
  await loadImages();
  return true;
}

// ---------------------------------------------------------------- wiring
boot(async () => {
  user = await requireUser();
  const [s, st, am] = await Promise.all([
    sb.from('states').select('slug,name').order('name'),
    sb.from('location_stats').select('*').limit(1000),
    sb.from('amenities').select('code,grp,sort_order').order('grp').order('sort_order'),
  ]);
  states = s.data || []; stats = st.data || []; amenityRows = am.data || [];
  const q = new URLSearchParams(location.search);
  if (q.get('id')) { if (!(await loadExisting(q.get('id')))) return; step = Math.min(TOTAL, Math.max(1, parseInt(q.get('step') || '1', 10) || 1)); }
  else { const { data: prof } = await sb.from('profiles').select('full_name,account_type').eq('id', user.id).maybeSingle();
    if (prof?.account_type) data.property.listing_by = prof.account_type;
    if (prof?.full_name) data.contact.contact_name = prof.full_name;
    data.property.available_from = today(); }
  renderStep();

  const form = $('#wizard');
  form.addEventListener('input', (e) => {
    const el = e.target; dirty = true;
    if (el.dataset.p) {
      let v;
      if (el.type === 'checkbox' && el.dataset.multi !== undefined) v = $$(`input[data-p="${el.dataset.p}"]:checked`).map((x) => x.value);
      else if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'radio') v = el.value;
      else if (el.type === 'number') v = el.value === '' ? '' : Number(el.value);
      else v = el.value;
      setPath(el.dataset.p, v);
      if (el.dataset.p === 'location.state' || el.dataset.p === 'location.city') updateDatalists();
      applyVisibility();
    } else if (el.dataset.amen) data.amenities = $$('input[data-amen]:checked').map((x) => x.value);
    else if (el.dataset.nb) (data.nearby[el.dataset.nb] ??= { unit: 'km' }).value = el.value === '' ? '' : Number(el.value);
    else if (el.dataset.nbu) (data.nearby[el.dataset.nbu] ??= { value: '' }).unit = el.value;
  });
  form.addEventListener('change', (e) => {
    if (e.target.dataset.cat !== undefined) photoAction(e.target.closest('.ph').dataset.id, 'cat', e.target.value);
    if (e.target.dataset.p === 'property.title') dirty = true;
  });
  $('#step-body').addEventListener('click', (e) => { const b = e.target.closest('.ph-actions button'); if (b) photoAction(b.closest('.ph').dataset.id, b.dataset.a); });
  $('#back').addEventListener('click', () => { step = Math.max(1, step - 1); renderStep(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    const btn = $('#next'); btn.disabled = true;
    try { if (step !== 10 && step !== 12) await save({ quiet: true }); else if (!pid) throw new Error(t('form.photos_need_save')); step = Math.min(TOTAL, step + 1); renderStep(); }
    catch (err) { showStepError(err); } finally { btn.disabled = false; }
  });
  $('#save-exit').addEventListener('click', async () => {
    if (step <= 1 && !validateStep()) return;
    try { if (!$('[data-f]') || validateSoft()) await save(); location.href = '/dashboard.html'; } catch (err) { showStepError(err); }
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
});
// "Save & finish later" needs at least a location to create the draft.
function validateSoft() { const l = data.location; if (!l.state || !l.city || !l.locality) { showStepError(new Error(t('form.need_location'))); step = 1; renderStep(); return false; } return true; }
