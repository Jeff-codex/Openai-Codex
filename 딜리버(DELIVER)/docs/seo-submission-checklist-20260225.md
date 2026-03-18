# SEO Submission Checklist (2026-02-25)

## 1) Current production URLs
- Main landing: `https://everyonepr.com/`
- Review landing: `https://everyonepr.com/review`
- Sitemap: `https://everyonepr.com/sitemap.xml`
- Robots: `https://everyonepr.com/robots.txt`
- Legacy public host: `https://dliver.co.kr/*` -> `https://everyonepr.com/:splat` `301`

## 2) Verified on production
- Main landing has `canonical=https://everyonepr.com/`
- Review landing has `canonical=https://everyonepr.com/review`
- Both pages include robots meta `index,follow`
- Main landing includes Naver site verification meta
- `sitemap.xml` contains both URLs (`/`, `/review`)
- Main landing includes JSON-LD: `Service`, `BreadcrumbList`, `FAQPage`

## 3) Google Search Console (manual)
1. Open Google Search Console property for `https://everyonepr.com/`
2. Use URL Inspection:
   - `https://everyonepr.com/`
   - `https://everyonepr.com/review`
3. Click `Request indexing` for both URLs
4. Open Sitemaps menu and submit:
   - `https://everyonepr.com/sitemap.xml`

## 4) Naver Search Advisor (manual)
1. Open Naver Search Advisor for site `https://everyonepr.com/`
2. Re-check ownership status (meta verification)
3. Submit sitemap:
   - `https://everyonepr.com/sitemap.xml`
4. Request collection for:
   - `https://everyonepr.com/`
   - `https://everyonepr.com/review`

## 5) Post-submission monitoring
- Re-check index status after 24h and 72h
- If one URL is excluded:
  - confirm canonical/robots consistency
  - re-request indexing once
  - check for duplicate URL variants (`/review/`, query params, `/index.html`)
