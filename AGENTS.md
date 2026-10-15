# Antigravity Pair-Programming Directives & Master Project Context

## 1. Project Context & Identity (Permanent Memory)

This repository is **`paypal-fcra-crossborder-engine`** (`pruthvivadlamudi/crossborder-nonprofit-gateway`).
It is a production-grade, statutory-compliant dual-rail donation gateway for registered Indian charitable trusts:
1. **Divya Yoga Mandali Charitable Trust (DYMCT)** (Primary Trust):
   - Managing Trustee: Sri Vijaya Pratap Maharaj
   - Bank: State Bank of India (Hyderabad) | Configured in Environment Variables
   - PAN: Configured in Environment Variables | UPI VPA: `divyayoga.mandali@sbi`
2. **The Art Of Relaxation (AOR)** (Secondary Project):
   - Managing Trustee: Sri Vijaya Pratap Maharaj
   - Bank: Karur Vysya Bank (Secunderabad) | Configured in Environment Variables
   - PAN: Configured in Environment Variables | UPI VPA: `artofrelaxation@kvb`

### Live Production Deployment
- **Donor Gateway:** https://dymct-aor-gateway.onrender.com
- **Trustee Admin:** https://dymct-aor-gateway.onrender.com/admin
- **Health Check:** https://dymct-aor-gateway.onrender.com/api/health (Pinged every 5m by UptimeRobot keep-alive)
- **Deployment Platform:** Render Free Tier (Node 20 LTS, automatic CI/CD from `main`)
- **Single Source of Truth:** Consult [`PROJECT_STATE.md`](file:///c:/Users/prata/OneDrive/Documents/PayPal/PROJECT_STATE.md) for full status.

---

## 2. Instant Onboarding Protocol (Zero-Friction Startup)

Whenever the user opens a session or asks "what is the current state", "what's pending", or asks to start working:
1. **Never perform redundant, slow scans** of the entire codebase from scratch. You already possess the complete architecture, test state, and entity records in your active context.
2. **Consult [`PROJECT_STATE.md`](file:///c:/Users/prata/OneDrive/Documents/PayPal/PROJECT_STATE.md)** immediately.
3. Present the user with a crisp **Active Project Briefing**:
   - **System Status:** Live on Render, UptimeRobot keep-alive active, 53/53 tests passing, 0 vulnerabilities.
   - **Completed & Verified:** Dual-screen UI, UPI QR standee + deep links, PayPal Orders v2, FCRA/80G KYC & receipts, MHA FC-4 export, DB snapshots, DPDP AES-256-GCM encryption, Resend email.
   - **Pending Work:**
     * P1: Switching PayPal credentials from Sandbox to Live in Render.
     * P2: Custom domain setup (`dymct.org.in` or `divyayoga.org.in`) with Cloudflare DNS.
     * P3: Production domain email verification in Resend.
   - **Ask for the next target:** Immediately invite the user to pick which pending item to tackle or what feature to build next.

---

## 3. Maintenance Rule for `PROJECT_STATE.md`

Whenever code is modified, tests are added, new features are implemented, or deployments are made:
- **Always update [`PROJECT_STATE.md`](file:///c:/Users/prata/OneDrive/Documents/PayPal/PROJECT_STATE.md)** to reflect the latest status, test count, and pending backlog.
- This ensures that subsequent turns and future sessions remain 100% synchronized with reality.

---

## 4. Engineering & Safety Guidelines

- **Zero Vulnerability Rule:** Never introduce npm packages with known vulnerabilities. Maintain `npm audit` at 0 vulnerabilities.
- **Secret Protection:** Never commit or output unencrypted API keys, private keys, or passwords.
- **Tests Integrity:** Maintain all 53 Jest unit/integration tests and Playwright E2E tests in passing state (`npm test`).
- **Database Durability:** Ensure SQLite WAL mode (`PRAGMA journal_mode = WAL`) and append-only ledger mirror hashing are preserved.

---

## 5. Local-First Development & Commit Protocol (Mandatory)

- **Local Verification First:** Never push untested or incremental code directly to `origin main`. Test and verify all changes locally first (`npm test`, `npm run build`, local verification).
- **Explicit User Consent for Git & Deploy:** Do NOT auto-commit, push to `main`, or trigger deployments automatically without first presenting the verified changes and asking for the user's confirmation.
- **Render Auto-Deploy Awareness:** Render is connected to GitHub `main` with automatic CI/CD deployment on commit. Once the user approves a push to `main`, Render will deploy automatically. The manual deploy hook is kept as a backup only when explicitly requested.

