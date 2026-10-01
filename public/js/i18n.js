// Tiny i18n layer. To add a language: copy locales/en.json to locales/<code>.json, translate the values,
// and add the code below. Missing keys fall back to English. Property data is never translated.
export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  // { code: 'gu', label: 'ગુજરાતી' },  { code: 'mr', label: 'मराठी' },  { code: 'ta', label: 'தமிழ்' }, ...
];
let dict = {}, fallback = {}, lang = 'en';

export async function initI18n() {
  try { lang = localStorage.getItem('kg_lang') || ''; } catch { lang = ''; }
  if (!LANGS.some((l) => l.code === lang)) lang = 'en';
  fallback = await (await fetch('/locales/en.json')).json();
  dict = lang === 'en' ? fallback : await (await fetch(`/locales/${lang}.json`)).json().catch(() => ({}));
  document.documentElement.lang = lang;
  applyStatic();
}
export const getLang = () => lang;
export function setLang(code) {
  try { localStorage.setItem('kg_lang', code); } catch { /* ignore */ }
  location.reload();
}
export function t(key, vars) {
  let s = dict[key] ?? fallback[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
/** Label for an option value, e.g. tOpt('furnishing','semi_furnished'). Falls back to the raw value. */
export const tOpt = (field, value) => (value == null || value === '' ? '' : t(`opt.${field}.${value}`) === `opt.${field}.${value}` ? value : t(`opt.${field}.${value}`));
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}
