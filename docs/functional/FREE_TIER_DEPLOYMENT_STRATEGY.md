# 100% Free-Tier Deployment Strategy & DevOps Evaluation

### Enterprise Architectural Assessment for Cross-Border FinTech & Non-Profit Gateway

---

## 1. Executive Summary & Application Technical Profile

Our application is an Express.js/TypeScript FinTech system designed for statutory FCRA donation processing with the following critical runtime characteristics:

* **State & Persistence:** Operates dual-engine database storage:
  - Primary production mode: Cloud PostgreSQL (if `DATABASE_URL` is set).
  - Embedded resilient mode: SQLite with Write-Ahead Logging (`WAL` mode), atomic database snapshots (`VACUUM INTO`), and an append-only JSONL mirror ledger with SHA-256 integrity hashing (`backups/donations_ledger_mirror.jsonl`).
* **Webhook Reliability SLA:** PayPal webhook events (`PAYMENT.CAPTURE.COMPLETED`) require synchronous HTTP 200 acknowledgments within 3–5 seconds. Cold starts exceeding this window trigger exponential retry delays and potential dropped status updates.
* **Dual-Interface Serving:** Serves Screen 1 (Public Donor Portal) and Screen 2 (Trustee Admin Workspace) via static middleware and Express REST APIs.
* **Security & Observability:** Enforces Helmet v8 CSP, dual-tier rate limiting, constant-time auth comparison, and a 7-day rolling structured JSON logging subsystem with local disk file rotation capped at 15 MB.

---

## 2. Platform Comparison Matrix

| Platform | Compute Architecture | Free Allowance (CPU / RAM) | Persistent Disk / Storage | Cold Starts / Idle Sleep | Bandwidth / Egress |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Oracle Cloud Always Free (OCI)** | Dedicated Bare-Metal / KVM VM (ARM Ampere / AMD x86) | **Up to 4 OCPU ARM & 24 GB RAM** (or 2 AMD x86 instances w/ 1 GB RAM each) | **200 GB persistent block storage** (boot + data volumes) | **ZERO sleep.** 24/7/365 uninterrupted execution. | **10 TB/month** outbound egress. |
| **Render** | Managed Container PaaS | 0.1 CPU, **512 MB RAM** (750 free instance hrs/mo) | **Ephemeral filesystem.** Wiped on every spin-down or deploy. | **Spins down after 15 min inactivity.** Cold boot: **50–70s**. | **100 GB/month** bandwidth. |
| **Vercel** | Serverless Functions (AWS Lambda backend) | Up to 1024 MB RAM, execution cap 10s per request | **Read-only ephemeral** `/tmp` (512 MB). No persistent files. | Instant edge routing, ~200ms–1s function cold start. | **100 GB/month** bandwidth. |
| **Cloudflare Pages + Workers** | Edge V8 Isolates | 128 MB RAM per isolate, 10–50ms CPU time | **No disk.** Requires Cloudflare D1 (SQL) or KV / R2. | **Zero cold start (<5ms).** Global Anycast. | **100,000 req/day** free tier. |
| **Koyeb / SnapDeploy** | MicroVM Container PaaS | 0.1 vCPU, **512 MB RAM** (1 web service) | **Ephemeral disk.** | Stays active while under light traffic; cold boot ~5–10s. | **50 GB/month** bandwidth. |

---

## 3. Operational Quotas & Platform Constraints Deep Dive

### 3.1. Oracle Cloud Infrastructure (OCI) Always Free
* **The "True Free VM":** Provides genuine cloud virtualization without time limits or forced spin-downs.
* **Storage Reality:** 200 GB persistent block storage allows hosting both the Node.js application, SQLite WAL files, atomic snapshot directories, mirror ledgers, and even a self-hosted PostgreSQL/Redis container on the same VM.
* **Operational Gotchas:**
  - Strict idle reclamation policy: OCI automatically pauses instances if 7-day average CPU utilization is < 20% and memory utilization is < 20%. *Mitigation: Standard cron jobs running backups, WAL checkpoints, or modest health-check loops easily satisfy this threshold.*
  - Region selection: Ampere ARM A1 instances can experience capacity constraints in high-demand regions during initial provisioning.

### 3.2. Render Free Web Services
* **Operational Constraints:**
  - 15-minute inactivity idle trigger: Shuts down container completely.
  - 50+ second cold start latency: Highly detrimental for PayPal webhook callbacks, which time out if an acknowledgment isn't received promptly.
  - Ephemeral Disk: Local SQLite databases (`donations.sqlite`) and log files (`logs/`) are completely lost when the container spins down or re-deploys.
* **Database Workaround:** Requires pairing Render's Web Service with an external free database (e.g., Neon Serverless Postgres or Supabase Free Tier) rather than relying on local SQLite.

### 3.3. Vercel Hobby Tier
* **Operational Constraints:**
  - Architecture mismatch for SQLite: SQLite requires native C++ bindings (`sqlite3` / node-gyp) and a writable filesystem for WAL logs (`.sqlite-wal`). Vercel's read-only serverless environment cannot support our current embedded SQLite redundancy engine.
  - Serverless timeouts: Max 10-second request execution limit on the free tier.
* **Refactoring Requirement:** Requires deploying static assets to Vercel and replacing Express + SQLite with Vercel Serverless Functions talking to Neon/Supabase Postgres.

### 3.4. Cloudflare Pages + Workers
* **Operational Constraints:**
  - V8 Isolate limitation: Cannot execute Node.js binary native addons (`better-sqlite3`, `sqlite3`).
  - Strict execution limits: 10ms CPU time limit on free tier Workers.
* **Refactoring Requirement:** Would require rewriting data layer to Cloudflare D1 (Serverless SQLite) and refactoring Express routes to Hono or Cloudflare Worker fetch handlers.

---

## 4. Redundancy & Baseline Security Controls

| Security / Resilience Dimension | Oracle Cloud Always Free | Render Free Tier | Vercel Hobby | Cloudflare Pages + Workers |
| :--- | :--- | :--- | :--- | :--- |
| **DDoS Mitigation** | Native OCI Virtual Cloud Network (VCN) Layer 3/4 DDoS protection. | Cloudflare-backed reverse proxy (Layer 3/4 + baseline Layer 7). | High-capacity edge Anycast network with built-in DDoS suppression. | **Industry-best DDoS mitigation** with unmetered Layer 3/4/7 protection. |
| **TLS/SSL Encryption** | Manual Let's Encrypt / Certbot setup or free OCI Load Balancer SSL termination. | Automated managed Let's Encrypt certificate issuance & renewal. | Automated managed Let's Encrypt / GlobalSign SSL with HTTP/3. | Automated managed Universal SSL, HTTP/3, and automatic HTTPS rewrites. |
| **Fault Tolerance & HA** | Single-VM availability domain unless using 2 free AMD micro-instances across ADs. | Auto-recovery upon process crashes; relies on AWS/GCP underlying zones. | Global Anycast edge network with multi-region serverless failover. | **Highest native redundancy:** Distributed across 300+ global edge data centers. |
| **Data Redundancy** | **100% persistent.** Triple-mirrored block volumes at the SAN hardware layer. | **Zero persistence** on free tier. | Stateless execution; zero persistence. | D1 auto-replicated across regional replicas. |
| **Secret Management** | Secure `.env` files, systemd environment variables, or OCI Vault. | Web UI Environment Variables (encrypted at rest). | Secure Environment Variables UI with environment scoping (Preview/Prod). | Encrypted Worker secrets & environment bindings. |

---

## 5. Security Testing Strategy & Deployment Checklist

Prior to and immediately following deployment, execute this 5-stage verification strategy:

### Phase 1: Automated Static Code & Dependency Audit (SAST)
* **NPM Audit:** Enforce zero critical or high CVEs:
  ```bash
  npm audit --audit-level=high
  ```
* **Secret Leak Detection:** Validate that no `.env`, credentials, or PayPal client secrets are tracked in git:
  ```bash
  git log -p | grep -E "PAYPAL_CLIENT_SECRET|ADMIN_PASSWORD|JWT_SECRET"
  ```

### Phase 2: Dynamic Endpoint & Vulnerability Scanning (DAST)
* **OWASP ZAP Baseline Scan:** Run containerized baseline vulnerability scan against the public domain:
  ```bash
  docker run -t zaproxy/zap-stable zap-baseline.py -t https://your-deployment-url.com
  ```
* **Endpoint Fuzzing & Method Tampering:**
  - Verify that `POST /admin` redirects safely without leaking internal paths.
  - Verify that unauthenticated requests to `/api/admin/stats` return `401 Unauthorized`.
  - Verify that `POST /api/admin/login` triggers rate limiting after 30 rapid attempts (`429 Too Many Requests`).

### Phase 3: TLS/SSL & Cryptographic Posture Validation
* **Qualys SSL Labs Scan:** Target `https://your-deployment-url.com` on [ssllabs.com](https://www.ssllabs.com/ssltest/) to confirm:
  - Minimum **Grade A** score.
  - Disablement of legacy TLS 1.0 and TLS 1.1 protocols.
  - Secure cipher suite negotiation (ECDHE with AES-GCM / CHACHA20).

### Phase 4: HTTP Security Header Auditing
* **Security Headers Audit:** Submit domain to [securityheaders.com](https://securityheaders.com/) to verify Helmet v8 protections:
  - `Content-Security-Policy`: Scripts restricted to self, PayPal, and Google Fonts.
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN` (prevents clickjacking)
  - `Referrer-Policy: strict-origin-when-cross-origin`

### Phase 5: Webhook Signature Simulation Test
* Send an unsigned mock payload to `/api/webhooks/paypal` to verify cryptographic rejection:
  ```bash
  curl -X POST https://your-deployment-url.com/api/webhooks/paypal \
    -H "Content-Type: application/json" \
    -d '{"event_type": "PAYMENT.CAPTURE.COMPLETED"}'
  ```
  *Expected Output:* `400 Invalid signature`.

---

## 6. Senior Architect Recommendations

Depending on operational trade-offs, two clear deployment trajectories exist:

### 🏆 Recommendation 1: The Monolithic Winner (No Code Changes)
**Target: Oracle Cloud Infrastructure (OCI) Always Free (Ampere A1 or AMD VM)**
* **Why:**
  1. Our application relies heavily on **persistent disk operations** (SQLite WAL mode, hot snapshot backups in `backups/`, and append-only `donations_ledger_mirror.jsonl`).
  2. **Zero cold starts:** Crucial for PayPal webhooks, eliminating dropped webhook notices.
  3. **Zero cost forever:** 4 ARM cores, 24 GB RAM, 200 GB persistent storage, and 10 TB egress provide enterprise-grade performance at $0.00/month.
* **Deployment Pattern:** Ubuntu 22.04 LTS VM + Node.js 20 LTS + PM2 / systemd process supervisor + Caddy/Nginx reverse proxy with automated Let's Encrypt SSL.

### 🥈 Recommendation 2: The Decoupled Cloud-Native Winner (High Scalability)
**Target: Cloudflare Pages (Frontend) + Render / Koyeb Web Service + Neon Free Postgres**
* **Why:**
  1. If OCI account verification is unavailable, decouple the static frontend from the backend.
  2. Host Screen 1 and Screen 2 on **Cloudflare Pages** (unlimited bandwidth, 300+ edge locations, zero cold starts).
  3. Deploy the Express backend on **Render or Koyeb** connected to a free **Neon.tech Serverless PostgreSQL** database.
  4. *Keep-Alive Mechanism:* Use a free external monitor (e.g., UptimeRobot or Cron-job.org) to ping `GET /api/donations/create-order` every 10 minutes to suppress Render's 15-minute sleep cycle.
