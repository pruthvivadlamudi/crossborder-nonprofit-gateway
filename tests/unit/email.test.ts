import {
  getVerifiedSenderAddress,
  ResendClient,
  resend,
  sendDonationConfirmationEmail,
  DonationEmailData
} from '../../src/email';

describe('Transactional Email Service & Resend Client Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Verified Custom Sender Address Validation', () => {
    it('should return default custom subdomain sender when environment variables are unset', () => {
      delete process.env.RESEND_FROM;
      delete process.env.EMAIL_FROM;
      delete process.env.SENDER_EMAIL;

      const sender = getVerifiedSenderAddress('Divya Yoga Mandali Giving');
      expect(sender.email).toBe('receipts@mail.artofrelaxation.org');
      expect(sender.name).toBe('Divya Yoga Mandali Giving');
    });

    it('should use custom sender configured via RESEND_FROM', () => {
      process.env.RESEND_FROM = 'donations@mail.artofrelaxation.org';
      process.env.RESEND_FROM_NAME = 'Art Of Relaxation Support';

      const sender = getVerifiedSenderAddress();
      expect(sender.email).toBe('donations@mail.artofrelaxation.org');
      expect(sender.name).toBe('Art Of Relaxation Support');
    });

    it('should throw an error for malformed sender email addresses', () => {
      process.env.RESEND_FROM = 'invalid-email-address';

      expect(() => getVerifiedSenderAddress()).toThrow('Invalid custom sender email address');
    });

    it('should reject unverified public or default domains in production mode', () => {
      process.env.NODE_ENV = 'production';

      const unverifiedAddresses = [
        'trustee@gmail.com',
        'admin@yahoo.com',
        'test@resend.dev',
        'info@outlook.com'
      ];

      for (const addr of unverifiedAddresses) {
        process.env.RESEND_FROM = addr;
        expect(() => getVerifiedSenderAddress()).toThrow('uses an unverified public or default domain');
      }
    });

    it('should allow custom domains and subdomains in production mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.RESEND_FROM = 'receipts@mail.artofrelaxation.org';

      const sender = getVerifiedSenderAddress();
      expect(sender.email).toBe('receipts@mail.artofrelaxation.org');
    });
  });

  describe('ResendClient & Idempotency Header', () => {
    it('should identify whether Resend is configured', () => {
      const configuredClient = new ResendClient('re_valid_api_key_12345');
      expect(configuredClient.isConfigured).toBe(true);

      const unconfiguredClient = new ResendClient('');
      expect(unconfiguredClient.isConfigured).toBe(false);

      const placeholderClient = new ResendClient('your_resend_api_key');
      expect(placeholderClient.isConfigured).toBe(false);
    });

    it('should return error when attempting to send without configured API key', async () => {
      const unconfiguredClient = new ResendClient('');
      const response = await unconfiguredClient.emails.send({
        from: 'test@mail.artofrelaxation.org',
        to: 'donor@example.com',
        subject: 'Receipt',
        html: '<p>Thank you</p>'
      });

      expect(response.data).toBeNull();
      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('Resend API key is not configured');
    });

    it('should mock response cleanly in test mode with idempotency key', async () => {
      const client = new ResendClient('re_test_key_123');
      const testIdempotencyKey = 'donation-ORDER-999-CAPTURE-888';

      const response = await client.emails.send({
        from: 'receipts@mail.artofrelaxation.org',
        to: 'donor@example.com',
        subject: 'Tax Receipt',
        html: '<p>Donation Received</p>'
      }, {
        idempotencyKey: testIdempotencyKey,
        correlationId: 'test-corr-id'
      });

      expect(response.error).toBeNull();
      expect(response.data).toBeDefined();
      expect(response.data?.id).toMatch(/^mock-resend-/);
    });
  });

  describe('sendDonationConfirmationEmail Workflow', () => {
    it('should send donation confirmation email with idempotency key tied to donation order', async () => {
      const sampleDonation: DonationEmailData = {
        donorName: 'Devotee Priya',
        donorEmail: 'priya@example.org',
        grossAmount: 108,
        currency: 'USD',
        paypalOrderId: 'TEST-ORDER-IDEMPOTENT-001',
        paypalCaptureId: 'TEST-CAPTURE-IDEMPOTENT-001',
        donationDate: new Date().toUTCString(),
        trustId: 'divya',
        trustName: 'Divya Yoga Mandali Charitable Trust'
      };

      const result = await sendDonationConfirmationEmail(sampleDonation, 'test-correlation-id');
      expect(result.success).toBe(true);
      expect(result.provider).toBeDefined();
      expect(result.messageId).toBeDefined();
    });
  });
});
