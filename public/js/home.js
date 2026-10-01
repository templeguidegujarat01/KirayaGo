import { boot, $, esc, t, groupStats, inr } from './ui.js';
import { sb } from './supabase.js';
import { BUDGETS } from './constants.js';

boot(async () => {
  const [{ data: states }, { data: stats }] = await Promise.all([
    sb.from('states').select('slug,name').order('name'),
    sb.from('location_stats').select('*').limit(1000),
  ]);
  const rows = stats || [];
  const sSel = $('#hs-state'), cSel = $('#hs-city'), aSel = $('#hs-area');
  sSel.innerHTML = `<option value="">${t('s.any_state')}</option>` + (states || []).map((s) => `<option value="${s.slug}">${esc(s.name)}</option>`).join('');
  $('#hs-budget').innerHTML = `<option value="">${t('s.any')}</option>` + BUDGETS.map(([a, b], i) => `<option value="${i}">${b ? `${inr(a)}–${inr(b)}` : `${inr(a)}+`}</option>`).join('');
  $('#hs-bhk').innerHTML = `<option value="">${t('s.any')}</option>` + [1, 2, 3, 4].map((n) => `<option value="${n}">${n === 4 ? '4+' : n} BHK</option>`).join('');

  const fill = (sel, items, anyLabel, emptyLabel) => {
    sel.innerHTML = items.length ? `<option value="">${anyLabel}</option>` + items.map((i) => `<option value="${i.slug}">${esc(i.name)} (${i.count})</option>`).join('') : `<option value="">${emptyLabel}</option>`;
    sel.disabled = !items.length;
  };
  sSel.addEventListener('change', () => {
    const cities = groupStats(rows.filter((r) => r.state_slug === sSel.value), (r) => r.city_slug, (r) => ({ slug: r.city_slug, name: r.city }));
    fill(cSel, cities, t('s.any_city'), sSel.value ? t('s.no_listings_here') : t('s.pick_state')); fill(aSel, [], '', t('s.pick_city'));
    $('#hs-hint').hidden = !(sSel.value && !cities.length);
    $('#hs-hint').textContent = t('empty.city');
  });
  cSel.addEventListener('change', () => {
    const areas = groupStats(rows.filter((r) => r.state_slug === sSel.value && r.city_slug === cSel.value), (r) => r.locality_slug, (r) => ({ slug: r.locality_slug, name: r.locality }));
    fill(aSel, areas, t('s.any_area'), t('s.pick_city'));
  });
  fill(cSel, [], '', t('s.pick_state')); fill(aSel, [], '', t('s.pick_city'));

  $('#hero-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const path = ['rent', sSel.value, sSel.value && cSel.value, cSel.value && aSel.value].filter(Boolean).join('/');
    const q = new URLSearchParams();
    const b = $('#hs-budget').value; if (b !== '') { const [lo, hi] = BUDGETS[b]; q.set('min_rent', lo); if (hi) q.set('max_rent', hi); }
    if ($('#hs-bhk').value) q.set('bhk', $('#hs-bhk').value);
    location.href = `/${path}/${q.toString() ? '?' + q : ''}`;
  });

  // Browse lists come straight from the database — nothing hard-coded.
  const byState = groupStats(rows, (r) => r.state_slug, (r) => ({ slug: r.state_slug, name: r.state }));
  const byCity = groupStats(rows, (r) => r.state_slug + '/' + r.city_slug, (r) => ({ path: r.state_slug + '/' + r.city_slug, name: r.city, state: r.state })).slice(0, 12);
  $('#states-list').innerHTML = byState.map((s) => `<a class="chip" href="/rent/${s.slug}/">${esc(s.name)} <b>${s.count}</b></a>`).join('');
  $('#cities-list').innerHTML = byCity.map((c) => `<a class="chip" href="/rent/${c.path}/">${esc(c.name)}, ${esc(c.state)} <b>${c.count}</b></a>`).join('');
  $('#browse-empty').hidden = rows.length > 0;
  if (!rows.length) { $('#states-list').hidden = true; $('#cities-list').hidden = true; document.querySelectorAll('#browse h2').forEach((h) => (h.hidden = true)); }
});
