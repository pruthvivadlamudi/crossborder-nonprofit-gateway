# Project Version Log & Master Audit Trail

All architectural revisions, compliance assessments, database modifications, legal frameworks, and integration milestones for the **PayPal Cross-Border Non-Profit Remittance System** are documented in this registry.

## [v2.5.0] - 2026-09-25
### Architectural Reorganization, Structured Logging Subsystem & 100% Free-Tier DevOps Strategy
- **Project Structure Reorganization & Clean Root**:
  - Isolated all non-runtime documentation, legal analysis, and institutional records into `/docs/` (`docs/functional/`, `docs/compliance/`, and `docs/institutional-records/`).
  - Purged all exploratory scripts, raw notes, and non-core markdown files from root to achieve a clean production runtime footprint.
- **Enterprise System-Wide Structured JSON Logging**:
  - Authored `src/logger.ts` with typed log levels (`DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`).
  - Implemented Express `requestLoggingMiddleware` providing end-to-end `x-correlation-id` tracing, client latency measurement, and sanitized request contexts.
  - Enforced automated sensitive field masking (PCI DSS / FCRA protection for passwords, bearer tokens, and national identification numbers).
  - Configured dual streaming: NDJSON to container standard streams (`stdout`/`stderr`) and local rolling files (`logs/app-*.log`, `logs/error-*.log`).
- **Free-Tier 7-Day Rolling Retention & Storage Protection**:
  - Built automatic age-based log pruning (7-day window) and 5 MB per-file rotation, enforcing a strict 15 MB local disk budget to prevent container exhaustion.
  - Implemented asynchronous non-blocking webhook dispatcher for offloading `ERROR` and `FATAL` events to free external monitors (Sentry / Logtail).
- **100% Free-Tier DevOps & Deployment Strategy (`FREE_TIER_DEPLOYMENT_STRATEGY.md`)**:
  - Formulated comprehensive multi-platform evaluation comparing Oracle Cloud Always Free, Render, Vercel, Cloudflare Pages/Workers, and Koyeb.
  - Analyzed operational quotas, cold-start latencies, webhook delivery SLA risks, and persistent volume constraints.
  - Established a 5-phase security test plan (SAST, DAST, SSL Labs, Security Headers, and Webhook cryptographic validation).
- **Step-by-Step OCI Always Free Deployment Blueprint (`OCI_DEPLOYMENT_GUIDE.md`)**:
  - Authored comprehensive guide detailing zero-cost deployment on Oracle Cloud Infrastructure (VM.Standard.A1.Flex Ampere ARM / AMD Micro).
  - Outlined VCN ingress rules, OS iptables persistence, Node.js 20 LTS setup, PM2 process management, Caddy automated TLS/SSL reverse proxying, idle reclamation prevention, and PayPal webhook configuration.

---

## [v2.4.0] - 2026-09-25
### Dual-Screen Separation, Zero-CVE Security Hardening, Database Redundancy & Live Visual Analytics
- **Two Distinct Presentation Screens**:
  - **Screen 1 (Pure Public Donor Portal - `http://localhost:3000` or `/donate`)**:
    * Clean, dedicated donor experience without administrative links, dashboard buttons, or simulation toggles.
    * Real-time trust switcher between Primary Charitable Trust and Secondary Associated Project.
    * Official in-page Tax Receipt Card upon PayPal approval with 1-click print capability.
  - **Screen 2 (Trustee Administrative Console & Workspace - `http://localhost:3000/admin`)**:
    * Dual-workspace tabs allowing seamless switching between **Analytics & Compliance Suite** and an **Embedded Live Donor Portal & Simulation Preview**.
    * Administrative simulation controls for generating test donations and testing banking attribution.
- **Zero-CVE Security & Vulnerability Hardening**:
  - Remediated all NPM package vulnerabilities; `npm audit` returns **0 vulnerabilities** (upgraded `uuid` and `sqlite3@6.0.1`).
  - Implemented **Helmet** security headers with tailored Content-Security-Policy (CSP), framing restrictions, and MIME sniff defense.
  - Enforced API rate-limiting via **express-rate-limit** (DDoS mitigation) and strict authentication rate-limiting.
  - Built cryptographic HMAC token authentication (`POST /api/admin/login`, protected with `ADMIN_PASSWORD`).
- **Database Redundancy & Crash-Proof Durability**:
  - Enabled **SQLite WAL Mode (Write-Ahead Logging)** with `PRAGMA synchronous = NORMAL` for atomic, crash-proof ACID transactions.
  - Implemented an **Append-Only Immutable Ledger Mirror** (`backups/donations_ledger_mirror.jsonl`) with SHA-256 integrity hashing on every transaction.
  - Automated atomic backup engine (`backups/donations_backup_*.sqlite`) triggered automatically on server boot, payment captures, and on-demand via the admin console.
- **Interactive Visual Analytics & Chart Suite (Chart.js)**:
  - Added live time-series area chart tracking foreign inflows over time.
  - Added trust entity allocation donut chart (Primary Trust vs. Secondary Project).
  - Added global donor distribution bar chart by country of origin (US, UK, UAE, CA, etc.).
  - Added statutory FCRA classification pie chart (NRI vs. Foreign National).
- **Granular Transaction Line Items & Subline Items Inspector**:
  - Interactive drawer detailing individual transaction financial waterfall: Gross USD, PayPal fees, Net proceeds, Wholesale FX rate (~₹83.50/USD), Realized INR, Settlement Bank, RBI Purpose Code (`P1109`), and FCRA Financial Year (`2026-2027`).
  - Full donor KYC subline items and immutable 4-stage audit lifecycle timeline.
- **Live Information Auto-Syncing**:
  - Configured 8-second reactive background polling with pulsating green status indicator and instant manual sync.

---

## [v2.3.0] - 2026-09-23
### Dedicated PayPal Account Setup Entry Guide Formulated
- **Created `PAYPAL_DETAILS.md`**:
  - Authored screen-by-screen form entry values and document checklist for authorized managing trustees.
  - Specified exact Business Type selection (`Trust / Non-Profit / Charity`), character-matched entity names, institutional vs. personal PAN segregation, and RBI Purpose Code `P1301`.
  - Detailed bank account mapping for designated settlement bank accounts.
  - Added micro-deposit confirmation steps, charity discounted rate application process (1.99% + $0.49), and developer API credential generation for `.env`.

---

## [v2.2.0] - 2026-09-23
### Production Cloud Hosting Matrix & Zero-Cost Infrastructure Formulation
- **Comprehensive Cloud Hosting Analysis**:
  - Detailed zero-cost and low-cost deployment platforms meeting non-profit financial, regulatory, and security criteria:
    1. **Render.com**: 100% Free tier, automated SSL, custom domain binding, Cloudflare DDoS defense, zero server maintenance.
    2. **Google Cloud Run**: Enterprise-grade Google infrastructure, permanent 2M free requests/month, SOC 1/2/3, ISO 27001 & PCI-DSS certified.
    3. **Railway.app / Fly.io**: Fast containers with persistent volume support for embedded SQLite databases.
    4. **Vercel**: Edge-cached frontend with serverless API integration.
- **Operational Cost Formulation**: Confirmed annual operating cost to the Trust is **₹0.00** ($0.00 platform hosting + optional ₹800–₹1,200/yr custom domain).
- **Deployment Blueprint**: Added step-by-step 5-minute deployment guide for Render and Google Cloud Run in `IMPLEMENTATION_PLAN.md`.
- **Security Chapter**: Documented TLS 1.3 encryption, automatic secret management, and DDOS mitigation in `EXECUTIVE_REPORT.md`.

---

## [v2.1.0] - 2026-09-23
### Brand-Aligned Dynamic QR Code Standee & Link Sharing Modal
- **Entity-Branded Standee UI**:
  - Embedded dynamic QR code generation directly into the donor portal modal (`src/public/index.html`).
  - Added physical standee framing displaying the active Trust's legal name, registered logo, and settlement bank badge.
- **Smart Link Sharing**:
  - Implemented 1-click clipboard URL copying with pre-selected trust parameters (`?trust=divya` or `?trust=relaxation`).
  - Enabled mobile donors to scan physical banners, flyers, or desktop screens to instantly load the KYC donation interface on smartphones.

---

## [v2.0.0] - 2026-09-23
### Turnkey Production Engine Built & Operational
- **Full-Stack Application Deployment**:
  - **Backend API (`src/server.ts`)**: Built with Express and TypeScript. Implemented PayPal Orders v2 API (`/api/paypal/create-order`, `/api/paypal/capture-order`), dynamic trust routing, and cryptographic webhook verification.
  - **Zero-Setup Database Layer (`src/db.ts`)**: Implemented dual-driver database logic that connects to PostgreSQL when `DATABASE_URL` is set, and automatically falls back to an embedded SQLite file (`donations.sqlite`) for local operation.
  - **Donor Portal (`src/public/index.html`)**: Real-time multi-trust switcher, dynamic currency amount presets ($25, $50, $100, custom), and KYC compliance validation.
  - **Trustee Compliance Dashboard (`src/public/admin.html`)**: Real-time KPI summaries (Foreign Inflow USD, Realized INR, Total Donors), live transaction ledger, and 1-click Ministry of Home Affairs (MHA) Form FC-4 CSV exporter.
  - **1-Click Launcher (`run.bat`)**: Developed a double-clickable Windows batch launcher that validates Node.js, installs dependencies if absent, launches `http://localhost:3000`, and starts the development server.
- **Local Verification**: Successfully executed end-to-end sandbox donation simulations, ledger recording, and CSV export.

---

## [v1.11.0] - 2026-09-23
### Donor KYC Gatekeeper & Client-Side Compliance Validation
- **Mandatory FCRA KYC Enforcement**:
  - Implemented strict client-side validation locking PayPal buttons until the donor provides Legal Name, Nationality, Country of Residence, Physical Address, and Passport/Tax ID.
  - Integrated NRI (Non-Resident Indian) toggle to automatically flag Indian passport holders for separate accounting.
- **Dynamic Bank Profile UI**:
  - Added live entity switcher dynamically toggling settlement bank badges:
    * Primary Non-Profit Trust ➔ Designated National Bank (`BANK0000001`, A/c `...XXXX`).
    * Secondary Project ➔ Partner Commercial Bank (`BANK0000002`, A/c `...YYYY`).

---

## [v1.10.0] - 2026-09-23
### Multi-Trust Backend Routing & PayPal Orders v2 Engine
- **Server Architecture**:
  - Developed `src/server.ts` utilizing the official PayPal REST APIs v2.
  - Built OAuth 2.0 token management with automated in-memory caching and renewal.
  - Created `/api/trust-profiles` endpoint providing authenticated client metadata.
- **Cryptographic Webhook Verification**:
  - Implemented `/api/paypal/webhook` endpoint with raw buffer preservation for SHA256 RSA signature validation against PayPal's root certificates (`PAYPAL-CERT-URL`, `PAYPAL-TRANSMISSION-SIG`).

---

## [v1.9.0] - 2026-09-23
### Zero-Setup Dual-Engine Database Architecture
- **Unified Query Interface**:
  - Developed `src/db.ts` providing parameterized query translation between PostgreSQL syntax (`$1, $2`) and SQLite syntax (`?`).
  - Automated database table bootstrapping on boot: `donors`, `transactions`, `audit_logs`, and `system_settings`.
  - Removed mandatory PostgreSQL local installation friction, enabling immediate execution on any machine.

---

## [v1.8.0] - 2026-09-23
### FCRA-Compliant Database Schema Specification
- **Database Model Design**:
  - Formulated `schema.sql` tailored for Indian Ministry of Home Affairs compliance:
    * `donors` table: Tracks legal identity, foreign passport/national ID, nationality, address, and NRI flag.
    * `transactions` table: Captures PayPal Order ID, capture ID, gross USD, gateway fee, net proceeds, wholesale interbank FX rate, realized INR, settlement bank account, and Purpose Code (`P1301`).
    * `audit_logs` table: Immutable event logging for webhook deliveries, status changes, and exports.
  - Created pre-configured view `v_fcra_annual_returns` matching official Form FC-4 reporting columns.

---

## [v1.7.0] - 2026-09-23
### Executive Briefing & Strategic Compass Released
- **Trustee Plain-English Report**:
  - Authored `EXECUTIVE_REPORT.md` tailored for board trustees, legal advisors, and executive leadership.
  - Formulated the "Where Does the Money Go?" transaction waterfall analysis detailing the exact loss breakdown on a $100 donation (PayPal fee: ~1.99%+$0.49, FX spread: ~3.5%, Bank remittance: ₹100–₹350).
  - Clarified tax separation guaranteeing zero personal income tax exposure for individual trustees.

---

## [v1.6.0] - 2026-09-23
### Compliant Dual-Entity Operational Blueprints
- **Statutory Operational Models**:
  - Formulated **Blueprint 1 (The Dual-Entity / "Friends of" 501(c)(3) Model)**: Incorporation of overseas non-profit entity, US PayPal Business account, and institutional SWIFT wire to SBI New Delhi Main Branch.
  - Formulated **Blueprint 2 (Fiscal Sponsorship Model)**: Onboarding with accredited global fiscal partners (Give.do, GlobalGiving, CAF America) to disburse institutional grants directly into SBI NDMB.

---

## [v1.5.0] - 2026-09-23
### Donor KYC Specification (FCRA Rule 13)
- **Legal KYC Requirements Defined**:
  - Analyzed Section 18 and Rule 13 of the Foreign Contribution (Regulation) Rules, 2011.
  - Established mandatory data collection rules: prohibited anonymous checkouts, mandated country classification, and defined digital donor KYC record retention requirements.

---

## [v1.4.0] - 2026-09-23
### RBI Purpose Code & e-FIRC Analysis
- **Remittance Classification**:
  - Researched Reserve Bank of India (RBI) Foreign Exchange Management regulations.
  - Identified Purpose Code **`P1301`** (Humanitarian / Social Grants / Non-Profit Contributions) as the only legitimate code for charitable inward remittances.
  - Contrasted with commercial codes (`P0802`, `P0803`) used by standard export aggregators.
  - Established electronic Foreign Inward Remittance Certificate (e-FIRC / FIRA) documentation workflow.

---

## [v1.3.0] - 2026-09-23
### Entity Tax Segregation & Banking Profile Mapping
- **Institutional Identity Verification**:
  - Confirmed institutional PAN registrations for primary and secondary non-profit projects.
  - Mapped primary settlement bank accounts.
  - Confirmed authorized signatory role of Managing Trustees, ensuring separation between individual personal tax returns and institutional 12A/80G tax exemptions.

---

## [v1.2.0] - 2026-09-23
### Payment Aggregator & Intermediary Pooling Assessment
- **Regulatory Conflict Identification**:
  - Analyzed why commercial aggregators (PayPal India, Razorpay, Cashfree) fail statutory FCRA compliance.
  - Identified RBI PA-CB / OPGSP intermediary pooling conflict: aggregators pool foreign exchange in domestic nodal accounts and disburse funds via domestic NEFT in INR, breaking the direct foreign SWIFT MT103 audit trail required by the Ministry of Home Affairs.

---

## [v1.1.0] - 2026-09-23
### Statutory Framework Mapping: FCRA 2010 vs. FEMA 1999
- **Regulatory Framework Demarcation**:
  - Mapped statutory authority: Ministry of Home Affairs (MHA) under FCRA 2010 vs. Reserve Bank of India (RBI) under FEMA 1999.
  - Detailed Section 17(1) of the FCRA Amendment Act, 2020: mandate that all foreign contributions must be received exclusively through the **State Bank of India, New Delhi Main Branch (NDMB), 11 Sansad Marg, New Delhi**.
  - Compiled detailed compliance guide into `COMPLIANCE_GUIDE.md`.

---

## [v1.0.0] - 2026-09-23
### Initial Project Inception & Risk Assessment
- **Problem Statement**:
  - Facilitate international donation acceptance via PayPal for registered Indian charitable organizations.
  - Identify and mitigate risks related to personal income tax (IT Act Section 56(2) gift taxation), Annual Information Statement (AIS) high-value transaction flags, and regulatory compliance under Indian remittance laws.
