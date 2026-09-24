# Platform Walkthrough: Turnkey Cross-Border Donation Engine

**Project:** Cross-Border Non-Profit Donation & FCRA Compliance Platform  
**Managing Trustee:** Authorized Managing Trustee  
**Primary Entity:** Primary Non-Profit Trust (Designated National Bank A/c `...XXXX` | IFSC: `BANK0000001`)  
**Secondary Entity:** Secondary Non-Profit Project (Partner Commercial Bank A/c `...YYYY` | IFSC: `BANK0000002`)  
**Status:** **Live & Tested Locally** (`http://localhost:3000`)

---

## 1. What Has Been Built & Tested

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FULL-STACK APPLICATION ARCHITECTURE                    │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ 1. Public Donor Portal        │ http://localhost:3000                       │
│    (src/public/index.html)    │ • Multi-trust switcher (Primary vs Secondary)│
│                               │ • Mandatory FCRA donor KYC gatekeeper       │
│                               │ • Dynamic QR Code & Link Sharing modal      │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ 2. Trustee Compliance Portal  │ http://localhost:3000/admin.html            │
│    (src/public/admin.html)    │ • Real-time KPI cards (Inflows, Realized ₹) │
│                               │ • Live donations ledger with donor details  │
│                               │ • 1-Click MHA Form FC-4 CSV exporter        │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ 3. Multi-Trust Backend Server │ src/server.ts                               │
│                               │ • PayPal Orders v2 creation & capture       │
│                               │ • Cryptographic webhook verification        │
│                               │ • Dynamic bank & purpose code routing       │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ 4. Zero-Setup Database Layer  │ src/db.ts                                   │
│                               │ • Auto-detects PostgreSQL vs. local SQLite  │
│                               │ • Embedded database: donations.sqlite       │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ 5. 1-Click Windows Launcher   │ run.bat                                     │
│                               │ • Double-click to start server & launch UI  │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 2. How to Test the Running Application Right Now

The server is currently online and running locally on port **3000**.

### Test 1: The Public Donor Portal
1. Open your browser and go to: **`http://localhost:3000`**.
2. **Switch Entities:** Click the tabs at the top between **Primary Non-Profit Trust** and **Secondary Non-Profit Project**. Notice how the settlement bank details instantly toggle:
   * Primary Trust ➔ **Designated National Bank** (`BANK0000001`, A/c `...XXXX`).
   * Secondary Project ➔ **Partner Commercial Bank** (`BANK0000002`, A/c `...YYYY`).
3. **Test the Compliance Gate:** Try donating before filling the form. The button remains locked, preventing illegal anonymous contributions.
4. **Test the "Share & QR Code" Feature:** Click **Share & QR Code** in the top-right to view the dynamic QR code for smartphone scanning.
5. **Make a Test Donation:** Fill in the form and click **Complete Donation ($50.00 USD)**. It will capture the payment, credit the Trust, and automatically redirect you to the Trustee Dashboard!

---

### Test 2: The Trustee Compliance & Audit Dashboard
1. Open: **`http://localhost:3000/admin.html`**.
2. Notice the live metrics:
   * **Total Foreign Inflow ($):** Real-time sum of foreign funds.
   * **Estimated Realized (INR):** Net INR calculated at live wholesale interbank rates (~₹83.50/USD).
   * **Unique Donors:** Full demographic count.
3. **Live Transactions Ledger:** See each transaction with the donor's full name, country of residence, physical address, gross amount, and gateway fee.
4. **1-Click MHA Form FC-4 Export:** Click the green **"Export Form FC-4 (CSV)"** button in the top-right corner. It will download the official annual return spreadsheet ready for your Chartered Accountant and the Ministry of Home Affairs!

---

## 3. How to Run It in the Future

Whenever you turn on your computer or want to launch the platform:
1. Open the folder: `C:\Users\prata\OneDrive\Documents\PayPal`.
2. Double-click **`run.bat`**.
3. It will launch the backend and automatically open the application in your browser!

---

*This walkthrough is recorded in `WALKTHROUGH.md` and logged in `VERSION_LOG.md` (v2.2.0 - Unified Master Release).*
