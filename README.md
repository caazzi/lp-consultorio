# 🏥 High-Performance Medical Landing Page

> **Premium project** | Dr. Gilberto Salustiano & Dra. Anabel Lima practice
> *Maceió, AL - Brazil*

[![Live Demo](https://img.shields.io/badge/URL-consultoriosalustiano.com.br-blue?style=for-the-badge&logo=google-chrome&logoColor=white)](https://consultoriosalustiano.com.br/)
[![Hosting: Netlify](https://img.shields.io/badge/Netlify-00AD9F?style=for-the-badge&logo=netlify&logoColor=white)](https://www.netlify.com/)
[![Aesthetics: Premium](https://img.shields.io/badge/Design-Glassmorphism-teal?style=for-the-badge)](https://consultoriosalustiano.com.br/)

A high-performance JAMstack site built for a private medical practice, focused on
converting **Google Ads** traffic into bookings through **WhatsApp**.

---

## 🎯 Strategic goal
The project delivers a digital presence that conveys **authority (40 years of
experience)** and **trust**, while loading instantly on mobile connections (3G/4G).

- **Conversion-focused:** layout optimised for the patient's "golden path".
- **Private practice UX:** filters leads towards private appointments.
- **Identity:** palette based on "Turquesa Maceió" with a minimalist clinical look.

## 🚀 Architecture and performance
To reach Lighthouse scores of 95+ at zero scaling cost, the architecture uses:

- **Frontend core:** semantic HTML5 + Tailwind CSS 3.4.
- **Asset optimisation:**
  - **WebP** images (`cardiologia.webp` down to 15 KB / -71% LCP payload).
  - **LCP preload** with `fetchpriority="high"` for above-the-fold hero images.
  - **Elfsight reviews lazy-loading:** the Google Reviews widget loads on demand
    via `IntersectionObserver` only as the user approaches the section, keeping the
    initial main-thread work (TBT) clean.
  - **Deferred gtag.js:** Google tracking (GA4/Ads) is initialised off the critical
    path — only on the user's first gesture (pointerdown/scroll/touch/keyboard).
    There is no idle fallback: on a busy page the timeout used to inject gtag inside
    the TBT window (~1.2 s long task on mobile). A WhatsApp click forces the
    injection immediately (`ensureGtagLoaded`), so `generate_lead` stays reliable
    even with no prior gesture.
- **Security first:**
  - Strict Content Security Policy (CSP) via `netlify.toml`.
  - HSTS, X-Frame-Options and Permissions Policy configured.
- **Analytics:** `gtag.js` + `dataLayer` tracking with a dual pipeline for WhatsApp
  clicks: conversion events (`generate_lead`) in GA4 and a durable **first-party**
  record in Netlify Blobs (survives ad-blockers). Captures UTMs,
  `gclid`/`gad_campaignid` and resolves Google Ads ids into readable campaign names.

## 🛠️ Technology stack
- **Languages:** HTML5, CSS3, JavaScript (vanilla).
- **Styling:** Tailwind CSS (compiled and minified).
- **Deployment:** CI/CD via Netlify.
- **Widgets:** Elfsight (Google Reviews integration).
- **Tracking:** gtag.js (GA4) + Netlify Functions/Blobs for first-party metrics.

---

## 📂 Repository layout
```bash
.
├── public/                 # Public assets and built pages (production root)
│   ├── cardiologia/        # Specialised LP - Dra. Anabel Lima
│   ├── assets/             # Static assets (compiled CSS, images, JS)
│   ├── 404.html            # Custom error page
│   ├── index.html          # Main LP - Dr. Gilberto (infectiology)
│   ├── llms.txt            # AI agent summary mapping
│   └── sitemap.xml         # SEO indexing
├── src/                    # Source files
│   └── css/input.css       # Tailwind entry point
├── netlify/                # Serverless functions (Netlify Functions)
│   └── functions/          # log-access (collection) and insights (aggregation)
├── scripts/                # CLI diagnostics and reports
│   ├── analyze-performance.js   # npm run analyze
│   ├── run-perf.js              # npm run perf (mobile Lighthouse)
│   ├── fetch-ga4-metrics.js     # npm run ga-metrics
│   ├── fetch-access-insights.js # npm run access-logs
│   ├── weekly-report.js         # npm run weekly-report (GHA email)
│   └── test-csp.js              # npm run test
├── netlify.toml            # Headers, security and build config
├── package.json            # Automation scripts
└── tailwind.config.js      # Design-system customisation (colours and fonts)
```

---

## ⚙️ Development workflow

### 1. Install
```bash
npm install
npm run hooks:install   # enables the secret-scan pre-commit (.githooks)
```

### 2. Production build (CSS)
Writes the optimised, minified file to `public/assets/css/style.css`:
```bash
npm run build:css
```

### 3. Local preview
`serve` or the Netlify CLI both work:
```bash
npx serve public
```

---

## 📊 Metrics and log routine

Two-layer conversion pipeline:

- **First-party (trustworthy source of truth):** WhatsApp clicks and page views are
  sent via `navigator.sendBeacon` to the Netlify function `log-access`, persisted
  durably in **Netlify Blobs** (ad-blocker proof) and read by `insights`.
- **Google (GA4):** the same click fires `generate_lead` through `gtag.js` for
  attribution and Google Ads optimisation. Requires GA4 Admin setup (mark
  `generate_lead` as a conversion and register the `campaign_id` dimension).

**Consent-light first-party identity:** each visit gets a UUID kept in memory only
(no cookies), so events can be joined into users/sessions without a cookie banner.

**Honest funnel metrics (`access-logs` report):**
- `Engagement` = WhatsApp clicks / page views (a click-through rate, not a conversion rate).
- `Lead rate (proxy)` = WhatsApp exits (`message_sent`, tab-hidden) / page views.
- `Unique users` by `client_id`; clicks and leads per campaign/specialty with readable names.
- `Estimated visitors` (`estimated_visitors`): because `client_id` is a per-page-load
  UUID, it over-counts returning visitors. The estimate groups events by a **weak,
  non-durable** server-side key derived from `ip + user_agent + 24h window` (opaque
  hash), for reporting only — no cookie, no new JS, no CSP change, and it never
  becomes a stable device identifier. It is an estimate, not identity: a shared IP
  with the same UA can merge different people; outside the window the same visitor
  is counted again on purpose.
- Sources and campaigns are **canonicalized server-side** (readable labels for
  Google Ads ids; no raw referers carrying `gclid`). **Deploy-preview/test** traffic
  is bucketed separately and excluded from the production funnel.

**Routine commands:**
```bash
npm run analyze        # performance / Web Vitals diagnostics
npm run perf           # mobile Lighthouse (index + cardiologia) for before/after
npm run perf:check     # Web Vitals gate (fails when the budget is exceeded)
npm run access-logs    # first-party access and conversion metrics (production)
npm run ga-metrics     # Google Analytics 4 metrics (requires GA4_PROPERTY_ID in .env)
npm run weekly-report  # conversion report (first-party + GA4) - weekly email
npm run product-report # product report (scroll/attention) - monthly email
npm run test           # CSP and pipeline-integrity test suite
```

> **Two reports, two audiences.** The **weekly** one answers "how many contacts
> arrived" (media decisions). The **monthly** one answers "how people use the site"
> (CRO decisions). They are separate on purpose: mixing conversion with behaviour
> makes both harder to read.

### Web Vitals: measured in CI, not in the browser

Core Web Vitals left RUM (GA4) and became a **CI gate**
(`.github/workflows/perf.yml` + `scripts/perf-check.js`). The lab is deterministic,
measures the pushed code **before deploy** and **fails the build** when the
performance budget is exceeded. Browser RUM fired on every layout-shift/LCP entry
(~19x per visit) and polluted the GA4 event count without feeding any decision.

> Note: the `log-access`/`insights` functions require a Netlify deploy to take
> effect, and the newer fields (`client_id`, `campaign_label`) only apply to events
> recorded after that deploy.

### Automatic weekly report (GitHub Actions)

`.github/workflows/weekly-metrics.yml` runs **every Saturday at 08:00 (BRT)** and
emails the first-party + GA4 funnel report. The logic lives in
`scripts/weekly-report.js`; the YAML only collects, writes the bodies and sends.

**Required secrets** (Settings → Secrets and variables → Actions):

| Secret | Description |
|---|---|
| `MAIL_USERNAME` | sender Gmail address (e.g. `you@gmail.com`) |
| `MAIL_PASSWORD` | 16-character **App Password** (Google 2FA required) |
| `MAIL_TO` | recipient (may be the sender) |
| `GA4_CREDENTIALS` | **full** content of `ga-credentials.json` (service account) |

`GA4_PROPERTY_ID` (`493028300`) and the window are not secrets — they live in the
workflow `env`. Without `GA4_CREDENTIALS` the report is still sent first-party only
(the `insights` endpoint is public). The workflow also publishes the report as an
**artifact** (30 days), so an email failure does not lose the numbers.

> **Ads (cost/BRL) is not part of the email.** The CLI in `ads/` is gitignored and
> uses interactive OAuth, incompatible with a runner. For the funnel with cost, run
> `npm run ads-report` locally (see `AGENTS.md`).

### Monthly product report (GitHub Actions)

`.github/workflows/monthly-product.yml` runs on the **first Saturday of the month**
and emails the on-site behaviour report (scroll depth, buttons, attention sources).
The logic lives in `scripts/product-report.js`.

It uses the **same email secrets** as the weekly job (`MAIL_USERNAME`,
`MAIL_PASSWORD`, `MAIL_TO`) and needs no GA4 credential (the source is first-party).

> `scroll_depth` only appears after the deploy that started sending it to the
> first-party store; until then the report shows zero in the scroll bars.

---

## 🔐 Security and good practices
The project follows **OWASP** guidance for static sites, implementing headers that
mitigate clickjacking and XSS so the site is a safe environment for medical
information.

**Recent hardening and SEO work:**
- **SEO and local metadata:** FAQPage structured data plus visible FAQ sections
  built on native `<details>` elements. Complete Twitter Cards and Open Graph
  metadata.
- **AI agent integration (`llms.txt`):** structured service summary in Markdown
  (`public/llms.txt`) to make life easier for LLMs and modern search bots.
- **Tightened CSP:** UI JavaScript (observer, footer year) moved to an external file
  (`public/assets/js/main.js`), cleaning up the HTML markup and organising the
  security directives, while keeping the marketing stack working (gtag.js/GA4 and
  Google Ads).
- **Strict HSTS (preload):** `Strict-Transport-Security` set to one year
  (`max-age=31536000`) with the `preload` flag, telling modern browsers to force the
  secure connection before the first request is even dispatched.

### Credential protection (secret scanning)

Secrets must never reach Git. Defence is in **three independent layers**:

| Layer | Tool | Where it acts | Covers |
|---|---|---|---|
| 1. GitHub | Secret Scanning + Push Protection | remote | ~200 provider patterns; **blocks the push** |
| 2. CI | `gitleaks` (`.github/workflows/gitleaks.yml`) | push/PR + weekly | full history; rules + entropy; fork PRs |
| 3. Local | `gitleaks` pre-commit (`.githooks/`) | before commit | whatever has not left the machine yet |

> **Dependabot** covers dependencies (CVEs), **not** secrets. The layers above are
> what handle leaked credentials.

**Local setup (once):**
```bash
npm run hooks:install     # core.hooksPath=.githooks
# optional, full protection at commit time:
# install gitleaks -> https://github.com/gitleaks/gitleaks#installing
npm run secret-scan       # manual full-history scan
```

The false-positive allowlist lives in **`.gitleaks.toml`** — it is minimal and
**regex-based** (e.g. the first-party visitor UUID `client_id`, which is not a
credential). Never whitelist a whole file: a file that only mentions a field name
today may hold a real key tomorrow.

---
*Built with a focus on real results and technical excellence.*
