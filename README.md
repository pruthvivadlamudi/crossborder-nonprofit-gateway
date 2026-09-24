# Cross-Border Donation & FCRA Compliance System

### Enterprise Non-Profit FinTech Engine for Cross-Border Philanthropy & Statutory Compliance

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Security: Helmet & CSP](https://img.shields.io/badge/Security-Helmet_v8_CSP_Enforced-purple.svg)](https://helmetjs.github.io/)
[![Audit: 0 Vulnerabilities](https://img.shields.io/badge/npm_audit-0_vulnerabilities-brightgreen.svg)](https://docs.npmjs.com/cli/v10/commands/npm-audit)
[![Storage: Free--Tier Optimized](https://img.shields.io/badge/Storage-7--Day_Rolling_Retention-orange.svg)](#6-system-wide-structured-logging--free-tier-retention-policy)

---

## 1. System Overview

This application is a specialized FinTech portal designed for registered Indian public charitable trusts and non-profit organizations receiving foreign contributions in full compliance with:
* The **Foreign Contribution (Regulation) Act, 2010 (FCRA)** (as amended in 2020).
* **Reserve Bank of India (RBI)** cross-border remittance guidelines (FEMA / Purpose Code `P1301`).
* **Ministry of Home Affairs (MHA)** Form FC-4 annual reporting mandates.

The system features **two independent screens**, zero-vulnerability security headers, database redundancy with crash protection, and a free-tier optimized structured logging engine.

---

## 2. Dual-Screen Architecture

| Interface | URL | Purpose & Capabilities |
| :--- | :--- | :--- |
| **Donor Portal (Screen 1)** | `http://localhost:3000/` | Public-facing international checkout. Dynamic trust selector, real-time FX estimation (USD to INR), mandatory KYC collection, PayPal Smart Buttons integration, and live QR code fallback. |
| **Trustee Workspace (Screen 2)** | `http://localhost:3000/admin` | Restricted trustee console. Protected by timing-safe password authentication & signed tokens. Features real-time KPI metrics, visual analytics (line/donut charts), granular waterfall subline-item inspection, atomic snapshot management, and 1-click MHA Form FC-4 CSV export. |

---

## 3. Project Directory Structure

All documentation, specifications, and institutional records are cleanly separated into dedicated subdirectories under `/docs/`:

```
PayPal/
├── docs/                                # Dedicated Documentation Directory
│   ├── functional/                      # Architecture, implementation & walkthroughs
│   │   ├── IMPLEMENTATION_PLAN.md       # Architectural specifications & feature roadmap
│   │   ├── WALKTHROUGH.md               # User manual & functional demonstration guide
│   │   └── VERSION_LOG.md               # Historical milestones & upgrade logs
│   ├── compliance/                      # Statutory & Legal compliance assets
│   │   ├── COMPLIANCE_GUIDE.md          # FCRA 2020 legal framework, FEMA, & NDMB rules
│   │   ├── EXECUTIVE_REPORT.md          # Non-profit cross-border donation executive study
│   │   ├── PAYPAL_DETAILS.md            # Merchant onboarding & sandbox credential pack
│   │   └── schema.sql                   # Reference PostgreSQL production DDL schema
│   └── institutional-records/           # Archive of organizational records & agreements
├── src/                                 # Active Source Code
│   ├── server.ts                        # Express API server, security headers & routing
│   ├── db.ts                            # Redundancy layer (Postgres + SQLite WAL fallback)
│   ├── logger.ts                        # Enterprise structured logging & retention engine
│   └── public/                          # Client Web Assets
│       ├── index.html                   # Screen 1: Public Donor Portal
│       └── admin.html                   # Screen 2: Trustee Administration Workspace
├── backups/                             # Atomic Database Snapshots & Mirror Ledger
│   └── donations_ledger_mirror.jsonl    # Append-only SHA-256 tamper-evident ledger
├── logs/                                # Rolling Operational & Error Logs
│   ├── app-YYYY-MM-DD.log               # Daily operational activity log
│   └── error-YYYY-MM-DD.log             # Daily critical error log
├── .env                                 # Local configuration (never committed to git)
├── .gitignore                           # Excludes node_modules, logs, and live sqlite files
├── package.json                         # Node.js dependencies & scripts
├── tsconfig.json                        # TypeScript compiler options
└── README.md                            # Primary project index (this file)
```

---

## 4. Security & Hardening Architecture

The application has been audited and cleared of all known CVEs (`npm audit` reports **0 vulnerabilities**):
* **Strict Content Security Policy (CSP Level 3):** Enforced via Helmet v8 with whitelist controls for PayPal SDK, Google Fonts, and dynamic inline handlers.
* **Dual-Tier Rate Limiting:** Global API rate limit (180 req/min) and strict authentication rate limit (30 attempts/15 min) to prevent brute-force attacks.
* **Timing-Safe Authentication:** Trustee password comparison uses `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
* **Webhook Cryptographic Verification:** All incoming PayPal webhook events are verified against PayPal certificates before processing.

---

## 5. High-Availability Database Redundancy

The system provides dual-engine storage resiliency:
1. **Cloud PostgreSQL Support:** Connects automatically to managed PostgreSQL if `DATABASE_URL` is configured.
2. **Local SQLite WAL Resiliency:** Automatically activates Write-Ahead Logging (`PRAGMA journal_mode = WAL`) and `synchronous = NORMAL` for crash resistance on embedded or container filesystems.
3. **Hot Atomic Snapshots:** Runs SQLite `VACUUM INTO` snapshots automatically on startup, upon payment captures, and on-demand via the Trustee Workspace. Automatically retains the 15 most recent snapshots.
4. **Append-Only Immutable Mirror Ledger:** Writes every donor and donation event to an append-only JSONL file (`backups/donations_ledger_mirror.jsonl`) with cryptographic SHA-256 chain hashes for tamper evidence.

---

## 6. System-Wide Structured Logging & Free-Tier Retention Policy

To operate reliably on free-tier container platforms (e.g., Render, Google Cloud Run, Fly.io, Railway) where storage and memory are constrained, the application includes a purpose-built structured logging system in `src/logger.ts`:

### Key Features
* **Standard JSON Output:** Every log line is formatted with `timestamp`, `level`, `service`, `correlationId`, `action`, `message`, `context`, and `client`.
* **Request Correlation Tracing:** Every HTTP request receives a unique `x-correlation-id` header passed throughout the request lifecycle.
* **Automatic Sensitive Data Redaction:** Automatically scrubs passwords, secret tokens, and masks national IDs/passports (`***-***-1234`) to comply with PCI DSS and privacy standards.
* **Dual Streaming:** Directs logs to `process.stdout` / `process.stderr` for cloud native container capture while writing daily rolling files to `logs/`.
* **7-Day Rolling Retention:** On startup and rotation, `pruneOldLogs()` purges files older than 7 days.
* **Storage Cap:** Individual log files rotate at **5 MB**, guaranteeing that local disk usage remains strictly under 15 MB.
* **External Error Hook:** Optionally forwards critical `ERROR` and `FATAL` logs to external zero-cost monitoring endpoints (e.g., Sentry, Logtail, Slack webhook) via `EXTERNAL_LOG_WEBHOOK_URL`.

---

## 7. Quick Start & Execution

### Prerequisites
* Node.js v18 or higher
* npm v9 or higher

### Steps
1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Ensure `.env` contains your PayPal sandbox or live credentials:
   ```env
   PORT=3000
   PAYPAL_MODE=sandbox
   PAYPAL_CLIENT_ID=your_client_id
   PAYPAL_CLIENT_SECRET=your_client_secret
   ADMIN_PASSWORD=Trustee@2026!
   JWT_SECRET=fcra-super-secret-trustee-key-2026-audit
   LOG_LEVEL=INFO
   ```

3. **Build the Application:**
   ```bash
   npm run build
   ```

4. **Start the Production Engine:**
   ```bash
   npm start
   ```

5. **Access the Screens:**
   * **Donor Portal:** Navigate to `http://localhost:3000`
   * **Trustee Workspace:** Navigate to `http://localhost:3000/admin` (Passcode: `Trustee@2026!`)

---

## 8. Verification & Diagnostics

To run an automated health check verifying all core APIs:
```bash
node test_endpoints.js
```

To inspect rolling log files:
```bash
# View today's operational log
tail -f logs/app-*.log

# View errors only
cat logs/error-*.log
```
