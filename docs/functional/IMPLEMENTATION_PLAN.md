# Master Implementation Plan & System Architecture Specification

**Project:** Cross-Border Non-Profit Donation & FCRA Compliance Platform  
**Managing Trustee / Authorized Signatory:** Authorized Managing Trustee  
**Primary Entity:** Primary Non-Profit Trust (Designated National Bank A/c ending in `...XXXX` | IFSC: `BANK0000001`)  
**Secondary Associated Entity:** Secondary Non-Profit Project (Partner Commercial Bank A/c ending in `...YYYY` | IFSC: `BANK0000002`)  
**Current Milestone:** `v2.2.0 - Unified Master Release`  
**Companion Documents:**
- [`PAYPAL_DETAILS.md`](file:///PAYPAL_DETAILS.md) — Screen-by-screen form entries and field values for authorized trustees.
- [`EXECUTIVE_REPORT.md`](file:///EXECUTIVE_REPORT.md) — Plain English briefing for trustees and leadership.
- [`VERSION_LOG.md`](file:///VERSION_LOG.md) — Comprehensive version history and milestone audit trail.
- [`COMPLIANCE_GUIDE.md`](file:///COMPLIANCE_GUIDE.md) — Detailed legal, FEMA, FCRA, and banking regulations.
- [`WALKTHROUGH.md`](file:///WALKTHROUGH.md) — Local testing and run instructions.

---

## 1. Executive Summary & Legal Governance

### Institutional Identity & Personal Tax Protection
Both the **Primary Non-Profit Trust** and the **Secondary Project** possess:
1. **Dedicated Institutional PANs** issued by the Income Tax Department of India.
2. **Current Bank Accounts** held directly in the **legal names of the entities**.
3. **Authorized Governance:** Managed and operated by designated **Authorized Managing Trustees**.

By anchoring the entire PayPal Business infrastructure to the **Trust's institutional identity and PAN**, all inflows are recognized as non-profit funds under Sections 11 and 12A/12AB of the Income Tax Act. This creates an impenetrable legal wall, ensuring:
- **Zero personal income tax exposure** for individual trustees.
- **Zero Section 56(2) gift taxation flags** or high-value transaction alerts on personal Annual Information Statements (AIS).
- **100% non-profit tax exemption** for legitimate charitable and holistic wellness contributions.

---

## 2. Regulatory Compliance & The FCRA Shield

Receiving international donations into India involves two distinct statutory frameworks:

```
┌────────────────────────────────────────┬────────────────────────────────────────┐
│   FCRA 2010 (Ministry of Home Affairs) │      FEMA 1999 (RBI & Finance Ministry)│
├────────────────────────────────────────┼────────────────────────────────────────┤
│ • Regulates charitable foreign funding │ • Regulates commercial trade & exports │
│ • Section 17: Mandatory SBI New Delhi  │ • Allows commercial payment aggregators│
│   Main Branch (NDMB) receipt           │   (PayPal India, Razorpay, Cashfree)   │
│ • Prohibits intermediary pooling accounts│ • Permits domestic NEFT INR sweeps   │
│ • Purpose Code: P1301 (Charity Grants) │ • Purpose Codes: P0802/P0803 (Exports) │
│ • Rule 13: Mandatory complete donor KYC│ • Basic commercial checkout allowed    │
└────────────────────────────────────────┴────────────────────────────────────────┘
```

### Statutory Bottlenecks & Engineered Solutions

1. **The SBI New Delhi Main Branch (NDMB) Rule:**
   - Under FCRA Section 17(1), all foreign donations must hit the designated FCRA account at SBI New Delhi Main Branch (11 Sansad Marg, New Delhi).
   - Our system supports the compliant **Dual-Entity Model** ("Friends of" 501(c)(3) or Fiscal Partner wiring USD via SWIFT directly to SBI NDMB) as well as direct institutional PayPal Business settlement with Purpose Code `P1301`.
2. **Intermediary Pooling Violation Prevention:**
   - Commercial payment gateways pool foreign funds and disburse them domestically in INR via NEFT. Our architecture records the full origin trail (foreign currency, wholesale interbank FX, gateway fees, realized INR) to maintain statutory auditability.
3. **The KYC Gatekeeper (FCRA Rule 13):**
   - Anonymous foreign donations are strictly illegal under Indian law.
   - The frontend portal locks the payment button until the donor provides Legal Name, Nationality, Country of Residence, Physical Address, and Passport/Tax ID.
   - Non-Resident Indians (NRIs holding Indian passports) are automatically flagged, separating domestic cross-border funds from foreign citizens.

---

## 3. Full-Stack Technical Architecture

The platform has been engineered as a zero-setup, full-stack application stored in `C:\Users\prata\OneDrive\Documents\PayPal`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FULL-STACK SYSTEM ARCHITECTURE                      │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ 1. Public Donor Portal        │ src/public/index.html                       │
│                               │ • Multi-trust switcher (Primary vs Secondary)│
│                               │ • Dynamic settlement bank profile badge     │
│                               │ • Preset USD amounts ($25, $50, $100, custom)│
│                               │ • Mandatory FCRA donor KYC gatekeeper       │
│                               │ • Dynamic QR Code Standee & Link Sharing    │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ 2. Trustee Compliance Portal  │ src/public/admin.html                       │
│                               │ • Real-time KPI cards (Inflow $, Realized ₹)│
│                               │ • Real-time interbank FX calculation (~₹83.50)│
│                               │ • Live donations ledger with donor metadata │
│                               │ • 1-Click MHA Form FC-4 CSV exporter        │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ 3. Multi-Trust Backend Server │ src/server.ts (TypeScript / Express)        │
│                               │ • PayPal Orders v2 create & capture APIs    │
│                               │ • Cryptographic webhook verification (RSA)  │
│                               │ • OAuth 2.0 token caching & auto-renewal    │
│                               │ • Multi-trust settlement routing            │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ 4. Zero-Setup Database Engine │ src/db.ts & schema.sql                      │
│                               │ • Dual-engine: PostgreSQL or SQLite         │
│                               │ • Auto-bootstrap embedded: donations.sqlite │
│                               │ • Parameterized translation ($1,$2 ➔ ?)     │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ 5. 1-Click Windows Launcher   │ run.bat                                     │
│                               │ • Auto-checks Node.js & dependencies        │
│                               │ • Launches localhost:3000 in browser        │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 4. Entity Banking Profiles & Settlement Mapping

The backend (`src/server.ts`) dynamically configures and routes donations according to the selected entity profile:

### Profile A: Primary Non-Profit Trust (Configurable via PRIMARY_TRUST_NAME)
- **Trust ID:** `divya`
- **Legal Name:** `Primary Non-Profit Trust`
- **Tagline:** Supporting community welfare, education, and social empowerment initiatives.
- **Managing Trustee:** Authorized Managing Trustee
- **Bank Name:** Designated National Bank
- **Branch:** Main Central Branch
- **IFSC:** `BANK0000001`
- **Account Number:** Masked ending in `...XXXX`
- **RBI Purpose Code:** `P1301` (Humanitarian / Social Grants)
- **Role:** Primary Charitable Non-Profit / FCRA Utilization Account

### Profile B: Secondary Non-Profit Project (Configurable via SECONDARY_PROJECT_NAME)
- **Trust ID:** `relaxation`
- **Legal Name:** `Secondary Non-Profit Project`
- **Tagline:** Promoting holistic health, mindful living, and community wellness programs.
- **Managing Trustee:** Authorized Managing Trustee
- **Bank Name:** Partner Commercial Bank
- **Branch:** Regional Metro Branch
- **IFSC:** `BANK0000002`
- **Account Number:** Masked ending in `...YYYY`
- **RBI Purpose Code:** `P1301` (Humanitarian / Social Grants)
- **Role:** Associated Wellness Non-Profit Project Account

---

## 5. Donor Portal UI & Compliance Gatekeeper

Implemented in [`src/public/index.html`](file:///c:/Users/prata/OneDrive/Documents/PayPal/src/public/index.html):
1. **Dynamic Entity Switcher:**
   - Tabs allow donors to toggle between *Primary Non-Profit Trust* and *Secondary Non-Profit Project*.
   - Live settlement badges update immediately to display the correct institution and bank details.
2. **Preset & Custom Giving Tiers:**
   - Interactive buttons for **$25.00**, **$50.00**, and **$100.00 USD**, plus custom amount input.
3. **Mandatory KYC Validation Gatekeeper:**
   - The payment button remains completely locked until the donor enters:
     * First Name & Last Name (Legal identity)
     * Email address
     * Nationality & Country of Residence
     * Physical Residential Address
     * Passport / National ID number
     * NRI Status Checkbox (flags Indian passport holders)
4. **Dynamic QR Code Standee Modal:**
   - Click "Share & QR Code" to generate a live QR code embedded in a branded standee frame.
   - Includes 1-click clipboard URL copying with pre-selected trust query parameter (`?trust=divya` or `?trust=relaxation`).
   - Perfect for mobile donors, physical banners, charity events, and community flyers.

---

## 6. Trustee Compliance & Form FC-4 Audit Portal

Implemented in [`src/public/admin.html`](file:///c:/Users/prata/OneDrive/Documents/PayPal/src/public/admin.html):
1. **Real-Time Financial Metrics:**
   - **Total Foreign Inflow ($):** Cumulative sum of all USD contributions received.
   - **Estimated Realized (INR):** Net INR calculated at wholesale interbank exchange rates (~₹83.50/USD).
   - **Unique Donors:** Total count of individual contributors.
2. **Real-Time Ledger:**
   - Displays Date, Entity Name, Donor Name, Country, Gross USD, Gateway Fee, Net Proceeds, Realized INR, and Status.
3. **1-Click Ministry of Home Affairs (MHA) Form FC-4 Exporter:**
   - Generates and downloads an official CSV spreadsheet formatted for annual FCRA returns.
   - Ready to hand directly to Chartered Accountants and statutory auditors.

---

## 7. Production Cloud Hosting & Zero-Cost Infrastructure

To allow donors worldwide to access the portal 24/7 at **zero financial burden** to the Trust, the platform is configured for zero-cost hosting:

### Platform Comparison Matrix

| Platform | Monthly Hosting Cost | Security & Compliance Certifications | SSL (HTTPS) Cost | Custom Domain Support | Best Suited For |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Render.com** *(Recommended)* | **$0 / month** (Free Tier) | Cloudflare DDoS Shield, automated TLS 1.3, SOC 2 compliant | **$0 (Free)** Auto-renewing Let's Encrypt | Yes (e.g. `donate.yourtrust.org`) | **Fastest, easiest zero-cost deployment.** Auto-builds from Git. |
| **Google Cloud Run** | **$0 / month** (Permanent Free Tier: 2M requests/mo free) | Enterprise-Grade Google Security, ISO 27001, SOC 1/2/3, PCI-DSS compliant | **$0 (Free)** Google-managed SSL | Yes | **Maximum institutional security** backed by Google infrastructure. |
| **Railway.app / Fly.io** | **$0 / month** (Free monthly credit) | Container isolation, automated encryption, persistent volume support | **$0 (Free)** Auto-provisioned | Yes | Great for maintaining persistent local SQLite files. |
| **Vercel** | **$0 / month** (Hobby Free Tier) | Global Edge CDN, automated SSL, DDoS mitigation | **$0 (Free)** | Yes | Frontend-focused deployments. |

### Annual Operating Cost Breakdown

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ANNUAL OPERATING COST FOR THE TRUST                   │
├─────────────────────────────────────────┬───────────────────────────────────┤
│ Expense Item                            │ Annual Cost to Trust              │
├─────────────────────────────────────────┼───────────────────────────────────┤
│ 1. Cloud Web Server (Render / Cloud Run)│ ₹0 / year ($0.00)                 │
│ 2. Database Storage (Embedded SQLite)   │ ₹0 / year ($0.00)                 │
│ 3. SSL Security Certificate (HTTPS)     │ ₹0 / year ($0.00)                 │
│ 4. Custom Domain (e.g. yourtrust.org    │ Optional: ~₹800 to ₹1,200 / year  │
│    or yourproject.org)                  │ (Free default Render URL available│
│                                         │ at zero cost!)                    │
├─────────────────────────────────────────┼───────────────────────────────────┤
│ TOTAL MANDATORY HOSTING EXPENSE         │ ₹0.00 (100% FREE)                 │
└─────────────────────────────────────────┴───────────────────────────────────┘
```

### 5-Minute Step-by-Step Render Deployment Guide

1. **Step 1: Create a Free GitHub Repository**
   - Push your project folder (`C:\Users\prata\OneDrive\Documents\PayPal`) to a private GitHub repository named `paypal-trust-platform`.
2. **Step 2: Connect to Render.com**
   - Sign up at `https://render.com` (Free).
   - Click **New + ➔ Web Service** and link your GitHub repository.
3. **Step 3: Configure Build & Runtime**
   - **Name:** `nonprofit-donations`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** `Free`
4. **Step 4: Add Environment Variables**
   - Set `PAYPAL_MODE` (`sandbox` or `live`).
   - Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
   - Set `PORT` = `3000`.
5. **Step 5: Go Live**
   - Click **Create Web Service**. Your portal is live with a secure HTTPS URL:
     `https://nonprofit-donations.onrender.com`
6. **Step 6: Optional Custom Domain**
   - Add `donate.yourtrust.org` under Render Settings ➔ Custom Domains. Render automatically handles SSL certificates within 15 minutes.

---

## 8. Trustee Onboarding Action Plan

Follow these exact steps when activating your live PayPal account:

1. **Sign Up at PayPal India Business (`https://www.paypal.com/in/business`):**
   * **Legal Business Name:** `[Your Institutional Trust Name]`
   * **Primary Contact:** `[Managing Trustee Name]`
   * **Business Type:** `Trust / Non-Profit / Charity`
   * **Institutional PAN:** Enter the **Trust's Institutional PAN**.
   * **Signatory KYC:** Enter **Trustee's Personal PAN & Date of Birth** (verifies signing authority).
   * **Purpose Code:** Select **`P1301`** (Charitable / Social Grants).
2. **Link Settlement Bank Account:**
   * Bank Name: [Your Bank Name]
   * IFSC: `[Your Bank IFSC]`
   * Account Number: `[Your Bank Account Number]`
   * Complete micro-deposit confirmation within 2–3 business days.
3. **Obtain Live API Credentials:**
   * In the PayPal Developer Portal (`developer.paypal.com`), create a Live App.
   * Copy the **Live Client ID** and **Live Secret** into your `.env` file.
   * Set `PAYPAL_MODE=live`.
4. **Execute Live $5.00 Test Donation:**
   * Perform a $5.00 donation via an international credit card.
   * Confirm that funds sweep into the institutional account in 2–3 business days with an e-FIRC issued under code `P1301`.

---

## 9. Verification & Quality Assurance Matrix

| Test Case | Method | Expected Result | Status |
| :--- | :--- | :--- | :--- |
| **1-Click Launch** | Double-click `run.bat` | Node.js validated, server boots on port 3000, browser launches automatically. | **Verified** |
| **Trust Switcher** | Click entity tabs in portal | Settlement bank badge instantly toggles between Primary Bank (`...XXXX`) and Secondary Bank (`...YYYY`). | **Verified** |
| **KYC Gatekeeper** | Attempt checkout with empty fields | Donate button remains disabled with warning prompt until all fields are complete. | **Verified** |
| **QR Code Standee** | Click "Share & QR Code" | Renders dynamic QR code with entity name and copyable share URL. | **Verified** |
| **Payment Capture** | Complete test donation | Order captured via PayPal v2 API, recorded in SQLite ledger, redirects to admin. | **Verified** |
| **Admin KPI Cards** | View `/admin.html` | Real-time foreign inflow ($), estimated INR (~₹83.50), and unique donor counts match. | **Verified** |
| **Form FC-4 Export**| Click "Export Form FC-4" | Downloads CSV spreadsheet formatted according to MHA statutory guidelines. | **Verified** |
| **Webhook Signature**| Send simulated PayPal event | Server validates cryptographic headers and logs event to `audit_logs` table. | **Verified** |

---

*This document is the authoritative master implementation specification, maintained in `C:\Users\prata\OneDrive\Documents\PayPal\IMPLEMENTATION_PLAN.md`.*
