import {
  initDatabase,
  dbQuery,
  recordLedgerMirrorEvent,
  getDatabaseStatus,
  createDatabaseSnapshot
} from '../../src/db';
import {
  encryptPII,
  decryptPII,
  encryptDonorRecord,
  decryptDonorRecord
} from '../../src/security';

describe('Database Integration & Regulatory Persistence', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  describe('Database Schema & Concurrency Configuration', () => {
    it('should initialize database connection and report healthy status', async () => {
      const status = await getDatabaseStatus();
      expect(status.engine).toBeDefined();
      expect(status.journalMode).toBeDefined();
      expect(status.ledgerMirror.active).toBe(true);
      expect(typeof status.totalSnapshots).toBe('number');
    });

    it('should prevent SQL Injection via parameterized queries', async () => {
      const maliciousPayload = "' OR '1'='1";
      const result = await dbQuery('SELECT * FROM donors WHERE email = $1', [maliciousPayload]);
      expect(result.rows).toBeDefined();
      expect(result.rows.length).toBe(0);
    });
  });

  describe('Encrypted Donor Records & DPDP Data Protection', () => {
    const testEmail = `dpdp-test-${Date.now()}@charity-audit.org`;
    const testDonorId = `test-donor-${Date.now()}`;
    const rawPassport = 'Z987654321';
    const rawAddress = 'Plot 42, Boduppal Ashram Road, Hyderabad';
    const rawPhone = '+919876500000';

    it('should insert donor record with column-level AES-256-GCM encryption', async () => {
      const encryptedPassport = encryptPII(rawPassport);
      const encryptedAddress = encryptPII(rawAddress);
      const encryptedPhone = encryptPII(rawPhone);

      await dbQuery(`
        INSERT INTO donors (
          id, email, first_name, last_name, nationality, is_nri,
          passport_or_id_number, country_of_residence, residential_address, phone_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        testDonorId,
        testEmail,
        'Seva',
        'Contributor',
        'Indian',
        0,
        encryptedPassport,
        'India',
        encryptedAddress,
        encryptedPhone
      ]);

      // Query raw database row to prove it is encrypted on disk
      const rawRow = await dbQuery('SELECT * FROM donors WHERE id = $1', [testDonorId]);
      expect(rawRow.rows.length).toBe(1);
      const storedDonor = rawRow.rows[0];

      // On-disk verification: must NOT be stored in plaintext
      expect(storedDonor.passport_or_id_number).not.toBe(rawPassport);
      expect(storedDonor.passport_or_id_number?.startsWith('enc:v1:')).toBe(true);
      expect(storedDonor.residential_address?.startsWith('enc:v1:')).toBe(true);
      expect(storedDonor.phone_number?.startsWith('enc:v1:')).toBe(true);

      // Decrypted read verification
      const decryptedDonor = decryptDonorRecord(storedDonor);
      expect(decryptedDonor.passport_or_id_number).toBe(rawPassport);
      expect(decryptedDonor.residential_address).toBe(rawAddress);
      expect(decryptedDonor.phone_number).toBe(rawPhone);
    });

    it('should enforce unique email constraint on donors', async () => {
      await expect(dbQuery(`
        INSERT INTO donors (id, email, first_name, last_name, nationality, country_of_residence, residential_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, ['dup-id', testEmail, 'Dup', 'User', 'Indian', 'India', 'Address'])).rejects.toThrow();
    });
  });

  describe('Financial Transaction Ledger & Idempotency Enforcement', () => {
    const testOrderId = `ORD-IDEM-${Date.now()}`;
    const testIdempotencyKey = `IDEM-KEY-${Date.now()}`;

    it('should record donation and enforce idempotency (reject duplicate order IDs)', async () => {
      const donorRes = await dbQuery('SELECT id FROM donors LIMIT 1');
      const donorId = donorRes.rows[0].id;

      await dbQuery(`
        INSERT INTO donations (
          id, donor_id, trust_id, trust_name, paypal_order_id, idempotency_key,
          currency, gross_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        `don-${Date.now()}`,
        donorId,
        'divya',
        'Divya Yoga Mandali Trust',
        testOrderId,
        testIdempotencyKey,
        'USD',
        108.00,
        'CREATED'
      ]);

      // Attempting to insert duplicate order must be rejected by database constraints
      await expect(dbQuery(`
        INSERT INTO donations (
          id, donor_id, trust_id, trust_name, paypal_order_id, idempotency_key,
          currency, gross_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        `don-dup-${Date.now()}`,
        donorId,
        'divya',
        'Divya Yoga Mandali Trust',
        testOrderId,
        `IDEM-KEY-DIFFERENT-${Date.now()}`,
        'USD',
        108.00,
        'CREATED'
      ])).rejects.toThrow();
    });

    it('should write atomic audit events to append-only mirror log', () => {
      expect(() => {
        recordLedgerMirrorEvent('DONOR', { test: true, timestamp: Date.now() });
      }).not.toThrow();
    });
  });
});
