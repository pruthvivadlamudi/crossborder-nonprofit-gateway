/**
 * Payment Calculation Routines & Regulatory Compliance Unit Tests
 */

describe('Payment & Regulatory Calculation Routines', () => {
  const FX_RATE_USD_INR = 83.50;

  // Standard PayPal Cross-Border Non-Profit Fee Formula: 3.49% + $0.49 (or 4.4% + $0.30 standard international)
  function calculatePayPalBreakdown(grossUsd: number, isVerifiedCharity: boolean = false) {
    const rate = isVerifiedCharity ? 0.0199 : 0.044; // 1.99% for verified 501(c)(3)/non-profit vs 4.4% international
    const fixedFee = isVerifiedCharity ? 0.49 : 0.30;
    const fee = parseFloat((grossUsd * rate + fixedFee).toFixed(2));
    const netUsd = parseFloat((grossUsd - fee).toFixed(2));
    const realizedInr = Math.round(netUsd * FX_RATE_USD_INR);
    return { grossUsd, fee, netUsd, realizedInr };
  }

  function determineDonorFcraCategory(countryOfResidence: string, isNri: boolean): 'India Resident' | 'Non-Resident Indian (NRI)' | 'Foreign National' {
    const cleanCountry = (countryOfResidence || '').trim().toLowerCase();
    if (cleanCountry === 'in' || cleanCountry === 'india') {
      return 'India Resident';
    }
    if (isNri) {
      return 'Non-Resident Indian (NRI)';
    }
    return 'Foreign National';
  }

  describe('PayPal Cross-Border Fee Breakdown', () => {
    it('should accurately calculate standard cross-border fee and net realized amount', () => {
      const calculation = calculatePayPalBreakdown(100.00, false);
      expect(calculation.grossUsd).toBe(100.00);
      expect(calculation.fee).toBe(4.70); // 100 * 0.044 + 0.30 = 4.70
      expect(calculation.netUsd).toBe(95.30); // 100 - 4.70 = 95.30
      expect(calculation.realizedInr).toBe(Math.round(95.30 * 83.50));
    });

    it('should calculate verified non-profit discounted fee tier', () => {
      const calculation = calculatePayPalBreakdown(100.00, true);
      expect(calculation.fee).toBe(2.48); // 100 * 0.0199 + 0.49 = 2.48
      expect(calculation.netUsd).toBe(97.52);
    });

    it('should maintain strict non-negative net amount', () => {
      const calculation = calculatePayPalBreakdown(1.00, false);
      expect(calculation.grossUsd).toBe(1.00);
      expect(calculation.netUsd).toBeLessThan(calculation.grossUsd);
      expect(calculation.netUsd).toBeGreaterThan(0);
    });
  });

  describe('FCRA Donor Classification Logic (MHA Form FC-4 & Section 80G Form 10BD)', () => {
    it('should classify India residents correctly for domestic 80G tax deductions', () => {
      expect(determineDonorFcraCategory('India', false)).toBe('India Resident');
      expect(determineDonorFcraCategory('IN', false)).toBe('India Resident');
      expect(determineDonorFcraCategory('india', true)).toBe('India Resident');
    });

    it('should classify Non-Resident Indians (NRIs) with Indian passports abroad', () => {
      expect(determineDonorFcraCategory('United States', true)).toBe('Non-Resident Indian (NRI)');
      expect(determineDonorFcraCategory('UAE', true)).toBe('Non-Resident Indian (NRI)');
      expect(determineDonorFcraCategory('UK', true)).toBe('Non-Resident Indian (NRI)');
    });

    it('should classify foreign nationals for foreign contribution reporting', () => {
      expect(determineDonorFcraCategory('United States', false)).toBe('Foreign National');
      expect(determineDonorFcraCategory('Germany', false)).toBe('Foreign National');
      expect(determineDonorFcraCategory('Singapore', false)).toBe('Foreign National');
    });
  });
});
