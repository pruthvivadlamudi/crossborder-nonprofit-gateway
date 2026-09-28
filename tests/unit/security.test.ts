import {
  encryptPII,
  decryptPII,
  encryptDonorRecord,
  decryptDonorRecord,
  timingSafeStringCompare,
  validateDonationAmount,
  validateUpiVpa,
  validateUpiUtr,
  validatePanNumber,
  maskIdentifier,
  sanitizeString,
  hashPassword,
  verifyPassword,
  generatePasswordResetToken,
  hashResetToken,
  validatePasswordStrength,
  maskEmail
} from '../../src/security';

describe('Security & DPDP Compliance Suite', () => {
  describe('AES-256-GCM Column-Level Encryption & Decryption', () => {
    it('should encrypt and decrypt sensitive PII correctly', () => {
      const sensitivePassport = 'K12345678';
      const encrypted = encryptPII(sensitivePassport);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(sensitivePassport);
      expect(encrypted?.startsWith('enc:v1:')).toBe(true);

      const decrypted = decryptPII(encrypted);
      expect(decrypted).toBe(sensitivePassport);
    });

    it('should transparently return plaintext for legacy/unencrypted data', () => {
      const plaintextAddress = '123 Temple Road, Boduppal, Hyderabad';
      const result = decryptPII(plaintextAddress);
      expect(result).toBe(plaintextAddress);
    });

    it('should handle null and undefined safely without throwing', () => {
      expect(encryptPII(null as any)).toBeNull();
      expect(encryptPII(undefined as any)).toBeUndefined();
      expect(decryptPII(null as any)).toBeNull();
      expect(decryptPII(undefined as any)).toBeUndefined();
    });

    it('should encrypt entire donor record sensitive fields', () => {
      const rawDonor = {
        first_name: 'Pratap',
        last_name: 'Maharaj',
        email: 'pratap@example.org',
        passport_or_id_number: 'P987654321',
        residential_address: '456 Peace Colony, Secunderabad',
        phone_number: '+919876543210'
      };

      const encrypted = encryptDonorRecord(rawDonor);
      expect(encrypted.passport_or_id_number?.startsWith('enc:v1:')).toBe(true);
      expect(encrypted.residential_address?.startsWith('enc:v1:')).toBe(true);
      expect(encrypted.phone_number?.startsWith('enc:v1:')).toBe(true);
      // Non-sensitive fields should remain untouched
      expect(encrypted.first_name).toBe('Pratap');
      expect(encrypted.email).toBe('pratap@example.org');

      const decrypted = decryptDonorRecord(encrypted);
      expect(decrypted.passport_or_id_number).toBe('P987654321');
      expect(decrypted.residential_address).toBe('456 Peace Colony, Secunderabad');
      expect(decrypted.phone_number).toBe('+919876543210');
    });
  });

  describe('Constant-Time Authentication & Timing Attack Protection', () => {
    it('should return true for identical strings', () => {
      expect(timingSafeStringCompare('Trustee@2026!', 'Trustee@2026!')).toBe(true);
    });

    it('should return false for incorrect passwords of same or different lengths', () => {
      expect(timingSafeStringCompare('Trustee@2026', 'Trustee@2026!')).toBe(false);
      expect(timingSafeStringCompare('WrongPassword', 'Trustee@2026!')).toBe(false);
      expect(timingSafeStringCompare('', 'Trustee@2026!')).toBe(false);
    });
  });

  describe('Amount Tampering & Financial Safeguards', () => {
    it('should accept valid USD and INR donation amounts', () => {
      expect(validateDonationAmount(50, 'USD').valid).toBe(true);
      expect(validateDonationAmount(500, 'INR').valid).toBe(true);
      expect(validateDonationAmount('108.50', 'USD').amountNum).toBe(108.50);
    });

    it('should reject zero or negative donation amounts', () => {
      expect(validateDonationAmount(0, 'USD').valid).toBe(false);
      expect(validateDonationAmount(-100, 'INR').valid).toBe(false);
      expect(validateDonationAmount('invalid', 'USD').valid).toBe(false);
    });

    it('should reject micro-cent tampering (more than 2 decimal places)', () => {
      const result = validateDonationAmount(10.555, 'USD');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed 2 decimal places');
    });

    it('should enforce statutory upper thresholds to prevent laundering/accidental inputs', () => {
      expect(validateDonationAmount(30000, 'USD').valid).toBe(false);
      expect(validateDonationAmount(3000000, 'INR').valid).toBe(false);
    });
  });

  describe('UPI & Tax Identifier Validation', () => {
    it('should validate valid Indian NPCI UPI VPAs', () => {
      expect(validateUpiVpa('divyayoga.mandali@sbi')).toBe(true);
      expect(validateUpiVpa('artofrelaxation@kvb')).toBe(true);
      expect(validateUpiVpa('donor@okaxis')).toBe(true);
    });

    it('should reject malformed UPI VPAs', () => {
      expect(validateUpiVpa('invalid-vpa')).toBe(false);
      expect(validateUpiVpa('@sbi')).toBe(false);
      expect(validateUpiVpa('user@')).toBe(false);
      expect(validateUpiVpa('')).toBe(false);
    });

    it('should validate 10-22 character bank UTR reference numbers', () => {
      expect(validateUpiUtr('426812345678')).toBe(true);
      expect(validateUpiUtr('AXIS1234567890')).toBe(true);
    });

    it('should reject invalid or truncated UTR references', () => {
      expect(validateUpiUtr('123')).toBe(false);
      expect(validateUpiUtr('')).toBe(false);
      expect(validateUpiUtr('inv!@#$')).toBe(false);
    });

    it('should validate Indian Income Tax PAN formats (Section 80G Form 10BD)', () => {
      expect(validatePanNumber('AACTT7999K')).toBe(true);
      expect(validatePanNumber('ABCDE1234F')).toBe(true);
      expect(validatePanNumber('INVALID123')).toBe(false);
      expect(validatePanNumber('abcde1234f')).toBe(true); // normalizes to upper
    });

    it('should mask sensitive identifiers for public logs', () => {
      expect(maskIdentifier('AACTT7999K')).toBe('******999K');
      expect(maskIdentifier('1234')).toBe('***');
    });

    it('should sanitize HTML injection strings', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
  });

  describe('Admin Authentication & Password Reset Security', () => {
    const testPassword = 'SecureAdmin@2026!';

    it('should hash passwords using bcrypt (12 rounds) and verify accurately', async () => {
      const hash = await hashPassword(testPassword);
      expect(hash).toBeDefined();
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);

      const isValid = await verifyPassword(testPassword, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword('WrongPassword@123', hash);
      expect(isInvalid).toBe(false);
    });

    it('should generate a 256-bit cryptographically secure reset token package with future expiration', () => {
      const pkg = generatePasswordResetToken(20);
      expect(pkg.rawToken).toBeDefined();
      expect(pkg.rawToken.length).toBe(64); // 32 bytes in hex = 64 characters
      expect(pkg.hashedToken).toBeDefined();
      expect(pkg.hashedToken.length).toBe(64); // SHA-256 output = 64 characters
      expect(pkg.expiresAt.getTime()).toBeGreaterThan(Date.now() + 19 * 60 * 1000);
      expect(pkg.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 21 * 60 * 1000);
    });

    it('should deterministically derive SHA-256 digest of reset tokens', () => {
      const raw = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const hash1 = hashResetToken(raw);
      const hash2 = hashResetToken(raw);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it('should enforce strict password complexity rules', () => {
      // Valid passwords
      expect(validatePasswordStrength('ValidPass@2026').valid).toBe(true);
      expect(validatePasswordStrength('DevSecure#99!').valid).toBe(true);

      // Too short
      expect(validatePasswordStrength('Short1!').valid).toBe(false);
      expect(validatePasswordStrength('Short1!').error).toContain('at least 8 characters');

      // Missing uppercase
      expect(validatePasswordStrength('lowercase@2026').valid).toBe(false);
      expect(validatePasswordStrength('lowercase@2026').error).toContain('uppercase letter');

      // Missing lowercase
      expect(validatePasswordStrength('UPPERCASE@2026').valid).toBe(false);
      expect(validatePasswordStrength('UPPERCASE@2026').error).toContain('lowercase letter');

      // Missing number
      expect(validatePasswordStrength('NoNumbersHere!@#').valid).toBe(false);
      expect(validatePasswordStrength('NoNumbersHere!@#').error).toContain('number');

      // Missing special character
      expect(validatePasswordStrength('NoSpecialChar2026').valid).toBe(false);
      expect(validatePasswordStrength('NoSpecialChar2026').error).toContain('special character');
    });

    it('should mask admin emails to protect privacy in public responses', () => {
      expect(maskEmail('pratapmaharaj9@gmail.com')).toBe('p***9@gmail.com');
      expect(maskEmail('admin@trust.org')).toBe('a***n@trust.org');
      expect(maskEmail('ab@domain.com')).toBe('a*@domain.com');
      expect(maskEmail('invalid-email')).toBe('***@***.***');
    });
  });
});

