# FCRA, FEMA & RBI Compliance Guide for Cross-Border Donations

This document details the legal, regulatory, and banking requirements governing foreign contributions to non-profit entities in India.

---

## 1. Statutory Acts & Regulatory Bodies

Receiving foreign money in India is governed primarily by two distinct, non-overlapping statutory frameworks:

| Feature | Foreign Contribution (Regulation) Act, 2010 (FCRA) | Foreign Exchange Management Act, 1999 (FEMA) |
| :--- | :--- | :--- |
| **Governing Ministry** | **Ministry of Home Affairs (MHA)**, Foreigners Division | **Ministry of Finance** & **Reserve Bank of India (RBI)** |
| **Objective** | Regulate the acceptance and utilization of foreign contributions to prevent foreign interference in internal sovereignty. | Facilitate external trade, commercial payments, and promote orderly maintenance of foreign exchange markets. |
| **Nature of Funds** | Pure charitable donations, cultural/educational grants, voluntary transfers without commercial consideration. | Export of commercial goods, IT services, consulting, intellectual property licensing, business investments. |
| **Permitted Gateways** | **None.** No commercial payment aggregators (PayPal India, Razorpay, Cashfree) are authorized under FCRA. | **Permitted.** Operates under RBI's Payment Aggregator - Cross Border (PA-CB) / OPGSP guidelines. |
| **Mandatory Bank Account** | **State Bank of India (SBI), New Delhi Main Branch (NDMB)**, 11 Sansad Marg, New Delhi. | Any current account with an Authorized Dealer (AD) Category-I bank in India. |

---

## 2. Why PayPal India Fails FCRA Compliance

Commercial developers often attempt to integrate PayPal India using standard merchant credentials. Doing so results in regulatory violations:

### A. Violation of Section 17(1) - The SBI New Delhi Main Branch Rule
Under the FCRA Amendment Act, 2020:
> *"Every person who has been granted certificate or prior permission under section 12 shall receive foreign contribution in his or its account designated as 'FCRA Account' by the bank, which shall be opened by him or it in such branch of the State Bank of India at New Delhi, as the Central Government may, by notification, specify in this behalf..."*

- **The SBI NDMB Account:** All foreign remittances must hit this single branch first.
- **PayPal Settlement Mechanism:** PayPal India auto-settles funds into whichever local current account is linked (e.g., an HDFC account in Mumbai or an ICICI account in Bengaluru). Receiving foreign contribution in any non-SBI NDMB account constitutes an immediate statutory violation.

### B. The Intermediary Pooling & Domestic Settlement Breach
1. When an overseas donor pays via PayPal, funds enter PayPal's international/domestic collection accounts.
2. Under RBI's PA-CB/OPGSP guidelines, PayPal batches cross-border inward payments and transfers them to the merchant via **domestic NEFT/RTGS in INR**.
3. **The Legal Consequence:** The Indian bank statement shows a domestic transfer from an intermediary bank (e.g., "NEFT from CITIBANK / PAYPAL INDIA PVT LTD"), with no direct SWIFT MT103 foreign currency trail.
4. MHA classifies this as an illegal domestic routing of untraceable foreign funds.

### C. Purpose Codes & FIRC (Foreign Inward Remittance Certificate)
For any inward remittance, the Authorized Dealer (AD) bank must generate an **e-FIRC / FIRA**:
- Commercial exports use purpose codes like `P0802` (Software services) or `P0803` (Data processing).
- Charitable contributions must be coded under `P1301` (Humanitarian / Social grants) or `P1302` (Charitable foundations).
- Domestic payment aggregators are only licensed for **commercial exports of goods and services**. They cannot legally issue e-FIRCs with purpose code `P1301`/`P1302` for charitable non-profit entities.

---

## 3. Mandatory Donor KYC (FCRA Rule 13)

Section 18 and Rule 13 of the Foreign Contribution (Regulation) Rules, 2011 mandate complete record-keeping for every single donation:

- **Donor Legal Name:** Pseudonyms or "Anonymous" checkouts are forbidden.
- **Nationality & Country of Origin:** Must identify whether the donor is an NRI (Indian passport holder) or foreign citizen.
- **Physical Address & Contact:** Registered residential address in the foreign country.
- **Identification:** Passport number, national identity number, or institutional tax ID.
- **Purpose of Contribution:** Must align with the NGO's registered FCRA aim (Cultural, Economic, Educational, Religious, or Social).

Failure to submit these details in the annual **Form FC-4** filing triggers penalties and license suspension.

---

## 4. Legally Compliant Operational Blueprints

### Blueprint 1: The Dual-Entity Model ("Friends Of" 501(c)(3))
For non-profits with significant international donor bases:
1. Incorporate an independent non-profit entity abroad (e.g., a 501(c)(3) public charity in the US).
2. Set up a US PayPal Business account under that entity.
3. Donors contribute directly to the US non-profit via credit card, PayPal, or ACH.
4. The US non-profit issues US tax exemption receipts (Form 1098-C / 501(c)(3) tax deductions).
5. The US non-profit bundles donations and executes an **institutional grant via international SWIFT wire transfer (USD)** directly into the Indian NGO's **SBI NDMB FCRA Account**.
6. The Indian NGO obtains an official SWIFT MT103 copy and e-FIRC from SBI NDMB and reports the grant in Form FC-4.

### Blueprint 2: Fiscal Sponsorship (GlobalGiving, Give.do, CAF America)
For small to mid-sized NGOs:
1. Onboard with an accredited global fiscal partner (e.g., **Give.do / GiveIndia**, **GlobalGiving**, or **Charities Aid Foundation**).
2. The partner hosts the digital donation checkout (handling international credit cards, PayPal, and Apple Pay).
3. The partner issues international tax receipts to donors.
4. The partner periodically aggregates and wires the net funds as an institutional foreign grant directly into the Indian NGO's **SBI NDMB FCRA Account**, accompanied by full donor documentation for FC-4 filing.

---

## 5. Penalties for Non-Compliance

Under Sections 35, 37, and 39 of the FCRA, 2010:
- **Section 35:** Anyone who accepts or assists any person in accepting foreign contribution in contravention of the Act is punishable with imprisonment for a term up to **5 years**, or with a fine, or both.
- **Section 37:** Confiscation of any currency or security received in violation of the Act.
- **Section 39:** Liability of offenses by companies, societies, and trusts—trustees, directors, and managers are held personally liable unless they prove the offense was committed without their knowledge.
