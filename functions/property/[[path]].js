// /property/<uuid> — adds real title/description/OG tags on the server so crawlers and link previews see them.
// If anything fails, the plain static page is returned and the browser JS still works.
import { UUID, rest, trim, rewriteHead } from '../_lib/seo.js';

export async function onRequest({ request, env, params }) {
  const shell = await env.ASSETS.fetch(new URL('/property/', request.url));
  const id = [].concat(params.path || [])[0];
  if (!id || !UUID.test(id)) return shell;

  const rows = await rest(env, `properties?id=eq.${id}&status=eq.published&select=id,title,description,monthly_rent,bhk,property_type,furnishing,locations(city,locality,state),property_images(path,is_primary,sort_order)`);
  const origin = (env.SITE_URL || new URL(request.url).origin).replace(/\/+$/, '');
  const canonical = `${origin}/property/${id}`;
  const p = rows && rows[0];
  if (!p) {
    // Unknown, unpublished, or lookup failed: never let it be indexed.
    return rewriteHead(shell, { title: 'Rental property | KirayaGo', description: 'Rental property details on KirayaGo.', canonical, noindex: true });
  }
  const loc = p.locations || {};
  const place = [loc.locality, loc.city].filter(Boolean).join(', ');
  const kind = p.bhk > 0 ? `${p.bhk} BHK ${p.property_type.replace(/_/g, ' ')}` : p.property_type.replace(/_/g, ' ');
  const rent = new Intl.NumberFormat('en-IN').format(p.monthly_rent);
  const title = trim(`${kind} for rent in ${place} – ₹${rent}/month | KirayaGo`, 70);
  const description = trim(p.description || `${kind} for rent in ${place}, ${loc.state}. Monthly rent ₹${rent}. See deposit, electricity, water, parking and house rules.`, 160);
  const imgs = (p.property_images || []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
  const image = imgs[0] ? `${env.SUPABASE_URL}/storage/v1/object/public/property-images/${imgs[0].path}` : null;
  return rewriteHead(shell, { title, description, canonical, image });
}
