import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL } from './config.js';

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
export const siteUrl = () => SITE_URL || location.origin;

/** Public URL of a file in the property-images bucket. */
export const imgUrl = (path) => (path ? `${SUPABASE_URL}/storage/v1/object/public/property-images/${path}` : '');

export async function getUser() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

let adminCache = null;
export async function isAdmin() {
  if (adminCache !== null) return adminCache;
  const u = await getUser();
  if (!u) return false;
  // Convenience only: real authorization is enforced by the database.
  const { data } = await sb.from('admins').select('user_id').eq('user_id', u.id).maybeSingle();
  return (adminCache = Boolean(data));
}

/** Redirects to login if there is no session. Returns the user. */
export async function requireUser() {
  const u = await getUser();
  if (!u) {
    location.replace(`/login.html?next=${encodeURIComponent(location.pathname + location.search)}`);
    return new Promise(() => {});
  }
  return u;
}
export const one = (x) => (Array.isArray(x) ? x[0] : x) || null;
