# KirayaGo — rent-only property platform for India

State → City → Area → properties. Owners list for free; tenants search without an account.
Static website (plain HTML/CSS/JavaScript, no framework) + **Supabase** (database, login, photo storage) + **Cloudflare Pages** (free hosting).

> **Read this first — honest status.** This project was written and checked for syntax, translation coverage and build success,
> but it has **not been run against a live Supabase project or in a real browser** by its author. Expect to fix a few small things
> on your first run. Follow "Test it" (section 7) carefully and report/fix what breaks. There is **no fake data**: a fresh site is empty until real people list properties.

---

## What you need (all free)
- A Supabase account — https://supabase.com
- A GitHub account — https://github.com
- A Cloudflare account — https://dash.cloudflare.com (for hosting)
- Node.js 18+ on your computer only if you want to run it locally (optional)

## 1. Create the Supabase project
1. Supabase → **New project**. Pick any name, set a database password (save it somewhere), choose the region closest to India (Mumbai `ap-south-1` if offered).
2. Wait until the project is ready.
3. Open **SQL Editor → New query**, paste the **entire** contents of `supabase/schema.sql`, click **Run**.
   It is safe to run again later (it will not delete your data). You should see "Success".
4. Open **Project Settings → API** and copy two values:
   - **Project URL** → this is `SUPABASE_URL`
   - **anon public key** (or "publishable key") → this is `SUPABASE_ANON_KEY`

   ⚠️ **Never** use or share the `service_role` / "secret" key. This project never needs it.
   The anon key is meant to be public: what people can do with it is limited by Row Level Security rules, which `schema.sql` turns on for every table.

## 2. Login settings (Supabase → Authentication)
1. **URL Configuration**
   - **Site URL**: your website address, e.g. `https://kirayago.pages.dev` (use `http://localhost:8788` while testing locally)
   - **Redirect URLs**: add `https://YOUR-SITE/dashboard.html` and `https://YOUR-SITE/reset.html` (and the `http://localhost:8788/...` versions for local testing)
2. **Email confirmation & limits**
   - Supabase's built-in email sender is limited to a very small number of emails per hour. That is fine for testing but **not for real users**.
   - While testing you can turn off **Authentication → Providers → Email → Confirm email**. Turn it back on for launch.
   - For launch, set up **Custom SMTP** (Authentication → Emails → SMTP settings) with any email service that has a free tier.

## 3. Make yourself an admin
1. Open your site (or run it locally), **create an account** with your email.
2. In Supabase **SQL Editor** run (put your real email):
   ```sql
   insert into public.admins(user_id) select id from auth.users where email = 'you@example.com';
   ```
3. Log out and in again. An **Admin** link appears in the top bar. Admin powers are enforced by the database, not by the page.

## 4. Put the code on GitHub
1. Create a new repository (public or private).
2. Upload **everything in this folder**: `public/`, `functions/`, `supabase/`, `scripts/`, `build.mjs`, `package.json`, `.env.example`, `.gitignore`, `README.md`.
   (GitHub website → "Add file" → "Upload files", or use git.)
3. **Never upload a file named `.env`.** It is listed in `.gitignore`, but double-check.

## 5. Deploy on Cloudflare Pages
(GitHub Pages cannot be used: it cannot run the small server-side pieces in `functions/`.)
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick your repository.
2. Build settings:
   - **Framework preset**: None
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. **Environment variables** (Settings → Variables and Secrets; add them for *Production*, and Preview if you use it):
   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_ANON_KEY` | your anon public key |
   | `SITE_URL` | your final address, no trailing slash, e.g. `https://kirayago.pages.dev` |
4. Deploy. Then go back to step 2 and put the final address into Supabase's Site URL / Redirect URLs.
5. **Sitemap**: `sitemap.xml` is generated at build time from real published listings (needs `SITE_URL`; without it no sitemap is written). Re-deploy (Deployments → Retry / push a commit) to refresh it, then submit `https://YOUR-SITE/sitemap.xml` in Google Search Console.

## 6. Run it on your computer (optional)
```
cp .env.example .env     # then edit .env with your real values
npm run dev              # builds and serves at http://localhost:8788 (uses wrangler, downloaded on demand)
npm run check            # syntax + translation coverage check
```

## 7. Test it (do this once, in order)
1. Home page loads with no red "Setup needed" box. State list appears.
2. **Sign up** → (confirm email if enabled) → **Log in** → you land on the dashboard.
3. **List your property**: go through the 12 steps (each step saves). Add 2+ real photos (they are compressed on your device). Publish.
4. Open **Find a rental**: your listing appears; try the state/city/area filters, budget chips, sorting.
5. Open the listing: gallery, cost breakdown, electricity/water/parking/owner sections. While logged out, tap **Show contact details** → you are asked to log in or sign up (the phone number must NOT appear). Log in → you return to the listing → Call / WhatsApp buttons appear.
6. Dashboard: **Change rent**, **Mark rented** (the listing disappears from public search and its public page; contact is no longer available), **Mark available** again.
7. Log out, open the listing as a visitor, use **Report** → send a report.
8. Log in as admin → **Admin** → Reports tab shows it → Suspend / Resolve. Suspended listings disappear from search.
9. Switch language to **हिन्दी** in the top bar.

## How it is built (short)
- `public/` – the website. `build.mjs` copies it to `dist/` and writes `dist/js/config.js` (public values only), `robots.txt`, `sitemap.xml`.
- `supabase/schema.sql` – tables, security rules (RLS), helper functions, photo bucket. All writes go through checked database functions; the browser has no direct write access to listings.
- **Privacy**: phone/WhatsApp numbers are never in page HTML, search results or listing data. Only a **logged-in** user can fetch them (database function `get_public_contact`; `anon` has no permission to run it), one listing at a time, max 100 different listings per account per 24 h, and each lookup is logged (user + listing + time, readable only with SQL access) to deter scraping. Exact address and owner identity are private.
- **Already ran an older `schema.sql`?** Run the new one again in the SQL Editor; it is safe to re-run and applies the permission fixes.
- `functions/` – Cloudflare Pages Functions that add the listing title/description/preview image to the HTML on the server (for Google and WhatsApp previews) and mark empty location pages `noindex`. If they fail, the site still works (the browser adds the tags).
- **Photos**: compressed in the browser to a full image (≤1600 px) and a 480 px thumbnail, stored in the `property-images` bucket (max 15 per listing).
- No fake data, fake "verified" badges, view counts or ratings anywhere. The only trust signals shown are real: who posted it (owner / manager / broker), last updated, member since, and whether the email is confirmed.

## Options
- **Review before publishing**: in SQL run `update public.app_settings set value = 'true'::jsonb where key = 'require_review';` Then new listings wait in the Admin → Listings tab for **Approve**.
- **Add a language**: copy `public/locales/en.json` to e.g. `gu.json`, translate the values (keep `{placeholders}`), add `{ code: 'gu', label: 'ગુજરાતી' }` to `LANGS` in `public/js/i18n.js`, run `npm run check`. Listing content entered by owners is never auto-translated.
- **Free-tier limits** (check current numbers on Supabase/Cloudflare pricing pages): Supabase free projects pause after a period of inactivity, have small database/storage/bandwidth quotas, and limit auth emails. Cloudflare Pages free has a monthly build limit. Photos being compressed on-device is what keeps storage use low.

## Known limitations
- Not tested against a live Supabase or in a browser by the author (see top).
- Listing page SEO tags are added on the server only when the `functions/` folder is deployed and `SUPABASE_URL`/`SUPABASE_ANON_KEY` are set in Cloudflare; otherwise only the browser adds them (Google usually still reads them, but previews in WhatsApp won't). Server tags are in English.
- Sitemap reflects listings at the last deploy. Home "browse" chips read at most 1000 location rows.
- No map, GPS, or "near me" search. Nearby distances are typed in by the lister.
- Hindi text was machine-drafted: have a native speaker review it before launch.
- Anyone can report a published listing; the database limits reports (20 per listing and 10 per logged-in user per hour) but there is no CAPTCHA. Add Cloudflare Turnstile if you get spam.
- Any logged-in user can see contact numbers (that is the rule), and owners can still type a phone number into the free-text description; KirayaGo does not scan text for numbers.
- Content-Security-Policy is set in `_headers` (generated for your Supabase address); it has not been tested in every browser, so check the browser console on first deploy.
- KirayaGo does not verify identity, ownership or documents, and says so on the site. Do not add "verified" labels unless you really perform verification.
