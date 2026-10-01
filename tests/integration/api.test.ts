import request from 'supertest';
import { app } from '../../src/server';
import { initDatabase, dbQuery, setAdminPasswordResetToken, updateAdminPasswordAndClearToken, getAdminByEmail } from '../../src/db';
import { generatePasswordResetToken, hashPassword } from '../../src/security';

describe('API Security, Validation & Endpoint Integration Suite', () => {
  let adminToken: string = '';

  beforeAll(async () => {
    await initDatabase();

    // Ensure test admin password is reset to 'Trustee@2026!' for test idempotency
    const initialHash = await hashPassword('Trustee@2026!');
    await dbQuery(`
      UPDATE admin_users 
      SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL 
      WHERE LOWER(email) = 'pratapmaharaj9@gmail.com'
    `, [initialHash]);

    // Authenticate to obtain test admin token
    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ password: 'Trustee@2026!' });
    if (loginRes.body.token) {
      adminToken = loginRes.body.token;
    }
  });

  describe('Core Health & HTTP Method Hardening', () => {
    it('GET /api/health should return 200 OK with service identifier', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('nonprofit-gateway');
    });

    it('TRACE / TRACK methods should be blocked with 405 Method Not Allowed', async () => {
      const res = await request(app).trace('/api/health');
      expect(res.status).toBe(405);
    });

    it('GET /api/config should return dynamic profile configurations for DYMCT and AOR', async () => {
      const resDivya = await request(app).get('/api/config?trust=divya');
      expect(resDivya.status).toBe(200);
      expect(resDivya.body.profile.id).toBe('divya');
      expect(resDivya.body.profile.bankName).toContain('State Bank of India');

      const resAor = await request(app).get('/api/config?trust=relaxation');
      expect(resAor.status).toBe(200);
      expect(resAor.body.profile.id).toBe('relaxation');
      expect(resAor.body.profile.bankName).toContain('Karur Vysya Bank');
    });
  });

  describe('PayPal Order Initiation & Amount Tampering Protection', () => {
    it('POST /api/donations/create-order should reject zero, negative, or invalid amounts', async () => {
      const resZero = await request(app)
        .post('/api/donations/create-order')
        .send({ amount: 0, currency: 'USD' });
      expect(resZero.status).toBe(400);

      const resNeg = await request(app)
        .post('/api/donations/create-order')
        .send({ amount: -50, currency: 'USD' });
      expect(resNeg.status).toBe(400);

      const resTamper = await request(app)
        .post('/api/donations/create-order')
        .send({ amount: 50.999, currency: 'USD' }); // Micro-cent tampering
      expect(resTamper.status).toBe(400);
      expect(resTamper.body.error).toContain('cannot exceed 2 decimal places');
    });

    it('POST /api/donations/create-order should accept valid donation and return order details', async () => {
      const res = await request(app)
        .post('/api/donations/create-order')
        .send({
          trustId: 'divya',
          amount: 108.00,
          currency: 'USD',
          firstName: 'Ananya',
          lastName: 'Sharma',
          email: `test-${Date.now()}@example.org`,
          nationality: 'US Citizen',
          countryOfResidence: 'US',
          passportOrId: 'US-PASS-12345'
        });

      expect(res.status).toBe(201);
      expect(res.body.orderId).toBeDefined();
      expect(res.body.idempotencyKey).toBeDefined();
      expect(res.body.trustName).toContain('Divya Yoga Mandal');
    });
  });

  describe('Domestic UPI Security & Replay Attack Hardening', () => {
    let testUpiOrderId = '';
    const uniqueUtr = `4268${Date.now().toString().slice(-8)}`;

    it('POST /api/donations/upi/initiate should validate amount and generate signed deep links', async () => {
      const res = await request(app)
        .post('/api/donations/upi/initiate')
        .send({
          trustId: 'relaxation',
          amount: 501,
          firstName: 'Rahul',
          lastName: 'Verma',
          email: `rahul-${Date.now()}@domain.in`,
          phoneNumber: '+919876543210'
        });

      expect(res.status).toBe(200);
      expect(res.body.orderId).toBeDefined();
      expect(res.body.vpa).toBe('9553946629-3@axl');
      expect(res.body.standardUpiUri).toContain('upi://pay?');
      expect(res.body.deepLinks.gpay).toBeDefined();
      expect(res.body.deepLinks.phonepe).toBeDefined();

      testUpiOrderId = res.body.orderId;
    });

    it('POST /api/donations/upi/verify should reject malformed or truncated UTR formats', async () => {
      const res = await request(app)
        .post('/api/donations/upi/verify')
        .send({
          orderId: testUpiOrderId,
          utr: '123' // Invalid UTR length
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid bank UTR');
    });

    it('POST /api/donations/upi/verify should capture donation with valid UTR', async () => {
      const res = await request(app)
        .post('/api/donations/upi/verify')
        .send({
          orderId: testUpiOrderId,
          utr: uniqueUtr
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.orderId).toBe(testUpiOrderId);
    });

    it('POST /api/donations/upi/verify should reject duplicate UTR replay attacks on different orders', async () => {
      // Create a second separate UPI order
      const initRes = await request(app)
        .post('/api/donations/upi/initiate')
        .send({
          trustId: 'divya',
          amount: 1000,
          firstName: 'Attacker',
          email: `attacker-${Date.now()}@domain.in`
        });
      const secondOrderId = initRes.body.orderId;

      // Attempt to confirm the second order using the already claimed UTR
      const resReplay = await request(app)
        .post('/api/donations/upi/verify')
        .send({
          orderId: secondOrderId,
          utr: uniqueUtr // Reusing same bank UTR
        });

      expect(resReplay.status).toBe(409);
      expect(resReplay.body.error).toContain('already been verified and recorded');
    });
  });

  describe('Authentication, Session Security & Protected Trustee Routes', () => {
    it('POST /api/admin/login should reject empty or incorrect passwords', async () => {
      const resEmpty = await request(app)
        .post('/api/admin/login')
        .send({});
      expect(resEmpty.status).toBe(400);

      const resWrong = await request(app)
        .post('/api/admin/login')
        .send({ password: 'IncorrectPassword123!' });
      expect(resWrong.status).toBe(401);
      expect(resWrong.body.error).toContain('Access denied');
    });

    it('POST /api/admin/login should authenticate with correct passcode and issue token', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ password: 'Trustee@2026!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('Protected routes should reject unauthenticated requests', async () => {
      const resNoAuth = await request(app).get('/api/admin/stats');
      expect(resNoAuth.status).toBe(401);

      const resBadAuth = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', 'Bearer invalid-token');
      expect(resBadAuth.status).toBe(401);
    });

    it('Protected routes should allow authorized access with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalGrossUsd).toBeDefined();
      expect(res.body.totalInrRealized).toBeDefined();
    });

    it('POST /api/admin/logout should terminate session', async () => {
      const res = await request(app)
        .post('/api/admin/logout')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Admin Forgot Password & Password Reset Integration Suite', () => {
    let validRawToken = '';
    const adminEmail = 'pratapmaharaj9@gmail.com';
    const newPassword = 'NewSecureAdmin@2026!';

    it('POST /api/admin/forgot-password should return generic success for registered email', async () => {
      const res = await request(app)
        .post('/api/admin/forgot-password')
        .send({ email: adminEmail });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('If an administrator account with that email address exists');
    });

    it('POST /api/admin/forgot-password should return identical response for non-existent email (anti-enumeration)', async () => {
      const res = await request(app)
        .post('/api/admin/forgot-password')
        .send({ email: 'nonexistent-random-user@unknown.org' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('If an administrator account with that email address exists');
    });

    it('GET /api/admin/verify-reset-token should reject invalid or forged token', async () => {
      const res = await request(app)
        .get('/api/admin/verify-reset-token')
        .query({ token: 'invalid-forged-token-1234567890abcdef' });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toContain('Invalid or expired');
    });

    it('POST /api/admin/reset-password should reject weak passwords', async () => {
      const res = await request(app)
        .post('/api/admin/reset-password')
        .send({ token: 'dummy-token', newPassword: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least 8 characters');
    });

    it('should complete full password reset lifecycle and invalidate token', async () => {
      // 1. Generate a valid token package and attach to admin user
      const pkg = generatePasswordResetToken(20);
      validRawToken = pkg.rawToken;
      await setAdminPasswordResetToken(adminEmail, pkg.hashedToken, pkg.expiresAt);

      // 2. Verify token endpoint should now return valid: true with masked email
      const verifyRes = await request(app)
        .get('/api/admin/verify-reset-token')
        .query({ token: validRawToken });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.valid).toBe(true);
      expect(verifyRes.body.email).toBe('p***9@gmail.com');

      // 3. Execute password reset
      const resetRes = await request(app)
        .post('/api/admin/reset-password')
        .send({ token: validRawToken, newPassword });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);
      expect(resetRes.body.message).toContain('updated securely');

      // 4. Token MUST immediately be invalidated (Anti-Replay check)
      const replayRes = await request(app)
        .post('/api/admin/reset-password')
        .send({ token: validRawToken, newPassword: 'AnotherPassword@2026!' });

      expect(replayRes.status).toBe(400);
      expect(replayRes.body.error).toContain('invalid, expired, or has already been used');

      // Verify that post-reset security confirmation alert email was recorded
      const alertLogs = await dbQuery(`
        SELECT * FROM email_dispatch_logs 
        WHERE order_id = 'PASSWORD_CHANGED_ALERT' AND donor_email = $1
      `, [adminEmail]);
      expect(alertLogs.rows.length).toBeGreaterThan(0);
      expect(alertLogs.rows[0].status).toBe('SUCCESS');

      // 5. Authenticate with newly set password
      const newLoginRes = await request(app)
        .post('/api/admin/login')
        .send({ email: adminEmail, password: newPassword });

      expect(newLoginRes.status).toBe(200);
      expect(newLoginRes.body.success).toBe(true);
      expect(newLoginRes.body.token).toBeDefined();

      // 6. Old password should now be rejected
      const oldLoginRes = await request(app)
        .post('/api/admin/login')
        .send({ email: adminEmail, password: 'WrongOldPassword@2026!' });

      expect(oldLoginRes.status).toBe(401);

      // 7. Restore original password for state clean-up
      const restoreHash = await hashPassword('Trustee@2026!');
      const adminRecord = await getAdminByEmail(adminEmail);
      if (adminRecord) {
        await updateAdminPasswordAndClearToken(adminRecord.id, restoreHash);
      }
    });
  });
});
