import crypto from 'crypto';

/**
 * Security Engine: Cryptography, DPDP PII Protection & Input Sanitization
 * Divya Yoga Mandali Charitable Trust (DYMCT) & The Art Of Relaxation (AOR)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCRYPTION_PREFIX = 'enc:v1:';

/**
 * Derives a deterministic 256-bit encryption key from application secret
 */
function getDerivedKey(): Buffer {
  const secret = process.env.DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dymct-aor-default-secure-salt-2026';
  return crypto.scryptSync(secret, 'dymct_fcra_salt_v1', 32);
}

/**
 * Encrypts sensitive donor PII (Passport, Tax ID, Phone, Address) using AES-256-GCM
 */
export function encryptPII(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return text as any;
  if (text.startsWith(ENCRYPTION_PREFIX)) return text; // Already encrypted

  try {
    const key = getDerivedKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err: any) {
    // If encryption fails, do not corrupt data
    return text;
  }
}

/**
 * Decrypts encrypted donor PII using AES-256-GCM. Transparently returns plaintext if unencrypted.
 */
export function decryptPII(encryptedText: string | null | undefined): string | null {
  if (!encryptedText || typeof encryptedText !== 'string') return encryptedText as any;
  if (!encryptedText.startsWith(ENCRYPTION_PREFIX)) {
    return encryptedText; // Legacy or plaintext
  }

  try {
    const parts = encryptedText.slice(ENCRYPTION_PREFIX.length).split(':');
    if (parts.length !== 3) return encryptedText;

    const [ivHex, authTagHex, cipherHex] = parts;
    const key = getDerivedKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // Return masked placeholder if tampered or corrupt
    return '[ENCRYPTED_PII_CORRUPTED]';
  }
}

/**
 * Encrypts sensitive donor record fields before database write
 */
export function encryptDonorRecord<T extends Record<string, any>>(donor: T): T {
  if (!donor) return donor;
  const clone: Record<string, any> = { ...donor };
  if (clone.passport_or_id_number) {
    clone.passport_or_id_number = encryptPII(clone.passport_or_id_number);
  }
  if (clone.residential_address) {
    clone.residential_address = encryptPII(clone.residential_address);
  }
  if (clone.phone_number) {
    clone.phone_number = encryptPII(clone.phone_number);
  }
  return clone as T;
}

/**
 * Decrypts sensitive donor record fields after database read for authorized inspection/reporting
 */
export function decryptDonorRecord<T extends Record<string, any>>(donor: T): T {
  if (!donor) return donor;
  const clone: Record<string, any> = { ...donor };
  if (clone.passport_or_id_number) {
    clone.passport_or_id_number = decryptPII(clone.passport_or_id_number);
  }
  if (clone.residential_address) {
    clone.residential_address = decryptPII(clone.residential_address);
  }
  if (clone.phone_number) {
    clone.phone_number = decryptPII(clone.phone_number);
  }
  return clone as T;
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks on authentication
 */
export function timingSafeStringCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();

  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Validates and normalizes donation amounts to prevent amount tampering
 */
export function validateDonationAmount(amount: any, currency: string = 'USD'): { valid: boolean; amountNum: number; error?: string } {
  const num = typeof amount === 'number' ? amount : parseFloat(amount);

  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, amountNum: 0, error: 'Invalid amount value.' };
  }

  if (num <= 0) {
    return { valid: false, amountNum: 0, error: 'Donation amount must be greater than zero.' };
  }

  // Reject more than 2 decimal places (micro-cent tampering)
  const decimalParts = num.toString().split('.');
  if (decimalParts[1] && decimalParts[1].length > 2) {
    return { valid: false, amountNum: 0, error: 'Amount cannot exceed 2 decimal places.' };
  }

  const isINR = currency.toUpperCase() === 'INR';
  const minAmount = isINR ? 1 : 1;
  const maxAmount = isINR ? 2500000 : 25000; // ₹25 Lakhs or $25,000 USD limit per single transaction

  if (num < minAmount) {
    return { valid: false, amountNum: num, error: `Minimum contribution is ${isINR ? '₹1 INR' : '$1.00 USD'}.` };
  }

  if (num > maxAmount) {
    return { valid: false, amountNum: num, error: `Maximum single online transaction limit is ${isINR ? '₹25,00,000 INR' : '$25,000 USD'}. Please contact trustees directly for institutional grants.` };
  }

  return { valid: true, amountNum: parseFloat(num.toFixed(2)) };
}

/**
 * Validates Indian NPCI UPI Virtual Payment Address (VPA) format
 */
export function validateUpiVpa(vpa: string): boolean {
  if (!vpa || typeof vpa !== 'string') return false;
  // Standard VPA: name@bank (e.g. divyayoga.mandali@sbi, user@okaxis)
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z0-9.\-_]{2,32}$/;
  return upiRegex.test(vpa.trim());
}

/**
 * Validates standard 12-digit Indian Bank UTR (Unique Transaction Reference) / RRN
 */
export function validateUpiUtr(utr: string): boolean {
  if (!utr || typeof utr !== 'string') return false;
  const cleanUtr = utr.trim();
  // Standard NPCI / Bank UTR is typically 12 alphanumeric/numeric digits
  const utrRegex = /^[a-zA-Z0-9]{10,22}$/;
  return utrRegex.test(cleanUtr);
}

/**
 * Validates Indian Income Tax Permanent Account Number (PAN) format
 */
export function validatePanNumber(pan: string): boolean {
  if (!pan || typeof pan !== 'string') return false;
  // Standard 10-char PAN: 5 letters, 4 digits, 1 letter (e.g. AACTT7999K)
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  return panRegex.test(pan.trim().toUpperCase());
}

/**
 * Masks sensitive financial and personal identifiers for display/logs
 */
export function maskIdentifier(identifier: string | null | undefined): string {
  if (!identifier) return '';
  const clean = identifier.trim();
  if (clean.length <= 4) return '***';
  return `${'*'.repeat(clean.length - 4)}${clean.slice(-4)}`;
}

/**
 * Sanitizes input strings against XSS, HTML injection and dangerous characters
 */
export function sanitizeString(input: string | null | undefined, maxLength: number = 255): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>'"&]/g, (char) => {
      switch (char) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case "'": return '&#39;';
        case '"': return '&quot;';
        case '&': return '&amp;';
        default: return char;
      }
    });
}
