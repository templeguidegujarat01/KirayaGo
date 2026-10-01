import { boot, $, $$, esc, t, tOpt, inr, toast, errMsg, badge, fmtDate } from './ui.js';
import { sb, requireUser, imgUrl, one } from './supabase.js';
import { OPTS } from './constants.js';

let user;
const STATUS_CLS = { published: 'green', draft: 'grey', pending_review: 'blue', rented: 'red', unavailable: 'grey', archived: 'grey', suspended: 'red' };

async function load() {
  const box = $('#my-props');
  box.innerHTML = '<div class="card skel"></div>';
  const { data, error } = await sb.from('properties')
    .select('id,title,status,monthly_rent,security_deposit,updated_at,locations(city,locality),property_images(path,thumb_path,is_primary,sort_order),property_owners!inner(owner_id)')
    .eq('property_owners.owner_id', user.id).order('updated_at', { ascending: false });
  if (error) { box.innerHTML = `<div class="notice err">${esc(error.message)}</div>`; return; }
  if (!data.length) { box.innerHTML = `<div class="notice"><b>${t('dash.empty')}</b><p><a class="btn accent" href="/list.html">${t('dash.add')}</a></p></div>`; return; }
  box.innerHTML = data.map((p) => {
    const im = [...(p.property_images || [])].sort((a, b) => (b.is_primary - a.is_primary) || a.sort_order - b.sort_order)[0];
    const loc = one(p.locations);
    const live = p.status === 'published';
    return `<article class="mycard" data-id="${p.id}">
      <div class="thumb">${im ? `<img src="${esc(imgUrl(im.thumb_path || im.path))}" alt="" loading="lazy" width="160" height="110">` : `<div class="noimg">${t('card.no_photo')}</div>`}</div>
      <div class="info">
        <h3>${esc(p.title || t('dash.untitled'))}</h3>
        <p class="muted">${esc(loc?.locality)}, ${esc(loc?.city)} · ${p.monthly_rent ? inr(p.monthly_rent) + t('card.per_month') : '—'}</p>
        <p>${badge(tOpt('status', p.status), STATUS_CLS[p.status])} <small class="muted">${t('trust.updated')}: ${fmtDate(p.updated_at)}</small></p>
        <div class="actions">
          <a class="btn small ghost" href="/property/${p.id}">${t('dash.view')}</a>
          <a class="btn small ghost" href="/list.html?id=${p.id}">${t('dash.edit')}</a>
          <a class="btn small ghost" href="/list.html?id=${p.id}&step=10">${t('dash.photos')}</a>
          <button class="btn small ghost" data-act="rent" data-rent="${p.monthly_rent || ''}" data-dep="${p.security_deposit ?? ''}">${t('dash.change_rent')}</button>
          ${live ? `<button class="btn small" data-act="rented">${t('dash.mark_rented')}</button><button class="btn small ghost" data-act="unavailable">${t('dash.pause')}</button>`
                 : p.status === 'pending_review' ? `<span class="muted small">${t('dash.in_review')}</span>`
                 : p.status === 'suspended' ? `<span class="muted small">${t('dash.suspended')}</span>`
                 : `<button class="btn small accent" data-act="published">${p.status === 'rented' ? t('dash.mark_available') : t('dash.publish')}</button>`}
          <button class="btn small danger" data-act="delete">${t('common.delete')}</button>
        </div></div></article>`;
  }).join('');
}

async function act(id, a, btn) {
  try {
    if (a === 'delete') {
      if (!confirm(t('dash.confirm_delete'))) return;
      const { data: imgs } = await sb.from('property_images').select('path,thumb_path').eq('property_id', id);
      const paths = (imgs || []).flatMap((i) => [i.path, i.thumb_path]).filter(Boolean);
      if (paths.length) await sb.storage.from('property-images').remove(paths);
      const { error } = await sb.rpc('delete_property', { p_id: id });
      if (error) throw error;
      toast(t('dash.deleted'));
    } else if (a === 'rent') {
      const dlg = $('#rent-dlg'); $('#rd-rent').value = btn.dataset.rent; $('#rd-dep').value = btn.dataset.dep;
      dlg.dataset.id = id; dlg.showModal(); return;
    } else {
      const { data, error } = await sb.rpc('set_property_status', { p_id: id, p_status: a });
      if (error) throw error;
      toast(data === 'pending_review' ? t('dash.sent_review') : t('dash.updated'));
    }
    await load();
  } catch (e) { toast(errMsg(e), 'err'); }
}

boot(async () => {
  user = await requireUser();
  $('#my-props').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    act(b.closest('.mycard').dataset.id, b.dataset.act, b);
  });
  const tab = (which) => {
    const props = which === 'props';
    $('#props-panel').hidden = !props; $('#acct-panel').hidden = props;
    $('#tab-props').setAttribute('aria-selected', props); $('#tab-acct').setAttribute('aria-selected', !props);
  };
  $('#tab-props').addEventListener('click', () => tab('props')); $('#tab-acct').addEventListener('click', () => tab('acct'));

  $('#rd-cancel').addEventListener('click', () => $('#rent-dlg').close());
  $('#rent-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rent = parseInt($('#rd-rent').value, 10), dep = $('#rd-dep').value === '' ? null : parseInt($('#rd-dep').value, 10);
    const { error } = await sb.rpc('set_property_rent', { p_id: $('#rent-dlg').dataset.id, p_rent: rent, p_deposit: dep });
    $('#rent-dlg').close(); error ? toast(errMsg(error), 'err') : (toast(t('dash.updated')), load());
  });

  const { data: prof } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  $('#p-email').value = user.email; $('#p-name').value = prof?.full_name || ''; $('#p-phone').value = prof?.phone || '';
  $('#p-type').innerHTML = OPTS.account_type.map((v) => `<option value="${v}" ${prof?.account_type === v ? 'selected' : ''}>${esc(tOpt('account_type', v))}</option>`).join('');
  $('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = $('#p-phone').value.replace(/\D/g, '') || null;
    if (phone && !/^[0-9]{8,12}$/.test(phone)) return toast(t('form.err_phone'), 'err');
    const { error } = await sb.from('profiles').update({ full_name: $('#p-name').value.trim() || null, account_type: $('#p-type').value, phone }).eq('id', user.id);
    error ? toast(errMsg(error), 'err') : toast(t('dash.updated'));
  });
  $('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#pw-new').value; if (pw.length < 8) return toast(t('auth.err_pw'), 'err');
    const { error } = await sb.auth.updateUser({ password: pw });
    error ? toast(errMsg(error), 'err') : (toast(t('auth.pw_updated')), ($('#pw-new').value = ''));
  });
  await load();
});
