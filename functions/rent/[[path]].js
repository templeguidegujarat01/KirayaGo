// /rent/<state>/<city>/<area> — server-side title/description, and noindex when there are no listings (no thin pages).
import { rest, trim, rewriteHead } from '../_lib/seo.js';

const SLUG = /^[a-z0-9-]{1,80}$/;

export async function onRequest({ request, env, params }) {
  const shell = await env.ASSETS.fetch(new URL('/rent/', request.url));
  const seg = [].concat(params.path || []).filter(Boolean);
  const origin = (env.SITE_URL || new URL(request.url).origin).replace(/\/+$/, '');
  if (!seg.length) return shell;
  if (seg.length > 3 || !seg.every((s) => SLUG.test(s))) {
    return rewriteHead(shell, { title: 'Houses & flats for rent in India | KirayaGo', description: 'Search rental homes across India.', canonical: `${origin}/rent/`, noindex: true });
  }
  const [state, city, loc] = seg;
  let q = `location_stats?state_slug=eq.${state}&select=state,city,locality,listing_count`;
  if (city) q += `&city_slug=eq.${city}`;
  if (loc) q += `&locality_slug=eq.${loc}`;
  const rows = await rest(env, q);
  const canonical = `${origin}/rent/${seg.join('/')}/`;
  if (!rows) return shell; // lookup failed: leave the static page alone
  const count = rows.reduce((n, r) => n + r.listing_count, 0);
  const first = rows[0];
  const placeName = !first ? seg.join(' / ') : loc ? `${first.locality}, ${first.city}` : city ? first.city : first.state;
  const title = `Houses & flats for rent in ${placeName} | KirayaGo`;
  const description = trim(count
    ? `Browse ${count} rental ${count === 1 ? 'listing' : 'listings'} in ${placeName}. Compare rent, deposit, electricity, water, parking and house rules.`
    : `Rental listings in ${placeName} on KirayaGo.`, 160);
  return rewriteHead(shell, { title, description, canonical, noindex: count === 0 });
}
