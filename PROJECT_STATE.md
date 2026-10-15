# Project State & Real-Time Operational Tracker
**Gateway:** Divya Yoga Mandali Charitable Trust (DYMCT) & The Art Of Relaxation (AOR)  
**System:** PayPal Cross-Border & Domestic UPI Non-Profit Regulatory Gateway (`paypal-fcra-crossborder-engine`)  
**Last Updated:** October 2026 | **Current Version:** v2.5.0+ (Production Ready)

---

## 1. Quick Reference & Live Endpoints

| Resource | Live Production Link | Status |
| :--- | :--- | :--- |
| **Primary Custom Domain** | [https://artofrelaxation.org](https://artofrelaxation.org) | 🟢 Live, SSL Verified & Cloudflare CDN |
| **Direct Giving Route** | [https://artofrelaxation.org/donate](https://artofrelaxation.org/donate) | 🟢 Live & Operational |
| **Public Donor Portal (Render)** | [https://dymct-aor-gateway.onrender.com](https://dymct-aor-gateway.onrender.com) | 🟢 Live & Operational |
| **Trustee Workspace (Admin)** | [https://artofrelaxation.org/admin](https://artofrelaxation.org/admin) | 🟢 Live & Operational |
| **Health Check API** | [https://artofrelaxation.org/api/health](https://artofrelaxation.org/api/health) | 🟢 200 OK |
| **GitHub Repository** | [pruthvivadlamudi/crossborder-nonprofit-gateway](https://github.com/pruthvivadlamudi/crossborder-nonprofit-gateway) | 🟢 Synced (`main`) |
| **Keep-Alive Daemon** | UptimeRobot (pings `/api/health` every 5 min) | 🟢 Zero Cold Starts |

---

## 2. Institutional Entities & Banking Profiles

### Entity 1: Divya Yoga Mandali Charitable Trust (DYMCT) - Primary Trust
- **Managing Trustee:** Sri Vijaya Pratap Maharaj
- **Settlement Bank:** Designated Scheduled Bank (Hyderabad) — Configured securely via Render Environment Variables
- **Institutional PAN:** Configured securely via Render Environment Variables
- **UPI VPA:** `divyayoga.mandali@sbi` (Production UPI rails)
- **PayPal Mode:** Sandbox active (ready for Live switch)

### Entity 2: The Art Of Relaxation (AOR) - Secondary Project
- **Managing Trustee:** Sri Vijaya Pratap Maharaj
- **Settlement Bank:** Designated Scheduled Bank (Secunderabad) — Configured securely via Render Environment Variables
- **Institutional PAN:** Configured securely via Render Environment Variables
- **UPI VPA:** `artofrelaxation@kvb` (Production UPI rails)
- **PayPal Mode:** Sandbox active (ready for Live switch)

---

## 3. What We Have Done So Far (Completed & Verified Live)

- [x] **Zero-Cost Production Hosting on Render & Continuous CI/CD:**
  - Automated deployment via Render Deploy Hook (`https://api.render.com/deploy/srv-xxxxxx?key=your_deploy_key`) and `render.yaml`.
  - GitHub Actions automated CI/CD workflow (`.github/workflows/deploy.yml`) runs on every `push` to `main`, validating 53 tests and triggering Render live deploy.
  - 1-click local deploy via `npm run deploy` or `deploy.bat`.
  - Zero cold starts via UptimeRobot 5-minute health check daemon.
  - Resolved Linux GLIBC compatibility by pinning Node 20 LTS and sqlite3 5.1.7.
- [x] **Privacy Sanitization & Centered Donation Hub:**
  - Removed sensitive institutional PANs and settlement bank details from public website cards.
  - Removed redundant `.info-column` from the donation portal and centered the contribution card (`max-width: 680px`).
  - Removed obsolete badges (`10,000+ Meals Served`), statutory integrity section, and extra 80G tax accordion per user design specifications.
  - Enforced strict, mandatory First Name, Last Name, and Email inputs before payment initiation so receipts and tax summaries are automatically dispatched to donors from the custom domain.
  - Refactored transaction recording and ledger logic: prevented premature order logging during amount changes/inputs on PayPal and UPI flows; transactions and ledger mirror events are now strictly recorded post-capture/post-verification.
  - Filtered Trustee Live Donations Ledger to processed and captured transactions (`WHERE d.status = 'CAPTURED'`).
  - Fixed Admin portal live simulation active indicator: restored dynamic state tracking so the active blue highlight marker moves dynamically between selected amounts and custom input.
  - Cleaned hero stats ribbon to 3 serene spiritual wellness pillars (Spiritual Lineage, Daily Meditation, Mindful Living).
  - Updated all Managing Trustee references to **Sri Vijaya Pratap Maharaj**.
  - Refined Footer Component to mirror reference design: removed obsolete left navigation links, newsletter subscription, and app download blocks; updated physical address to Hyderabad headquarters (Registered Trust Office, Hyderabad, Telangana, India); preserved official phone (+91 9553946629) and email channels; aligned social media icons (Facebook, X, LinkedIn, YouTube, Instagram) and "All Social Media Handles" link; added solid dark opaque background (zero top transparency); added full-width divider with pipe-separated copyright bar and interactive modals for Terms & Conditions and Privacy Policy; fully optimized responsive stacking for mobile screens (< 768px down to 320px).
- [x] **Full Organization Website & Integrated Donation Hub (Option A):**
  - Seamless unified non-profit website on `artofrelaxation.org` featuring:
    * Sticky glassmorphic navbar with smooth-scroll navigation (`#about`, `#teachings`, `#programs`, `#sister-trusts`, `#donate`, `#contact`).
    * Immersive spiritual Hero section with Sanskrit invocations and 3-item spiritual metrics ribbon.
    * In-depth narrative on Sri Vijaya Pratap Maharaj, spiritual philosophy, and the dual-pillar model (Sadhana + Seva).
    * 3 Pillars of Stillness (Pranayama, Dhyana, Sattvic Living) & 4 Core Seva Initiatives (Annadanam, Retreats, Rural Health, Youth Workshops).
    * Sister Trust Lineage presentation with clean trust mission and leadership.
    * Centered dual-rail donation console with trust switcher, PayPal USD/Global, domestic UPI QR standee, UTR submission, and instant receipt modal.
    * Direct dedicated `/donate` routing with automatic smooth-scroll into the contribution console.
- [x] **Dual-Screen Architecture:**
  - Screen 1: Public Donor checkout with trust switcher, dynamic FX conversion, PayPal Smart Buttons, and open/preset amount QR Standee.
  - Screen 2: Trustee Workspace with KPI cards, Chart.js visual analytics, line-item financial waterfalls, and 1-click snapshot management.
- [x] **Domestic UPI Donation Rail:**
  - Dynamic QR codes scannable by Google Pay, PhonePe, Paytm, BHIM.
  - 1-tap mobile app deep links.
  - Bank UTR reference submission with duplicate replay attack prevention.
- [x] **Cross-Border PayPal Gateway:**
  - PayPal Orders v2 integration with cryptographic webhook verification.
  - Resolved PayPal popup `about:blank` issue via `same-origin-allow-popups` COOP header.
- [x] **Statutory Compliance & Donor KYC:**
  - FCRA 2020 & Rule 13 compliance (collects Nationality, Passport/National ID, Address, NRI flag).
  - 1-click Ministry of Home Affairs (MHA) Form FC-4 CSV report generator.
  - Income Tax Section 80G compliant automated tax receipts with 1-click printable receipt cards.
- [x] **Security & DPDP Data Protection:**
  - AES-256-GCM column-level encryption for all sensitive donor PII.
  - Bcrypt (12 rounds) & timing-safe equality for trustee admin credentials.
  - Secure database-backed forgot password flow with 256-bit single-use reset tokens and post-change alert emails.
  - Content Security Policy Level 3 via Helmet v8 and dual-tier rate limiting.
  - `npm audit` 0 vulnerabilities and zero secrets leak verified by automated scanner.
- [x] **Database Redundancy & Crash Proofing:**
  - SQLite WAL (Write-Ahead Logging) mode with `PRAGMA synchronous = NORMAL`.
  - Append-only immutable mirror ledger (`backups/donations_ledger_mirror.jsonl`) with SHA-256 chain integrity hashes.
  - Automated hot atomic snapshots (`backups/donations_backup_*.sqlite`) on boot, captures, and on-demand.
  - 94 Donors & 94 Donations recorded in ledger.
- [x] **Transactional Email Engine:**
  - Integrated with Resend API with verified official custom domain sender `receipts@artofrelaxation.org` (DKIM & SPF verified on Cloudflare).
  - Tested and live verified with dispatch logs in DB.
- [x] **Automated Testing Suite:**
  - 53 Jest unit & integration tests passing (4 suites).
  - Playwright E2E testing suite for desktop and mobile flows.

---

## 4. What Is Pending & Immediate Next Steps (Prioritized)

| Priority | Task | Description | Status |
| :---: | :--- | :--- | :---: |
| **P1** | **Switch PayPal from Sandbox to Live** | In Render Dashboard, switch `PAYPAL_ENVIRONMENT=live` and supply Live Production Client ID & Secret for DYMCT and AOR once live credentials are ready. | ⏳ Pending User Action |
| **P2** | **Primary Custom Domain (`artofrelaxation.org`)** | Successfully acquired on Cloudflare Registrar, bound to Render with CNAME flattening, SSL issued, and `/donate` route live. (`layayogapeace.org` ready when user desires). | 🟢 Completed & Live |
| **P3** | **Official Domain Email Verification (`artofrelaxation.org`)** | Resend DKIM and SPF records authorized and verified in Cloudflare via Domain Connect. Successfully verified live test dispatch from `receipts@artofrelaxation.org`. | 🟢 Completed & Verified |
| **P4** | **GitHub Actions Audit Safeguards Pinning** | `deploy.yml` passes 100% green and syncs to Render. The scheduled `security-audit.yml` identified transitive sub-dependencies (`handlebars` 4.7.9 and `http-cache-semantics` 4.2.0). Resolution ready via `overrides` in `package.json`. | 🟢 Diagnosed & Parked |
| **P5** | **Database Scalability Transition (If Needed)** | If donation transactions scale past thousands/month, connect to free Turso (libsql) or Supabase (PostgreSQL) via `DATABASE_URL`. | ⏳ Future Scale |

---

## 5. Quick Commands Cheat Sheet

- **Instant Project Status Check:** `npm run status`
- **Run Development Server:** `npm run dev` (or double-click `run.bat`)
- **Run Complete Test Suite:** `npm test`
- **Run Secret Scanner:** `npm run scan:secrets`
- **Compile Production Build:** `npm run build`
- **Deploy & Sync to Render:** `npm run deploy`
