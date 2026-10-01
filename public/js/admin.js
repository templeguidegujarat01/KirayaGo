// Admin console. The isAdmin() check only hides the UI; every action below is enforced by the database
// (RLS policies and security-definer functions that call is_admin()).
import { sb, requireUser, isAdmin } from './supabase.js';
import { boot, $, $$, esc, t, tOpt, toast, errMsg, badge, fmtDate } from './ui.js';
import { OPTS } from './constants.js';

const PAGE = 25;
const STATUS_CLS = { published: 'green', rented: 'red', suspended: 'red', pending_review: 'blue' };
let listOffset = 0;

function tab(name) {
  for (const n of ['listings', 'reports', 'users']) {
    $(`#tab-${n}`).setAttribute('aria-selected', String(n === name));
    $(`#panel-${n}`).hidden = n !== name;
  }
  if (name === 'listings') loadListings(true);
  if (name === 'reports') loadReports();
  if (name === 'users') loadUsers();
}

async function loadListings(reset) {
  if (reset) listOffset = 0;
  const box = $('#list-listings');
  const text = $('#lq-text').value.trim().replace(/[%,()]/g, ' ');
  const status = $('#lq-status').value;
  let q = sb.from('properties')
    .select('id,title,status,monthly_rent,updated_at,locations(city,locality,state)')
    .order('updated_at', { ascending: false }).range(listOffset, listOffset + PAGE - 1);
  if (status) q = q.eq('status', status);
  if (text) q = q.ilike('title', `%${text}%`);
  const { data, error } = await q;
  if (error) { toast(errMsg(error), 'err'); return; }
  if (reset) box.innerHTML = '';
  if (reset && !data.length) box.innerHTML = `<p class="muted">${t('admin.none')}</p>`;
  box.insertAdjacentHTML('beforeend', data.map((p) => {
    const loc = p.locations ? `${esc(p.locations.locality)}, ${esc(p.locations.city)}` : '';
    const suspended = p.status === 'suspended';
    return `<article class="mycard" data-id="${p.id}" style="grid-template-columns:1fr"><div>
      <h3>${esc(p.title || t('dash.untitled'))}</h3>
      <p>${badge(tOpt('status', p.status), STATUS_CLS[p.status])} <span class="muted small">${loc} · ${p.monthly_rent ? '₹' + new Intl.NumberFormat('en-IN').format(p.monthly_rent) : ''} · ${fmtDate(p.updated_at)}</span></p>
      <div class="actions">
        <a class="btn small ghost" href="/property/${p.id}">${t('admin.open')}</a>
        ${p.status === 'pending_review' ? `<button class="btn small" data-act="published">${t('admin.approve')}</button>` : ''}
        ${suspended ? `<button class="btn small" data-act="published">${t('admin.restore')}</button>` : `<button class="btn small ghost" data-act="suspended">${t('admin.suspend')}</button>`}
        <button class="btn small danger ghost" data-act="delete">${t('admin.delete')}</button>
      </div></div></article>`;
  }).join(''));
  $('#more-listings').hidden = data.length < PAGE;
  listOffset += data.length;
}

async function listingAction(id, act) {
  try {
    if (act === 'delete') {
      if (!confirm(t('admin.confirm_delete'))) return;
      const { data: imgs } = await sb.from('property_images').select('path,thumb_path').eq('property_id', id);
      const paths = (imgs || []).flatMap((i) => [i.path, i.thumb_path]).filter(Boolean);
      const { error } = await sb.rpc('delete_property', { p_id: id });
      if (error) throw error;
      // files are removed only after the database delete succeeded (best effort)
      if (paths.length) await sb.storage.from('property-images').remove(paths).catch(() => {});
    } else {
      const { error } = await sb.rpc('set_property_status', { p_id: id, p_status: act });
      if (error) throw error;
    }
    toast(t('admin.done'));
    loadListings(true);
  } catch (e) { toast(errMsg(e), 'err'); }
}

async function loadReports() {
  const box = $('#list-reports');
  const { data, error } = await sb.from('reports')
    .select('id,property_id,reason,details,status,created_at,properties(title,status)')
    .eq('status', 'open').order('created_at', { ascending: false }).limit(100);
  if (error) { toast(errMsg(error), 'err'); return; }
  box.innerHTML = data.length ? data.map((r) => `<article class="mycard" data-rid="${r.id}" style="grid-template-columns:1fr"><div>
      <h3>${esc(r.properties?.title || t('dash.untitled'))}</h3>
      <p>${badge(tOpt('report_reason', r.reason), 'red')} ${r.properties ? badge(tOpt('status', r.properties.status), STATUS_CLS[r.properties.status]) : ''} <span class="muted small">${t('admin.reported_on')}: ${fmtDate(r.created_at)}</span></p>
      ${r.details ? `<p>${esc(r.details)}</p>` : ''}
      <div class="actions">
        <a class="btn small ghost" href="/property/${r.property_id}">${t('admin.open')}</a>
        <button class="btn small" data-ract="resolved">${t('admin.resolve')}</button>
        <button class="btn small ghost" data-ract="dismissed">${t('admin.dismiss')}</button>
        <button class="btn small danger ghost" data-ract="suspend" data-pid="${r.property_id}">${t('admin.suspend')}</button>
      </div></div></article>`).join('') : `<p class="muted">${t('admin.none')}</p>`;
}

async function reportAction(btn) {
  const card = btn.closest('[data-rid]'); const id = card.dataset.rid;
  try {
    if (btn.dataset.ract === 'suspend') {
      const { error } = await sb.rpc('set_property_status', { p_id: btn.dataset.pid, p_status: 'suspended' });
      if (error) throw error;
      const { error: e2 } = await sb.from('reports').update({ status: 'resolved' }).eq('id', id);
      if (e2) throw e2;
    } else {
      const { error } = await sb.from('reports').update({ status: btn.dataset.ract }).eq('id', id);
      if (error) throw error;
    }
    toast(t('admin.done')); loadReports();
  } catch (e) { toast(errMsg(e), 'err'); }
}

async function loadUsers() {
  const box = $('#list-users');
  const s = $('#uq-text').value.trim();
  const { data, error } = await sb.rpc('admin_list_users', { p_search: s || null, p_limit: 100 });
  if (error) { toast(errMsg(error), 'err'); return; }
  box.innerHTML = data.length ? data.map((u) => `<article class="mycard" style="grid-template-columns:1fr"><div>
      <h3>${esc(u.full_name || '—')}</h3>
      <p class="small">${esc(u.email)} ${u.email_verified ? badge(t('trust.email_verified'), 'green') : ''}</p>
      <p class="muted small">${t('admin.type')}: ${esc(u.account_type ? tOpt('account_type', u.account_type) : '—')} · ${t('admin.listings')}: ${u.listing_count} · ${t('admin.joined')}: ${fmtDate(u.created_at)}</p>
    </div></article>`).join('') : `<p class="muted">${t('admin.none')}</p>`;
}

boot(async () => {
  await requireUser();
  if (!(await isAdmin())) { $('#denied').hidden = false; return; }
  $('#admin-app').hidden = false;
  $('#lq-status').innerHTML = `<option value="">${esc(t('admin.all_status'))}</option>` +
    OPTS.status.map((v) => `<option value="${v}">${esc(tOpt('status', v))}</option>`).join('');
  $$('[role=tab]').forEach((b) => b.addEventListener('click', () => tab(b.id.replace('tab-', ''))));
  $('#lq').addEventListener('submit', (e) => { e.preventDefault(); loadListings(true); });
  $('#lq-status').addEventListener('change', () => loadListings(true));
  $('#more-listings').addEventListener('click', () => loadListings(false));
  $('#uq').addEventListener('submit', (e) => { e.preventDefault(); loadUsers(); });
  $('#list-listings').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) listingAction(b.closest('[data-id]').dataset.id, b.dataset.act); });
  $('#list-reports').addEventListener('click', (e) => { const b = e.target.closest('[data-ract]'); if (b) reportAction(b); });
  loadListings(true);
});
