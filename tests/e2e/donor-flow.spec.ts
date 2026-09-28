import { test, expect } from '@playwright/test';

test.describe('End-to-End Donor Journey & Security Testing', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to local gateway
    await page.goto('/');
  });

  test('E2E 1: Landing Page Navigation, Global Branding & Entity Profiles', async ({ page }) => {
    // 1. Verify page title and header branding
    await expect(page).toHaveTitle(/Non-Profit Giving|Divya Yoga Mandali/i);
    const brandLogo = page.locator('.nav-brand-logo');
    await expect(brandLogo).toBeVisible();

    // 2. Verify primary trust defaults to Divya Yoga Mandali
    const heading = page.locator('#ngo-name');
    await expect(heading).toContainText('Divya Yoga Mandali');

    const bankName = page.locator('#bank-name');
    await expect(bankName).toContainText('State Bank of India');

    // 3. Toggle to Secondary Entity: The Art Of Relaxation
    const aorTab = page.locator('#tab-relaxation');
    await aorTab.click();
    await expect(heading).toContainText('The Art Of Relaxation');
    await expect(bankName).toContainText('Karur Vysya Bank');

    // 4. Switch back to Primary Entity
    const divyaTab = page.locator('#tab-divya');
    await divyaTab.click();
    await expect(heading).toContainText('Divya Yoga Mandali');
  });

  test('E2E 2: Payment Mode Toggling, Currency Presets & Amount Selection', async ({ page }) => {
    // 1. Check default PayPal Mode
    const paypalSection = page.locator('#paypal-section');
    await expect(paypalSection).toBeVisible();

    // 2. Select $100 preset
    const preset100 = page.locator('#amount-preset-group button:has-text("$100")');
    if (await preset100.isVisible()) {
      await preset100.click();
      const customAmount = page.locator('#customAmount');
      await expect(customAmount).toHaveValue('100');
    }

    // 3. Switch to UPI Domestic Transfer Mode
    const upiModeBtn = page.locator('#btn-mode-upi');
    await upiModeBtn.click();

    // 4. Verify UPI Payment Container is displayed and PayPal is hidden
    const upiContainer = page.locator('#upi-payment-container');
    await expect(upiContainer).toBeVisible();
    await expect(paypalSection).toBeHidden();

    // 5. Verify UPI QR code and VPA are generated
    const upiVpaDisplay = page.locator('#upi-vpa-display');
    await expect(upiVpaDisplay).toBeVisible();
    await expect(upiVpaDisplay).toContainText('@');
  });

  test('E2E 3: Complete UPI Donation Flow with Post-Donation Success Receipt', async ({ page }) => {
    // 1. Switch to UPI Mode
    await page.locator('#btn-mode-upi').click();
    await expect(page.locator('#upi-payment-container')).toBeVisible();

    // 2. Open 80G Tax Accordion and fill minimal KYC details (DPDP Compliance)
    const accordion = page.locator('#tax-details-accordion');
    await accordion.click();

    await page.fill('#firstName', 'Rajesh');
    await page.fill('#lastName', 'Kulkarni');
    await page.fill('#email', `rajesh-${Date.now()}@example.in`);
    await page.fill('#phoneNumber', '+919876543210');

    // 3. Input a simulated Bank UTR number
    const mockUtr = `4281${Date.now().toString().slice(-8)}`;
    await page.fill('#upi-utr-input', mockUtr);

    // 4. Click Confirm Payment
    const confirmBtn = page.locator('#btn-confirm-upi');
    await confirmBtn.click();

    // 5. Verify Post-Donation Receipt Modal appears
    const receiptModal = page.locator('#receipt-modal');
    await expect(receiptModal).toBeVisible({ timeout: 10000 });

    // Verify receipt content
    const receiptTitle = receiptModal.locator('h3');
    await expect(receiptTitle).toContainText('Thank You');

    // Verify order ID or UTR is captured in receipt
    const orderRef = page.locator('#receipt-order-id');
    await expect(orderRef).not.toBeEmpty();
  });

  test('E2E 4: Social Sharing & QR Code Modal Interactions', async ({ page }) => {
    // 1. Open Share Modal from Navbar
    const shareBtn = page.locator('#btn-share-modal');
    await shareBtn.click();

    // 2. Verify Share Modal is visible
    const shareModal = page.locator('#share-modal');
    await expect(shareModal).toBeVisible();

    // 3. Verify WhatsApp and Twitter sharing elements or copy link button
    const copyLinkBtn = shareModal.locator('button:has-text("Copy"), button:has-text("Link")');
    await expect(copyLinkBtn.first()).toBeVisible();

    // 4. Close modal
    const closeBtn = shareModal.locator('button:has-text("Close"), .modal-close');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(shareModal).toBeHidden();
    }
  });

  test('E2E 5: Mobile Viewport Layout & Touch Friendliness', async ({ page }) => {
    // Verify viewport has no horizontal overflow
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowInnerWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(windowInnerWidth + 5);

    // Verify Navbar buttons have touch friendly height (>= 36px)
    const adminBtn = page.locator('.nav-btn-admin');
    const box = await adminBtn.boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(36);
    }
  });

});
