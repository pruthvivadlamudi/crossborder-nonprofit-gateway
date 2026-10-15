# Executive Briefing & Strategic Compass

## Navigating Cross-Border Donations for Indian Non-Profits via PayPal
**Prepared for:** Founders, Trustees, Board of Directors, and Technical Leads  
**Version:** 2.6.0 | **Scope:** Production Reference Architecture  

---

## 1. Executive Summary & Legal Alignment

Non-profit organizations and charitable trusts operating cross-border gateways require:
1. **Dedicated Institutional PANs** issued by the Income Tax Department of India.
2. **Current Bank Accounts** registered directly under the **legal names of the charitable entities**.
3. **Managing Trustee Governance:** Managed and operated by the designated **Authorized Signatories**.

Anchoring the gateway under the **Trust's institutional legal identity** ensures **100% legal separation, non-profit tax immunity under Section 12A/80G, and zero individual tax exposure for trustees and officers.**

---

## 2. The Institutional Banking Route

```
                               THE INSTITUTIONAL ROUTE
                               
       [International Donors (USD)]
                     │
                     ▼
       [PayPal India Business Account]
       - Legal Business Name: [PRIMARY_TRUST_NAME / In Institutional Name]
       - Tax Identity: Trust's Institutional PAN
       - Primary Administrator: Authorized Managing Trustee
                     │
                     ▼ (Auto-Sweep via Domestic NEFT in 2-3 business days)
       [Designated Settlement Bank Current Account]
       - Account Name: [PRIMARY_TRUST_NAME]
       - IFSC: [PRIMARY_BANK_IFSC] | Account: ...XXXX
                     │
                     ▼
       [100% Tax Exemption under Sections 11 & 12A/12AB]
       - Zero personal tax liability for trustees
       - Zero AIS Section 56(2) personal income flags
```

---

## 3. "Where Does the Money Go?" — The Financial Reality

When leadership plans international fundraising, budgeting for transaction losses is essential. Below is the honest breakdown of what happens to a **$100.00 USD** donation under standard cross-border payment processing:

```
[Donor Gives: $100.00 USD]
     │
     ├── PayPal Processing Fee (Non-Profit Rate: ~1.99% + $0.49) ─────────> -$2.48
     │   (If standard commercial account: 4.4% + $0.30 = -$4.70)
     │
     ├── PayPal Currency Conversion Margin (~3.5% to 4.0% spread) ───────> -$3.50
     │   (PayPal's exchange rate is lower than the live Google/interbank rate)
     │
     ▼
[Net Amount Converted to INR: ~$94.02 USD equivalent]
     │
     ├── Inward Remittance Processing & e-FIRC Fee (Local Bank / SBI) ────> -₹100 to ₹350 (~$1.50 to $4.00)
     │
     ▼
[Actual Cash Reaching Your Social Projects: ~$90.00 to ~$92.50 USD equivalent in INR]
```

---

## 4. How Our Technology Architecture Protects You

The software system engineered in this repository acts as a **compliance shield**:

1. **No Anonymous Donations (The KYC Gatekeeper):**
   * Indian law strictly prohibits anonymous foreign funding.
   * The frontend interface [`src/public/index.html`](file:///src/public/index.html) locks the checkout button until the donor provides their legal name, nationality, country, and physical address.
   * Donors who identify as Non-Resident Indians (NRIs holding Indian passports) are automatically flagged, separating them from foreign citizens for clean accounting.
2. **Cryptographic Webhook Verification:**
   * The backend [`src/server.ts`](file:///src/server.ts) independently verifies digital signatures directly against PayPal’s security servers, guaranteeing that no spoofed or fraudulent payment confirmations can ever compromise your ledger.
3. **One-Click Form FC-4 Audit Reports:**
   * Every transaction logs donor demographics, currencies, gross amounts, and net proceeds into the database.
   * When annual compliance reporting is due, your team can extract an MHA-ready return with a single API call, saving weeks of manual reconciliation.

---

## 5. Standard Institutional Onboarding Blueprint

1. **Sign Up at PayPal Business (`https://www.paypal.com/in/business`):**
   * Legal Business Name: Set to your institutional trust name (`PRIMARY_TRUST_NAME`).
   * Primary Contact: Name of the authorized managing trustee.
   * Business Type: `Trust / Non-Profit / Charity`.
   * Institutional PAN: Enter the **Trust's Institutional PAN**.
   * Signatory KYC: Enter **Authorized Signatory's Personal PAN & DOB** (verifies signing authority).
   * Purpose Code: `P1301` (Charitable / Social Grants) or `P1109`.
2. **Link Settlement Bank Account:**
   * Provide the institutional IFSC and Account Number.
   * Complete micro-deposit confirmation within 2–3 business days.
3. **Run Live Test Donation:**
   * Validate end-to-end receipt, auto-sweep, and e-FIRC generation.
