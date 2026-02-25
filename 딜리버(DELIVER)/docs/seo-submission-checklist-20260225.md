# SEO Submission Checklist (2026-02-25)

## 1) Current production URLs
- Main landing: `https://dliver.co.kr/`
- Self-order landing: `https://dliver.co.kr/self-order`
- Sitemap: `https://dliver.co.kr/sitemap.xml`
- Robots: `https://dliver.co.kr/robots.txt`

## 2) Verified on production
- Main landing has `canonical=https://dliver.co.kr/`
- Self-order landing has `canonical=https://dliver.co.kr/self-order`
- Both pages include robots meta `index,follow`
- Main landing includes Naver site verification meta
- `sitemap.xml` contains both URLs (`/`, `/self-order`)
- Self-order includes JSON-LD: `Service`, `BreadcrumbList`, `FAQPage`

## 3) Google Search Console (manual)
1. Open Google Search Console property for `https://dliver.co.kr/`
2. Use URL Inspection:
   - `https://dliver.co.kr/`
   - `https://dliver.co.kr/self-order`
3. Click `Request indexing` for both URLs
4. Open Sitemaps menu and submit:
   - `https://dliver.co.kr/sitemap.xml`

## 4) Naver Search Advisor (manual)
1. Open Naver Search Advisor for site `https://dliver.co.kr/`
2. Re-check ownership status (meta verification)
3. Submit sitemap:
   - `https://dliver.co.kr/sitemap.xml`
4. Request collection for:
   - `https://dliver.co.kr/`
   - `https://dliver.co.kr/self-order`

## 5) Post-submission monitoring
- Re-check index status after 24h and 72h
- If one URL is excluded:
  - confirm canonical/robots consistency
  - re-request indexing once
  - check for duplicate URL variants (`/self-order/`, query params)

