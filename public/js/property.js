import { boot, $, $$, esc, t, tOpt, inr, fmtDate, toast, errMsg, setMeta, badge, postedByLabel, tenantsText, availText, imgUrl } from './ui.js';
import { sb, siteUrl, one, getUser } from './supabase.js';
import { OPTS, NEARBY_KINDS, AMENITY_GROUPS } from './constants.js';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const row = (label, value) => (value == null || value === '' ? '' : `<div class="kv"><dt>${esc(label)}</dt><dd>${value}</dd></div>`);
const section = (id, title, body, cls = '') => (body.trim() ? `<section class="sec ${cls}" id="${id}"><h2>${esc(title)}</h2>${body}</section>` : '');
const dist = (m) => (m < 1000 ? `${m} m` : `${+(m / 1000).toFixed(1)} km`);

function costs(p) {
  const maint = p.maintenance_included ? t('prop.included') : p.maintenance_amount ? inr(p.maintenance_amount) + t('card.per_month') : t('prop.none');
  const total = p.monthly_rent + (p.maintenance_included ? 0 : p.maintenance_amount || 0) + (p.other_recurring_amount || 0);
  return `<div class="cost-grid">
      <div class="cost big"><span>${t('prop.rent')}</span><b>${inr(p.monthly_rent)}</b><small>${t('card.per_month')}</small></div>
      <div class="cost"><span>${t('prop.deposit')}</span><b>${inr(p.security_deposit)}</b></div>
      <div class="cost"><span>${t('prop.maintenance')}</span><b>${maint}</b></div>
      <div class="cost"><span>${t('prop.other_charges')}</span><b>${p.other_recurring_amount ? inr(p.other_recurring_amount) + t('card.per_month') : t('prop.none')}</b>${p.other_recurring_note ? `<small>${esc(p.other_recurring_note)}</small>` : ''}</div>
    </div>
    <dl class="kvs">${row(t('prop.one_time'), p.one_time_amount ? `${inr(p.one_time_amount)}${p.one_time_note ? ' — ' + esc(p.one_time_note) : ''}` : '')}
      ${row(t('f.rent_negotiable'), p.rent_negotiable ? esc(tOpt('rent_negotiable', p.rent_negotiable)) : '')}
      ${row(t('f.min_rental_months'), p.min_rental_months ? t('prop.months', { n: p.min_rental_months }) : '')}</dl>
    <p class="total">${t('prop.monthly_total')}: <b>${inr(total)}</b> <small>${t('prop.total_note')}</small></p>`;
}

function electricity(u) {
  if (!u) return '';
  let body = `<p class="hl">${esc(tOpt('electricity_arrangement', u.electricity_arrangement) || t('prop.not_specified'))}</p><dl class="kvs">`;
  body += row(t('f.electricity_billing'), u.electricity_billing ? esc(tOpt('electricity_billing', u.electricity_billing)) : '');
  body += row(t('f.electricity_rate_per_unit'), u.electricity_rate_per_unit != null ? `₹${u.electricity_rate_per_unit} / ${t('prop.unit')}` : '');
  body += row(t('f.electricity_fixed_amount'), u.electricity_fixed_amount != null ? inr(u.electricity_fixed_amount) + t('card.per_month') : '');
  body += `</dl>${u.electricity_note ? `<p class="note">${esc(u.electricity_note)}</p>` : ''}`;
  if (['shared_meter', 'sub_meter'].includes(u.electricity_arrangement)) body += `<p class="hint">${t('prop.elec_hint')}</p>`;
  return body;
}
function water(u) {
  if (!u) return '';
  return `<dl class="kvs">${row(t('f.water_source'), u.water_source ? esc(tOpt('water_source', u.water_source)) : '')}
    ${row(t('f.water_arrangement'), u.water_arrangement ? esc(tOpt('water_arrangement', u.water_arrangement)) : '')}
    ${row(t('f.water_shortage'), u.water_shortage ? esc(tOpt('water_shortage', u.water_shortage)) : '')}
    ${row(t('f.water_tank_note'), esc(u.water_tank_note))}</dl>${u.water_note ? `<p class="note">${esc(u.water_note)}</p>` : ''}`;
}

function render(p, meta) {
  const loc = p.locations, u = one(p.property_utilities), r = one(p.property_rules);
  const imgs = [...(p.property_images || [])].sort((a, b) => (b.is_primary - a.is_primary) || a.sort_order - b.sort_order);
  const amen = (p.property_amenities || []).map((a) => a.amenity_code);
  const nearby = [...(p.property_nearby || [])].sort((a, b) => a.distance_m - b.distance_m);
  const typeBhk = p.bhk === 0 ? tOpt('property_type', p.property_type) : `${p.bhk} BHK ${tOpt('property_type', p.property_type)}`;
  const gallery = imgs.length ? `<div class="gallery" role="region" aria-roledescription="carousel" aria-label="${t('prop.photos')}">
      <div class="slides" id="slides" tabindex="0">${imgs.map((i, n) => `<figure class="slide"><img src="${esc(imgUrl(i.path))}" alt="${esc(i.alt_text || `${tOpt('image_category', i.category)} — ${p.title}`)}" ${n ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"><figcaption>${esc(tOpt('image_category', i.category))}</figcaption></figure>`).join('')}</div>
      ${imgs.length > 1 ? `<button class="g-btn prev" id="g-prev" aria-label="${t('prop.prev_photo')}">‹</button><button class="g-btn next" id="g-next" aria-label="${t('prop.next_photo')}">›</button><span class="g-count" id="g-count">1 / ${imgs.length}</span>` : ''}
    </div>
    ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((i, n) => `<button data-n="${n}" aria-label="${t('prop.photo_n', { n: n + 1 })}"><img src="${esc(imgUrl(i.thumb_path || i.path))}" alt="" loading="lazy" width="80" height="60"></button>`).join('')}</div>` : ''}`
    : `<div class="noimg tall">${t('card.no_photo')}</div>`;

  const details = `<dl class="kvs">
    ${row(t('f.property_type'), esc(tOpt('property_type', p.property_type)))}${row('BHK', p.bhk != null ? p.bhk : '')}
    ${row(t('f.bedrooms'), p.bedrooms)}${row(t('f.bathrooms'), p.bathrooms)}${row(t('f.toilets'), p.toilets)}
    ${row(t('f.has_hall'), p.has_hall ? t('common.yes') : t('common.no'))}${row(t('f.has_kitchen'), p.has_kitchen ? t('common.yes') : t('common.no'))}
    ${row(t('f.balconies'), p.balconies)}
    ${row(t('f.floor_no'), p.floor_no != null ? `${p.floor_no}${p.total_floors ? ' / ' + p.total_floors : ''}` : '')}
    ${row(t('f.builtup_area'), p.builtup_area ? `${+p.builtup_area} ${tOpt('area_unit', p.area_unit)}` : '')}
    ${row(t('f.carpet_area'), p.carpet_area ? `${+p.carpet_area} ${tOpt('area_unit', p.area_unit)}` : '')}
    ${row(t('f.plot_area'), p.plot_area ? `${+p.plot_area} ${tOpt('area_unit', p.area_unit)}` : '')}
    ${row(t('f.furnishing'), esc(tOpt('furnishing', p.furnishing)))}
    ${row(t('f.society_name'), esc(p.society_name))}</dl>`;

  const tenants = `<p class="hl">${esc(tenantsText(p.allowed_tenants))}</p><dl class="kvs">
    ${row(t('f.max_occupants'), p.max_occupants)}${row(t('f.min_occupants'), p.min_occupants)}
    ${row(t('f.gender_preference'), r?.gender_preference && r.gender_preference !== 'any' ? esc(tOpt('gender_preference', r.gender_preference)) : r?.gender_preference ? esc(tOpt('gender_preference', 'any')) : '')}</dl>`;

  const owner = `<p class="hl">${esc(tOpt('owner_lives', p.owner_lives))}</p><dl class="kvs">${row(t('f.entrance'), esc(tOpt('entrance', p.entrance)))}</dl>${p.owner_note ? `<p class="note">${esc(p.owner_note)}</p>` : ''}`;

  const parking = `<p class="hl">${(p.car_parking || p.bike_parking) ? [p.car_parking ? t('card.cars', { n: p.car_parking }) : '', p.bike_parking ? t('card.bikes', { n: p.bike_parking }) : ''].filter(Boolean).join(', ') : t('card.no_parking')}</p><dl class="kvs">
    ${row(t('f.parking_type'), p.parking_type ? esc(tOpt('parking_type', p.parking_type)) : '')}
    ${row(t('f.parking_charge'), p.parking_charge ? inr(p.parking_charge) + t('card.per_month') : '')}</dl>${p.parking_note ? `<p class="note">${esc(p.parking_note)}</p>` : ''}`;

  const amenBody = AMENITY_GROUPS.map((g) => {
    const items = amen.filter((c) => window.__amenGroup?.[c] === g);
    return items.length ? `<h3>${t('agroup.' + g)}</h3><ul class="tags">${items.map((c) => `<li>${esc(t('amenity.' + c))}</li>`).join('')}</ul>` : '';
  }).join('');

  const nearBody = nearby.length ? `<ul class="near">${nearby.map((n) => `<li><span>${esc(t('nearby.' + n.kind))}</span><b>${dist(n.distance_m)}</b></li>`).join('')}</ul><p class="hint">${t('prop.near_note')}</p>` : '';

  const rules = r ? `<dl class="kvs">
    ${row(t('f.pets'), r.pets ? esc(tOpt('pets', r.pets)) + (r.pets_note ? ` — ${esc(r.pets_note)}` : '') : '')}
    ${row(t('f.visitors'), r.visitors ? esc(tOpt('visitors', r.visitors)) + (r.visitors_note ? ` — ${esc(r.visitors_note)}` : '') : '')}
    ${row(t('f.cooking'), r.cooking ? esc(tOpt('cooking', r.cooking)) + (r.cooking_note ? ` — ${esc(r.cooking_note)}` : '') : '')}
    ${row(t('f.smoking'), r.smoking ? esc(tOpt('smoking', r.smoking)) : '')}
    ${row(t('f.curfew_time'), esc(r.curfew_time))}</dl>${r.other_rules ? `<p class="note">${esc(r.other_rules)}</p>` : ''}` : '';

  const own = p.status !== 'published'
    ? `<div class="notice">${t('prop.not_public', { status: tOpt('status', p.status) })} <a href="/dashboard.html">${t('nav.dashboard')}</a></div>` : '';

  $('#prop').innerHTML = `${own}
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/rent/">${t('nav.find')}</a> › <a href="/rent/${loc.state_slug}/">${esc(loc.state)}</a> › <a href="/rent/${loc.state_slug}/${loc.city_slug}/">${esc(loc.city)}</a> › <span>${esc(loc.locality)}</span></nav>
    <div class="prop-grid">
      <div class="prop-main">
        ${gallery}
        <header class="prop-head">
          <div>${badge(postedByLabel(p.listing_by), p.listing_by === 'owner' ? 'green' : 'grey')} ${p.status === 'rented' ? badge(tOpt('status', 'rented'), 'red') : badge(availText(p.available_from), 'blue')}</div>
          <h1>${esc(p.title)}</h1>
          <p class="muted">${esc(typeBhk)} · ${esc(loc.locality)}, ${esc(loc.city)}, ${esc(loc.state)}${p.pin_code ? ' – ' + esc(p.pin_code) : ''}</p>
        </header>
        ${section('costs', t('prop.costs'), costs(p), 'costs')}
        ${section('tenants', t('prop.tenants'), tenants)}
        ${section('owner', t('prop.owner_arr'), owner, 'key')}
        ${section('electricity', t('prop.electricity'), electricity(u), 'key')}
        ${section('water', t('prop.water'), water(u))}
        ${section('parking', t('prop.parking'), parking)}
        ${section('details', t('prop.details'), details)}
        ${section('amenities', t('prop.amenities'), amenBody)}
        ${section('nearby', t('prop.nearby'), nearBody)}
        ${section('rules', t('prop.rules'), rules)}
        ${p.description ? section('about', t('prop.about'), `<p class="desc">${esc(p.description)}</p>`) : ''}
        ${section('location', t('prop.location'), `<p>${esc(loc.locality)}, ${esc(loc.city)}, ${esc(loc.state)}${p.pin_code ? ' – ' + esc(p.pin_code) : ''}</p><p class="hint">${t('prop.location_note')}</p>`)}
      </div>
      <aside class="prop-side">
        <div class="side-card">
          <p class="price">${inr(p.monthly_rent)}<small>${t('card.per_month')}</small></p>
          <p class="muted">${t('prop.deposit')}: ${inr(p.security_deposit)}</p>
          <button class="btn full big" id="show-contact">${t('contact.show')}</button>
          <div id="contact-out" aria-live="polite"></div>
          <button class="linklike report" id="report-btn">⚑ ${t('report.title')}</button>
        </div>
        <div class="side-card trust">
          <h3>${t('trust.title')}</h3>
          <ul>
            <li>${esc(postedByLabel(p.listing_by))}</li>
            ${meta?.email_verified ? `<li>✓ ${t('trust.email_verified')}</li>` : ''}
            <li>${t('trust.listed')}: ${fmtDate(p.published_at || p.created_at)}</li>
            <li>${t('trust.updated')}: ${fmtDate(p.updated_at)}</li>
            ${meta?.member_since ? `<li>${t('trust.member_since')}: ${fmtDate(meta.member_since)}</li>` : ''}
          </ul>
          <p class="hint">${t('trust.note')}</p>
        </div>
      </div>
    </div>`;

  const bar = $('#contact-bar');
  bar.hidden = false;
  bar.innerHTML = `<div><b>${inr(p.monthly_rent)}</b><small>${t('card.per_month')}</small></div><button class="btn" id="show-contact-2">${t('contact.show')}</button>`;

  // gallery behaviour
  const slides = $('#slides');
  if (slides && imgs.length > 1) {
    const go = (n) => slides.scrollTo({ left: n * slides.clientWidth, behavior: 'smooth' });
    $('#g-prev').addEventListener('click', () => go(Math.max(0, Math.round(slides.scrollLeft / slides.clientWidth) - 1)));
    $('#g-next').addEventListener('click', () => go(Math.min(imgs.length - 1, Math.round(slides.scrollLeft / slides.clientWidth) + 1)));
    slides.addEventListener('scroll', () => { $('#g-count').textContent = `${Math.round(slides.scrollLeft / slides.clientWidth) + 1} / ${imgs.length}`; }, { passive: true });
    slides.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') $('#g-next').click(); if (e.key === 'ArrowLeft') $('#g-prev').click(); });
    $$('.thumbs button').forEach((b) => b.addEventListener('click', () => go(+b.dataset.n)));
  }

  // contact — only for logged-in users (enforced in the database: anon cannot call get_public_contact).
  // Fetched on click, never placed in page source, search results or metadata.
  const loginPrompt = () => {
    const nextUrl = encodeURIComponent(`${location.pathname}#contact`);
    $('#contact-out').innerHTML = `<div class="notice"><p>${t('contact.login_required')}</p>
      <p><a class="btn full" href="/login.html?next=${nextUrl}">${t('contact.login_btn')}</a></p>
      <p><a class="btn full ghost" href="/login.html?next=${nextUrl}#signup">${t('contact.signup_btn')}</a></p></div>`;
  };
  const showContact = async () => {
    const out = $('#contact-out');
    if (!(await getUser())) { loginPrompt(); return; }
    out.innerHTML = `<p class="muted">…</p>`;
    const { data, error } = await sb.rpc('get_public_contact', { p_id: p.id });
    if (error && (error.code === '28000' || error.code === '42501' || /jwt|not authenticated/i.test(error.message || ''))) { loginPrompt(); return; }
    if (error && error.code === '54000') { out.innerHTML = `<p class="notice err">${t('contact.limit')}</p>`; return; }
    const c = data?.[0];
    if (error || !c || !c.phone) { out.innerHTML = `<p class="notice err">${t('contact.unavailable')}</p>`; return; }
    const url = `${siteUrl()}/property/${p.id}`;
    const msg = encodeURIComponent(t('contact.wa_msg', { title: p.title, url }));
    out.innerHTML = `${c.contact_name ? `<p><b>${esc(c.contact_name)}</b></p>` : ''}
      <a class="btn full call" href="tel:+91${c.phone}">📞 ${t('contact.call')} ${c.phone}</a>
      ${c.whatsapp ? `<a class="btn full wa" href="https://wa.me/91${c.whatsapp}?text=${msg}" target="_blank" rel="noopener">💬 ${t('contact.whatsapp')}</a>` : ''}
      ${c.alt_phone ? `<p class="muted small">${t('contact.alt')}: <a href="tel:${c.alt_phone}">${c.alt_phone}</a></p>` : ''}
      <p class="hint">${t('contact.safety')}</p>`;
    out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  $('#show-contact').addEventListener('click', showContact);
  if (location.hash === '#contact') getUser().then((u) => { if (u) showContact(); }); // returning from login
  $('#show-contact-2').addEventListener('click', () => { $('#show-contact').click(); $('#show-contact').scrollIntoView({ block: 'center', behavior: 'smooth' }); });

  // report
  const dlg = $('#report-dlg');
  $('#report-reasons').innerHTML = `<legend>${t('report.why')}</legend>` + OPTS.report_reason.map((v, i) => `<label class="check"><input type="radio" name="reason" value="${v}" ${i === 0 ? 'checked' : ''}> <span>${esc(tOpt('report_reason', v))}</span></label>`).join('');
  $('#report-btn').addEventListener('click', () => dlg.showModal());
  $('#report-cancel').addEventListener('click', () => dlg.close());
  $('#report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = new FormData(e.target).get('reason');
    const { error } = await sb.from('reports').insert({ property_id: p.id, reason, details: $('#report-details').value.trim() || null });
    dlg.close();
    error ? toast(t('report.failed'), 'err') : toast(t('report.thanks'));
  });

  // SEO
  const type = { apartment: 'Apartment', builder_floor: 'Apartment', studio: 'Apartment', one_rk: 'Apartment', independent_house: 'House', villa: 'House', room: 'Room' }[p.property_type] || 'Accommodation';
  const canonical = `${siteUrl()}/property/${p.id}`;
  const desc = `${typeBhk} for rent in ${loc.locality}, ${loc.city} — ${inr(p.monthly_rent)}/month, deposit ${inr(p.security_deposit)}. ${tenantsText(p.allowed_tenants)}. Electricity: ${tOpt('electricity_arrangement', u?.electricity_arrangement)}.`;
  setMeta({
    title: `${p.title} | KirayaGo`, description: desc.slice(0, 300), canonical,
    image: imgs[0] ? imgUrl(imgs[0].path) : undefined, noindex: p.status !== 'published',
    jsonld: {
      '@context': 'https://schema.org', '@type': type, name: p.title, description: (p.description || desc).slice(0, 500), url: canonical,
      image: imgs.slice(0, 5).map((i) => imgUrl(i.path)),
      address: { '@type': 'PostalAddress', addressLocality: loc.city, addressRegion: loc.state, addressCountry: 'IN', ...(p.pin_code ? { postalCode: p.pin_code } : {}) },
      ...(p.bhk ? { numberOfRooms: p.bhk } : {}), ...(p.bathrooms != null ? { numberOfBathroomsTotal: p.bathrooms } : {}),
      ...(p.builtup_area ? { floorSize: { '@type': 'QuantitativeValue', value: +p.builtup_area, unitCode: { sqft: 'FTK', sqyd: 'YDK', sqm: 'MTK' }[p.area_unit] } } : {}),
    },
  });
}

boot(async () => {
  const id = (location.pathname.match(UUID) || [])[0];
  if (!id) { $('#prop').innerHTML = `<div class="notice">${t('prop.not_found')} <a href="/rent/">${t('nav.find')}</a></div>`; return; }
  const [{ data, error }, am] = await Promise.all([
    sb.from('properties').select('*, locations(*), property_rules(*), property_utilities(*), property_amenities(amenity_code), property_nearby(*), property_images(*)').eq('id', id).maybeSingle(),
    sb.from('amenities').select('code,grp'),
  ]);
  window.__amenGroup = Object.fromEntries((am.data || []).map((a) => [a.code, a.grp]));
  if (error) throw error;
  if (!data) {
    setMeta({ title: `${t('prop.not_found')} | KirayaGo`, noindex: true });
    $('#prop').innerHTML = `<div class="notice"><b>${t('prop.not_found')}</b><p>${t('prop.not_found_d')}</p><a class="btn" href="/rent/">${t('nav.find')}</a></div>`; return;
  }
  const { data: m } = await sb.rpc('get_listing_meta', { p_id: id });
  render(data, m?.[0]);
});
