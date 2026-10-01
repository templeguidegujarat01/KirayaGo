import { boot, $, t, errMsg } from './ui.js';
import { sb, siteUrl, getUser } from './supabase.js';

const msg = (text, kind = 'err') => { $('#msg').innerHTML = text ? `<div class="notice ${kind}">${text}</div>` : ''; };
const next = () => { const n = new URLSearchParams(location.search).get('next'); return n && /^\/(?![\/\\])/.test(n) && !/[\\\u0000-\u001f]/.test(n) ? n : '/dashboard.html'; };
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const nice = (e) => {
  const m = e.message || '';
  if (/invalid login/i.test(m)) return t('auth.err_login');
  if (/already registered|already been registered/i.test(m)) return t('auth.err_exists');
  if (/rate limit|too many/i.test(m)) return t('auth.err_rate');
  if (/email not confirmed/i.test(m)) return t('auth.err_unconfirmed');
  return errMsg(e);
};

boot(async () => {
  // ---- password reset page ----
  if ($('#reset-form')) {
    $('#reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = $('#r-pass').value;
      if (pw.length < 8) return msg(t('auth.err_pw'));
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) return msg(nice(error));
      msg(t('auth.pw_updated'), 'ok'); setTimeout(() => (location.href = '/dashboard.html'), 1200);
    });
    return;
  }
  // ---- login / signup page ----
  if (await getUser()) { location.replace(next()); return; }
  const show = (which) => {
    const login = which === 'login';
    $('#login-form').hidden = !login; $('#signup-form').hidden = login;
    $('#tab-login').setAttribute('aria-selected', login); $('#tab-signup').setAttribute('aria-selected', !login); msg('');
  };
  $('#tab-login').addEventListener('click', () => show('login'));
  $('#tab-signup').addEventListener('click', () => show('signup'));
  if (location.hash === '#signup') show('signup');

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); msg('');
    const email = $('#l-email').value.trim(), password = $('#l-pass').value;
    if (!validEmail(email)) return msg(t('auth.err_email'));
    if (!password) return msg(t('auth.err_pw'));
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return msg(nice(error));
    location.href = next();
  });
  $('#signup-form').addEventListener('submit', async (e) => {
    e.preventDefault(); msg('');
    const full_name = $('#s-name').value.trim(), email = $('#s-email').value.trim(), password = $('#s-pass').value;
    if (full_name.length < 2) return msg(t('auth.err_name'));
    if (!validEmail(email)) return msg(t('auth.err_email'));
    if (password.length < 8) return msg(t('auth.err_pw'));
    const account_type = new FormData(e.target).get('acct');
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name, account_type }, emailRedirectTo: `${siteUrl()}/dashboard.html` } });
    if (error) return msg(nice(error));
    if (data.session) { location.href = next(); return; }
    msg(t('auth.check_email'), 'ok');
  });
  $('#forgot').addEventListener('click', async () => {
    const email = $('#l-email').value.trim();
    if (!validEmail(email)) return msg(t('auth.err_email_first'));
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/reset.html` });
    error ? msg(nice(error)) : msg(t('auth.reset_sent'), 'ok');
  });
});
