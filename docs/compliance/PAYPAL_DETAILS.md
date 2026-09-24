# PayPal Account Setup: Exact Form Entries & Registration Guide

**Document Purpose:** Ready-to-use checklist and field values for authorized trustees setting up PayPal Business Accounts for non-profit entities.  
**Scope:** Generic Production Blueprint (Values dynamically injected via environment variables)  

---

## 📋 Pre-Registration Documents Checklist

Before opening the signup page, ensure you have these documents saved on your computer (PDF or JPG format):

- [ ] **Trust Institutional PAN Card** (in the legal name of the Trust)
- [ ] **Registered Trust Deed / Constitution Bylaws**
- [ ] **Section 12A / 12AB & 80G Registration Order** (Income Tax Department)
- [ ] **Bank Proof:** Cancelled Cheque or Bank Statement showing Trust Name, Account Number, and IFSC
- [ ] **Signatory KYC:** Personal PAN Card & Aadhaar/Passport of Authorized Managing Trustee
- [ ] **Trust Resolution Letter:** Stating that the designated trustee is authorized to operate the online bank & payment gateway accounts

---

## 🖥️ Screen-by-Screen Form Entry Guide

### Screen 1: Initial Signup
- **Website URL:** `https://www.paypal.com/in/business`
- **Account Type:** Select **Business Account** (Do **NOT** select Personal Account)
- **Email Address:** Enter your official administrative email address
- **Password:** Create a secure password (minimum 8 characters, letters, numbers, and symbols)

---

### Screen 2: Business Classification & Organization Details

| Form Field | Exact Value to Enter | Critical Notes |
| :--- | :--- | :--- |
| **Business Type** | **Trust / Non-Profit / Charity / NGO** | ⚠️ **NEVER** select "Individual" or "Sole Proprietor". Selecting Trust ensures 100% tax immunity. |
| **Legal Business Name** | `[Enter Trust Legal Name as per PAN]` | Must **character-for-character** match your Trust PAN card and bank account name. |
| **Business Category** | `Nonprofit` or `Charity / Social Services` | Qualifies you for non-profit fee discounts. |
| **Sub-Category** | `Charitable and Social Service Organizations` | Required for non-profit classification under Indian rules. |
| **Primary Currency** | `US Dollar (USD)` | Allows accepting global credit cards and overseas PayPal accounts. |

---

### Screen 3: Authorized Signatory Information (Managing Trustee)

| Form Field | Exact Value to Enter | Critical Notes |
| :--- | :--- | :--- |
| **First Name** | `[Managing Trustee First Name]` | As per your personal PAN card |
| **Last Name** | `[Managing Trustee Last Name]` | As per your personal PAN card |
| **Designation / Role** | `Managing Trustee` / `President` | Proves authority to operate on behalf of the Trust |
| **Personal PAN** | *[Enter Trustee's Personal PAN]* | Used strictly for KYC identity verification. Funds are **NOT** attributed to this PAN. |
| **Date of Birth** | *[Enter DOB as per PAN]* | DD/MM/YYYY |
| **Residential Address** | *[Your Residential Address]* | Must match your address proof (Aadhaar/Passport) |

---

### Screen 4: Trust Tax & Operational Details

| Form Field | Exact Value to Enter | Critical Notes |
| :--- | :--- | :--- |
| **Organization / Business PAN** | *[Enter the Trust's Institutional PAN]* | **All inward donations will report under this PAN**, keeping personal taxes completely clear. |
| **Trust Registered Address** | *[Official Address as per Trust Deed]* | Address of the registered trust office |
| **Business Contact Phone** | *[Your Mobile Number]* | Used for 2FA security alerts and OTPs |
| **Website URL** | *[Your Website URL or leave blank]* | If requested, you can enter your registered domain |

---

### Screen 5: Mandatory RBI Inward Remittance Purpose Code

> [!IMPORTANT]
> This setting is mandatory under Reserve Bank of India (RBI) regulations. It dictates the type of e-FIRC issued by your bank.

- Navigate to: **Account Settings ➔ Business Information ➔ Purpose Code**
- **Purpose Code to Select:** **`P1301`** (or `P1109`)
- **Description:** **Humanitarian / Social Grants / Non-Profit Donations**
- ⚠️ **DO NOT SELECT:** `P0802`, `P0803` (These are commercial software export codes and violate charity compliance).

---

### Screen 6: Linking Settlement Bank Accounts

All incoming USD payments are automatically converted and swept to your Indian bank account in INR via domestic NEFT within 2 to 3 business days.

#### Linking Primary Settlement Account
- Navigate to: **Pay & Get Paid ➔ Banks & Cards ➔ Link a Bank Account**
- **Account Holder Name:** `[Trust Legal Name]` (Must match auto-filled name)
- **Bank Name:** `[Your Settlement Bank Name]`
- **Branch:** `[Branch Location]`
- **IFSC Code:** `[Enter 11-digit IFSC Code]`
- **Account Number:** `[Enter Institutional Bank Account Number]`
- Click **Link Your Bank**

---

### Screen 7: Confirming Bank Verification (2 Micro-Deposits)

1. Wait **2 to 3 business days** after linking the bank.
2. PayPal will send two small deposits between ₹1.00 and ₹1.99 (e.g., ₹1.14 and ₹1.48) to your designated bank account.
3. Check your bank statement / net banking for the exact amounts.
4. Go to **Pay & Get Paid ➔ Banks & Cards ➔ Confirm Bank**.
5. Enter the exact two amounts and click **Submit**. Your bank is now **Verified & Active for Auto-Sweep**.

---

### Screen 8: Unlocking Discounted Non-Profit Processing Rates

Standard commercial rate: **4.4% + $0.30** per transaction.  
Discounted charity rate: **~1.99% + $0.49** per transaction (Saves ~55% on fees).

1. Go to: **`https://www.paypal.com/in/charities`**
2. Click **Apply for Charity Pricing**.
3. Upload:
   - Trust Registration Deed
   - Section 12A / 80G Certificate
   - Bank Statement / Cancelled Cheque
4. Approval is typically granted within 3 to 5 business days.

---

### Screen 9: Live API Credentials Configuration (Stored in `.env`)

In the live deployment environment, credentials are never hardcoded and are injected exclusively through `.env`:

```env
# Primary Entity PayPal Credentials
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=your_primary_paypal_client_id
PAYPAL_CLIENT_SECRET=your_primary_paypal_client_secret

# Secondary Entity PayPal Credentials (Optional)
PAYPAL_RELAXATION_CLIENT_ID=your_secondary_paypal_client_id
PAYPAL_RELAXATION_CLIENT_SECRET=your_secondary_paypal_client_secret
```

---

### How to Generate Fresh Keys on PayPal:
1. Log in to [developer.paypal.com](https://developer.paypal.com).
2. In the top right corner, click **Dashboard** ➔ **Apps & Credentials**.
3. Ensure the toggle switch is set to **Live** (or **Sandbox** for testing).
4. Click **Create App** ➔ Enter App Name (e.g., `Donation Engine`) ➔ Select `Merchant` ➔ Click **Create App**.
5. Copy the **Client ID** and click **Show** to copy the **Secret Key**.
6. Paste values into your local `.env` file and restart the server.

---

## 🛡️ Quick Summary of Protection Rules

| Question | Rule / Recommendation |
| :--- | :--- |
| **Will trustees pay personal income tax?** | **No.** Funds go to the Trust's institutional PAN and bank account. Exempt under Section 12A/80G. |
| **Will AIS show personal gifts?** | **No.** The institutional PAN is registered with PayPal, not the personal PAN. |
| **Which Purpose Code to use?** | **`P1301` / `P1109`** (Humanitarian Grants & Cultural / Personal Services). |
| **How long does money take to reach the bank?** | Inward transfers automatically sweep in **2 to 3 business days** via NEFT. |
| **What about pending bank verification?** | Check net banking in 2 business days for 2 micro-deposits, enter them in PayPal under **Pay & Get Paid ➔ Banks & Cards ➔ Confirm Bank**. |
