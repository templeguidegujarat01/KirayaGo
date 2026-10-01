// Shared helpers for Cloudflare Pages Functions that add server-side SEO tags.
// These only READ public data with the public anon key (same as the browser). Nothing secret is used here.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function rest(env, path) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export const trim = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

/** Rewrites <title>, description, canonical and Open Graph tags on the static HTML shell. */
export function rewriteHead(res, { title, description, canonical, image, noindex, jsonld }) {
  const setContent = (v) => ({ element(e) { e.setAttribute('content', v); } });
  let rw = new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(title); } })
    .on('meta[name="description"]', setContent(description))
    .on('link[rel="canonical"]', { element(e) { e.setAttribute('href', canonical); } })
    .on('head', { element(e) {
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      let h = `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">`
        + `<meta property="og:type" content="website"><meta property="og:site_name" content="KirayaGo"><meta property="og:url" content="${esc(canonical)}">`;
      if (image) h += `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">`;
      if (noindex) h += '<meta name="robots" content="noindex,follow">';
      if (jsonld) h += `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`;
      e.append(h, { html: true });
    } });
  return rw.transform(res);
}

export const htmlShell = async (env, request, path) => {
  const res = await env.ASSETS.fetch(new URL(path, request.url));
  return res;
};
