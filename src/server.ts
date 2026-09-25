import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import fetch from 'node-fetch';
const uuidv4 = () => crypto.randomUUID();
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  initDatabase,
  dbQuery,
  recordLedgerMirrorEvent,
  createDatabaseSnapshot,
  getDatabaseStatus
} from './db';
import { logger, requestLoggingMiddleware } from './logger';
import {
  sendDonationConfirmationEmail,
  DonationEmailData,
  renderDonationEmailHtml
} from './email';

dotenv.config();

interface AuthenticatedRequest extends Request {
  rawBody?: string;
}

const app = express();
const PORT = process.env.PORT || 3000;

// Security: Enforce Strict HTTP Security Headers via Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://www.paypal.com",
        "https://*.paypal.com",
        "https://*.paypalobjects.com",
        "https://cdn.jsdelivr.net"
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      connectSrc: [
        "'self'",
        "https://www.paypal.com",
        "https://*.paypal.com",
        "https://api-m.paypal.com",
        "https://api-m.sandbox.paypal.com",
        "https://api.qrserver.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https://*.paypal.com",
        "https://*.paypalobjects.com",
        "https://api.qrserver.com"
      ],
      frameSrc: [
        "'self'",
        "https://www.sandbox.paypal.com",
        "https://www.paypal.com"
      ],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: null
    }
  },
  hsts: false,
  crossOriginEmbedderPolicy: false
}));

// Structured Request Tracing & Correlation Middleware
app.use(requestLoggingMiddleware);

// Security: Global API Rate Limiter (DDoS Mitigation)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please wait a minute before making more requests.' }
});

// Stricter Rate Limiter for Authentication Attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' }
});

app.use('/api/', apiLimiter);

// Preserve raw request buffer for PayPal webhook signature verification
app.use(express.json({
  verify: (req: AuthenticatedRequest, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

// Resolve static public directory (supports both src/public and dist/public)
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', 'src', 'public');

app.use(express.static(publicDir));

// Admin Authentication Infrastructure
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Trustee@2026!';
const JWT_SECRET = process.env.JWT_SECRET || 'fcra-super-secret-trustee-key-2026-audit';

function generateAdminToken(): string {
  const payload = {
    role: 'trustee_admin',
    exp: Date.now() + 24 * 60 * 60 * 1000
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(str).digest('hex');
  return `${str}.${sig}`;
}

function verifyAdminToken(token: string): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [str, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(str).digest('hex');
  if (sig !== expectedSig) return false;
  try {
    const payload = JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
    if (payload.exp < Date.now()) return false;
    return payload.role === 'trustee_admin';
  } catch {
    return false;
  }
}

function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.headers['x-admin-token'] as string) || (req.query.token as string);

  if (!token || !verifyAdminToken(token)) {
    return res.status(401).json({ error: 'Unauthorized: Trustee access credentials required.' });
  }
  next();
}

// Health check endpoint for cloud platforms (Render/Koyeb) and UptimeRobot monitoring
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), service: 'nonprofit-gateway' });
});

// Explicit route handlers for donor portal and trustee dashboard
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/donate', (req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/admin', (req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.post('/admin', (req: Request, res: Response) => {
  res.redirect('/admin');
});

app.get('/admin.html', (req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.post('/admin.html', (req: Request, res: Response) => {
  res.redirect('/admin.html');
});


// PayPal Configuration
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_API_BASE = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';

// Trust Profiles Configuration with Canonical KYC Identifiers (Configurable via Environment Variables)
const TRUST_PROFILES: Record<string, any> = {
  divya: {
    id: 'divya',
    name: process.env.PRIMARY_TRUST_NAME || 'Global Charitable Foundation',
    subtitle: 'Vedic Wellness, Yoga Sadhana, Annadanam & Rural Community Upliftment',
    tagline: 'Empowering communities through holistic yoga, wholesome nutrition, and rural healthcare seva.',
    mission: 'Dedicated to reviving traditional yoga and holistic wellness, offering free wholesome nutrition (Annadanam), providing free rural healthcare seva, and fostering cultural preservation across communities.',
    managingTrustee: process.env.MANAGING_TRUSTEE || 'Authorized Managing Trustee',
    merchantEmail: process.env.PRIMARY_MERCHANT_EMAIL || 'trustee@nonprofit.org',
    pan: process.env.PRIMARY_TRUST_PAN || 'XXXXX0000X',
    bankName: process.env.PRIMARY_BANK_NAME || 'Designated National Bank',
    bankBranch: process.env.PRIMARY_BANK_BRANCH || 'Main Central Branch',
    ifsc: process.env.PRIMARY_BANK_IFSC || 'BANK0000001',
    accountMasked: process.env.PRIMARY_BANK_ACCOUNT_MASKED || 'A/c ending in ...XXXX',
    upiVpa: process.env.PRIMARY_UPI_VPA || 'charity.seva@sbi',
    instagramHandle: process.env.INSTAGRAM_HANDLE || 'divyayoga.seva',
    purposeCode: process.env.DEFAULT_PURPOSE_CODE || 'P1301',
    fcraRole: 'Designated Non-Profit / FCRA Utilization Account',
    impactPillars: [
      {
        icon: '🧘',
        title: 'Daily Yoga & Pranayama Seva',
        description: 'Empowering thousands with daily traditional yoga sessions, breathwork, and meditation for chronic illness prevention and inner peace.'
      },
      {
        icon: '🍲',
        title: 'Annadanam (Community Nutrition)',
        description: 'Providing daily fresh, wholesome satvic meals to rural seekers, underprivileged school children, and visiting pilgrims.'
      },
      {
        icon: '🩺',
        title: 'Holistic Rural Health Outreach',
        description: 'Conducting free healthcare camps, Ayurvedic wellness screenings, and distributing remedies to underserved village families.'
      },
      {
        icon: '🌱',
        title: 'Vedic Heritage & Youth Guidance',
        description: 'Preserving sacred wellness wisdom, conducting value-based youth retreats, and promoting sustainable eco-conscious community living.'
      }
    ],
    fundUtilization: [
      { label: 'Yoga Seva & Rural Wellness Camps', percent: 40, color: '#f59e0b' },
      { label: 'Daily Annadanam & Food Distribution', percent: 35, color: '#10b981' },
      { label: 'Youth Guidance & Value Education', percent: 15, color: '#38bdf8' },
      { label: 'Statutory Auditing & Compliance', percent: 10, color: '#c084fc' }
    ]
  },
  relaxation: {
    id: 'relaxation',
    name: process.env.SECONDARY_PROJECT_NAME || 'Mindful Living Initiative',
    subtitle: 'Holistic Stress Reduction, Mindful Meditation & Emotional Well-Being',
    tagline: 'Guiding modern seekers toward stress-free living, emotional balance, and restorative peace.',
    mission: 'Empowering modern individuals, youth, and working families through scientifically grounded mindfulness, restorative breath alignment, and sound meditation retreats.',
    managingTrustee: process.env.MANAGING_TRUSTEE || 'Authorized Managing Trustee',
    merchantEmail: process.env.SECONDARY_MERCHANT_EMAIL || 'project@nonprofit.org',
    pan: process.env.SECONDARY_TRUST_PAN || 'YYYYY0000Y',
    bankName: process.env.SECONDARY_BANK_NAME || 'Partner Commercial Bank',
    bankBranch: process.env.SECONDARY_BANK_BRANCH || 'Regional Metro Branch',
    ifsc: process.env.SECONDARY_BANK_IFSC || 'BANK0000002',
    accountMasked: process.env.SECONDARY_BANK_ACCOUNT_MASKED || 'A/c ending in ...YYYY',
    upiVpa: process.env.SECONDARY_UPI_VPA || 'mindfulliving@icici',
    instagramHandle: process.env.INSTAGRAM_HANDLE || 'mindfulliving.seva',
    purposeCode: process.env.DEFAULT_PURPOSE_CODE || 'P1301',
    fcraRole: 'Associated Non-Profit Project Account',
    impactPillars: [
      {
        icon: '🌿',
        title: 'Mindfulness & Stress Relief',
        description: 'Guiding professionals and seekers through practical meditation to eliminate chronic anxiety, fatigue, and workplace burnout.'
      },
      {
        icon: '🧠',
        title: 'Youth Emotional Resilience',
        description: 'Specialized focus training, memory enhancement, and calming techniques taught freely at educational institutions.'
      },
      {
        icon: '🎵',
        title: 'Sound Healing & Breath Alignment',
        description: 'Harmonious acoustic vibrations and pranic alignment sessions restoring natural circadian rhythms and emotional tranquility.'
      },
      {
        icon: '🤝',
        title: 'Compassionate Community Circles',
        description: 'Inclusive support spaces cultivating empathy, mindful relationships, and positive mental health awareness.'
      }
    ],
    fundUtilization: [
      { label: 'Public Mindfulness & Peace Retreats', percent: 45, color: '#c084fc' },
      { label: 'Youth University Mental Health Outreach', percent: 30, color: '#38bdf8' },
      { label: 'Digital Guided Meditation Resources', percent: 15, color: '#10b981' },
      { label: 'Statutory Auditing & Operational Upkeep', percent: 10, color: '#f59e0b' }
    ]
  }
};

/**
 * Helper: Resolve credentials for the target entity
 */
interface TrustCredentials {
  clientId: string;
  clientSecret: string;
}

function getTrustCredentials(trustId: string): TrustCredentials {
  if (trustId === 'relaxation') {
    const clientId = process.env.PAYPAL_RELAXATION_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || '';
    const clientSecret = process.env.PAYPAL_RELAXATION_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET || '';
    return { clientId, clientSecret };
  } else {
    // Default to Primary Trust
    const clientId = process.env.PAYPAL_DIVYA_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || '';
    const clientSecret = process.env.PAYPAL_DIVYA_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET || '';
    return { clientId, clientSecret };
  }
}

/**
 * Helper: Retrieve or cache PayPal OAuth Access Token per Trust Entity
 */
const cachedTokens: Record<string, { token: string; expiresAt: number }> = {};

async function getPayPalAccessToken(trustId: string = 'divya'): Promise<string> {
  const creds = getTrustCredentials(trustId);
  if (!creds.clientId || !creds.clientSecret) {
    throw new Error(`PayPal credentials for entity '${trustId}' are not configured.`);
  }

  const now = Date.now();
  const cached = cachedTokens[trustId];
  if (cached && cached.expiresAt > now + 60000) {
    return cached.token;
  }

  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to obtain PayPal OAuth token for ${trustId}: ${errorText}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedTokens[trustId] = {
    token: data.access_token,
    expiresAt: now + (data.expires_in * 1000)
  };

  return cachedTokens[trustId].token;
}

/**
 * Helper: Cryptographic Webhook Signature Verification
 */
async function verifyPayPalWebhookSignature(req: AuthenticatedRequest, trustId: string = 'divya'): Promise<boolean> {
  if (process.env.NODE_ENV === 'development' && !WEBHOOK_ID) {
    return true; // Graceful bypass for local testing
  }

  const authAlgo = req.headers['paypal-auth-algo'] as string;
  const certUrl = req.headers['paypal-cert-url'] as string;
  const transmissionId = req.headers['paypal-transmission-id'] as string;
  const transmissionSig = req.headers['paypal-transmission-sig'] as string;
  const transmissionTime = req.headers['paypal-transmission-time'] as string;

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return false;
  }

  try {
    const parsedCertUrl = new URL(certUrl);
    if (!parsedCertUrl.hostname.endsWith('.paypal.com') || parsedCertUrl.protocol !== 'https:') {
      return false;
    }
  } catch {
    return false;
  }

  const accessToken = await getPayPalAccessToken(trustId);

  const verifyResponse = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: WEBHOOK_ID,
      webhook_event: req.body
    })
  });

  if (!verifyResponse.ok) return false;
  const result = await verifyResponse.json() as { verification_status: string };
  return result.verification_status === 'SUCCESS';
}

// ============================================================================
// PUBLIC DONATION API ROUTES
// ============================================================================

/**
 * 1. Dynamic Trust Config
 */
app.get('/api/config', (req: Request, res: Response) => {
  const trustKey = (req.query.trust as string) || 'divya';
  const profile = TRUST_PROFILES[trustKey] || TRUST_PROFILES.divya;
  const creds = getTrustCredentials(trustKey);

  res.json({
    clientId: creds.clientId,
    isLiveConfigured: Boolean(creds.clientId && creds.clientSecret),
    mode: PAYPAL_MODE,
    currency: 'USD',
    profile,
    availableTrusts: Object.values(TRUST_PROFILES)
  });
});

/**
 * 2. Create Donation Order with Mandatory FCRA Donor Profiling
 */
app.post('/api/donations/create-order', async (req: Request, res: Response) => {
  try {
    const {
      trustId = 'divya',
      firstName,
      lastName,
      email,
      nationality,
      isNri,
      passportOrId,
      countryOfResidence,
      residentialAddress,
      amount,
      currency = 'USD'
    } = req.body;

    // Strict FCRA Rule 13: Mandatory Non-Anonymous Donor Profiling
    if (!firstName || !lastName || !email || !nationality || !countryOfResidence || !residentialAddress || !amount) {
      return res.status(400).json({
        error: 'Compliance Violation: Full donor identity (Name, Nationality, Country, Address, Amount) is mandatory under FCRA regulations.'
      });
    }

    const donationAmount = parseFloat(amount);
    if (isNaN(donationAmount) || donationAmount <= 0) {
      return res.status(400).json({ error: 'Invalid donation amount.' });
    }

    const profile = TRUST_PROFILES[trustId] || TRUST_PROFILES.divya;
    const donorId = uuidv4();
    const idempotencyKey = uuidv4();

    // Upsert Donor Profile
    await dbQuery(`
      INSERT INTO donors (
        id, email, first_name, last_name, nationality, is_nri, passport_or_id_number,
        country_of_residence, residential_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (email) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        nationality = EXCLUDED.nationality,
        is_nri = EXCLUDED.is_nri,
        country_of_residence = EXCLUDED.country_of_residence,
        residential_address = EXCLUDED.residential_address,
        updated_at = CURRENT_TIMESTAMP;
    `, [
      donorId,
      email.toLowerCase().trim(),
      firstName.trim(),
      lastName.trim(),
      nationality.trim(),
      isNri ? 1 : 0,
      passportOrId ? passportOrId.trim() : null,
      countryOfResidence.toUpperCase().trim(),
      residentialAddress.trim()
    ]);

    // Retrieve active donor ID
    const existingDonor = await dbQuery('SELECT id FROM donors WHERE email = $1', [email.toLowerCase().trim()]);
    const activeDonorId = existingDonor.rows[0]?.id || donorId;

    let orderId: string;
    const creds = getTrustCredentials(profile.id);

    // If PayPal keys are configured for this trust, call PayPal API
    if (creds.clientId && creds.clientSecret) {
      const accessToken = await getPayPalAccessToken(profile.id);
      const paypalPayload = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: `DONATION_${idempotencyKey}`,
            description: `Foreign Contribution to ${profile.name}`,
            custom_id: activeDonorId,
            amount: {
              currency_code: currency,
              value: donationAmount.toFixed(2)
            }
          }
        ],
        application_context: {
          brand_name: profile.name,
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING'
        }
      };

      const orderResponse = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': idempotencyKey
        },
        body: JSON.stringify(paypalPayload)
      });

      if (!orderResponse.ok) {
        const errDetail = await orderResponse.text();
        return res.status(502).json({ error: 'PayPal Order Creation Failed', details: errDetail });
      }

      const orderData = await orderResponse.json() as { id: string };
      orderId = orderData.id;
    } else {
      // Mock Order ID for instant testing before API keys are plugged in
      orderId = `MOCK-ORDER-${Date.now()}`;
    }

    // Record in donations table
    const currentFY = '2026-2027';
    await dbQuery(`
      INSERT INTO donations (
        id, donor_id, trust_id, trust_name, paypal_order_id, idempotency_key,
        currency, gross_amount, status, fcra_purpose, fcra_financial_year
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CREATED', $9, $10)
    `, [
      uuidv4(),
      activeDonorId,
      profile.id,
      profile.name,
      orderId,
      idempotencyKey,
      currency,
      donationAmount,
      profile.purposeCode,
      currentFY
    ]);

    // Redundancy: Mirror event to append-only immutable ledger
    recordLedgerMirrorEvent('DONOR', {
      donorId: activeDonorId,
      email: email.toLowerCase().trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      nationality: nationality.trim(),
      isNri: isNri ? 1 : 0,
      countryOfResidence: countryOfResidence.toUpperCase().trim()
    });
    recordLedgerMirrorEvent('DONATION', {
      orderId,
      donorId: activeDonorId,
      trustId: profile.id,
      amount: donationAmount,
      currency,
      status: 'CREATED'
    });

    return res.status(201).json({
      orderId,
      idempotencyKey,
      donorId: activeDonorId,
      trustName: profile.name
    });
  } catch (error: any) {
    logger.error('Error creating donation order', error, { body: req.body }, (req as any).correlationId);
    return res.status(500).json({ error: 'Internal failure initiating donation.' });
  }
});

/**
 * Helper: Asynchronous, Idempotent Post-Donation Email Workflow Trigger
 * Catches payment completion, builds template, and dispatches via configured provider
 */
async function triggerDonationEmailWorkflow(orderId: string, correlationId?: string): Promise<void> {
  try {
    const res = await dbQuery(`
      SELECT 
        d.id as donation_id,
        d.paypal_order_id,
        d.paypal_capture_id,
        d.gross_amount,
        d.currency,
        d.trust_id,
        d.trust_name,
        d.status,
        d.created_at,
        d.receipt_email_sent,
        d.payment_method,
        d.upi_vpa,
        d.upi_ref,
        dn.first_name,
        dn.last_name,
        dn.email,
        dn.nationality,
        dn.country_of_residence
      FROM donations d
      LEFT JOIN donors dn ON d.donor_id = dn.id
      WHERE d.paypal_order_id = $1
    `, [orderId]);

    if (!res.rows || res.rows.length === 0) {
      logger.warn(`Email workflow: Donation order ${orderId} not found`, { orderId }, 'EMAIL_WORKFLOW', correlationId);
      return;
    }

    const row = res.rows[0];

    // Idempotency: Prevent duplicate dispatches if both client callback and webhook fire
    if (row.receipt_email_sent === 1) {
      logger.info(`Email workflow: Confirmation email already dispatched for order ${orderId}`, { orderId }, 'EMAIL_IDEMPOTENT', correlationId);
      return;
    }

    if (!row.email) {
      logger.warn(`Email workflow: No donor email attached to donation order ${orderId}`, { orderId }, 'EMAIL_WORKFLOW', correlationId);
      return;
    }

    const profile = TRUST_PROFILES[row.trust_id] || TRUST_PROFILES.divya;
    const campaignHost = process.env.BASE_URL || `http://localhost:${PORT}`;
    const campaignUrl = `${campaignHost}/?trust=${row.trust_id}`;

    const isUpiPayment = row.payment_method === 'UPI' || row.currency === 'INR';

    const emailData: DonationEmailData = {
      donorName: `${row.first_name || 'Generous'} ${row.last_name || 'Donor'}`.trim(),
      donorEmail: row.email,
      grossAmount: parseFloat(row.gross_amount) || 0,
      currency: row.currency || (isUpiPayment ? 'INR' : 'USD'),
      paypalOrderId: row.paypal_order_id,
      paypalCaptureId: row.paypal_capture_id,
      donationDate: new Date(row.created_at || Date.now()).toUTCString(),
      trustId: row.trust_id,
      trustName: profile.name,
      trustTagline: profile.tagline,
      managingTrustee: profile.managingTrustee,
      bankName: profile.bankName,
      accountMasked: profile.accountMasked,
      ifsc: profile.ifsc,
      purposeCode: profile.purposeCode || 'P1301',
      campaignUrl,
      paymentMethod: row.payment_method || (isUpiPayment ? 'UPI' : 'PAYPAL'),
      upiVpa: row.upi_vpa || profile.upiVpa,
      upiRef: row.upi_ref || row.paypal_capture_id,
      instagramHandle: profile.instagramHandle
    };

    const dispatchResult = await sendDonationConfirmationEmail(emailData, correlationId);

    if (dispatchResult.success) {
      await dbQuery(`
        UPDATE donations
        SET receipt_email_sent = 1, updated_at = CURRENT_TIMESTAMP
        WHERE paypal_order_id = $1
      `, [orderId]);

      recordLedgerMirrorEvent('EMAIL_SENT', {
        orderId,
        donorEmail: row.email,
        provider: dispatchResult.provider,
        messageId: dispatchResult.messageId
      });
    }
  } catch (err: any) {
    logger.error('Unhandled exception in triggerDonationEmailWorkflow', err, { orderId }, correlationId);
  }
}

/**
 * 3. Capture Donation Order
 */
app.post('/api/donations/capture-order', async (req: Request, res: Response) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required.' });
  }

  try {
    let captureId: string;
    let gross: number;
    let fee: number;
    let net: number;

    const donationRow = await dbQuery('SELECT trust_id, gross_amount FROM donations WHERE paypal_order_id = $1', [orderId]);
    const trustId = donationRow.rows[0]?.trust_id || req.body.trustId || 'divya';
    const creds = getTrustCredentials(trustId);

    if (creds.clientId && creds.clientSecret && !orderId.startsWith('MOCK-')) {
      const accessToken = await getPayPalAccessToken(trustId);
      const captureResponse = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!captureResponse.ok) {
        const errDetail = await captureResponse.text();
        return res.status(502).json({ error: 'Payment Capture Failed', details: errDetail });
      }

      const captureData = await captureResponse.json() as any;
      const captureUnit = captureData.purchase_units?.[0]?.payments?.captures?.[0];
      captureId = captureUnit?.id || `CAP-${uuidv4()}`;
      gross = parseFloat(captureUnit?.amount?.value || '0.00');
      fee = parseFloat(captureUnit?.seller_receivable_breakdown?.paypal_fee?.value || '0.00');
      net = parseFloat(captureUnit?.seller_receivable_breakdown?.net_amount?.value || `${gross - fee}`);
    } else {
      // Mock Capture
      captureId = `MOCK-CAPTURE-${Date.now()}`;
      gross = donationRow.rows[0]?.gross_amount || 50.0;
      fee = parseFloat((gross * 0.044 + 0.30).toFixed(2));
      net = parseFloat((gross - fee).toFixed(2));
    }

    await dbQuery(`
      UPDATE donations
      SET
        paypal_capture_id = $1,
        paypal_fee = $2,
        net_amount = $3,
        status = 'CAPTURED',
        updated_at = CURRENT_TIMESTAMP
      WHERE paypal_order_id = $4
    `, [captureId, fee, net, orderId]);

    // Redundancy: Mirror capture event and create atomic snapshot
    recordLedgerMirrorEvent('CAPTURE', {
      orderId,
      captureId,
      gross,
      fee,
      net,
      status: 'CAPTURED'
    });
    try {
      await createDatabaseSnapshot('CAPTURE');
    } catch (e: any) {
      logger.warn(`Backup on capture warning: ${e.message}`, { error: e.message }, 'DB_SNAPSHOT', (req as any).correlationId);
    }

    // Trigger post-donation confirmation email workflow (non-blocking & idempotent)
    triggerDonationEmailWorkflow(orderId, (req as any).correlationId).catch((err) => {
      logger.error('Background post-capture email dispatch error', err, { orderId }, (req as any).correlationId);
    });

    return res.json({
      status: 'COMPLETED',
      captureId,
      gross,
      fee,
      net
    });
  } catch (error: any) {
    logger.error('Error capturing donation payment', error, { orderId: req.body?.orderId }, (req as any).correlationId);
    return res.status(500).json({ error: 'Failed to capture payment.' });
  }
});

/**
 * 3B. Initiate Domestic UPI Donation Order (India)
 * Generates standard upi://pay deep link, app-specific links, and dynamic QR Code
 */
app.post('/api/donations/upi/initiate', async (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId;
  try {
    const {
      trustId = 'divya',
      firstName,
      lastName,
      email,
      phoneNumber,
      nationality = 'Indian',
      isNri = false,
      passportOrId,
      countryOfResidence = 'India',
      residentialAddress,
      amount
    } = req.body;

    const numAmount = parseFloat(amount);
    if (!firstName || !lastName || !email || !residentialAddress || !numAmount || numAmount <= 0) {
      return res.status(400).json({
        error: 'Compliance Violation: Full donor identity (Name, Email, Address, Amount) is required for charitable contribution receipting.'
      });
    }

    const profile = TRUST_PROFILES[trustId] || TRUST_PROFILES.divya;
    const vpa = profile.upiVpa || 'charity.seva@sbi';
    const payeeName = profile.name;
    const orderId = `UPI-${Date.now()}-${uuidv4().slice(0, 6).toUpperCase()}`;
    const idempotencyKey = `UPI-IDEM-${orderId}`;

    // 1. Upsert Donor Profile
    const normalizedEmail = email.toLowerCase().trim();
    let donorId: string;
    const existingDonor = await dbQuery('SELECT id FROM donors WHERE email = $1', [normalizedEmail]);

    if (existingDonor.rows && existingDonor.rows.length > 0) {
      donorId = existingDonor.rows[0].id;
      await dbQuery(`
        UPDATE donors SET
          first_name = $1, last_name = $2, phone_number = $3, nationality = $4,
          is_nri = $5, passport_or_id_number = $6, country_of_residence = $7,
          residential_address = $8, updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
      `, [
        firstName.trim(),
        lastName.trim(),
        phoneNumber || null,
        nationality,
        isNri ? 1 : 0,
        passportOrId || null,
        countryOfResidence,
        residentialAddress.trim(),
        donorId
      ]);
    } else {
      donorId = uuidv4();
      await dbQuery(`
        INSERT INTO donors (
          id, first_name, last_name, email, phone_number, nationality,
          is_nri, passport_or_id_number, country_of_residence, residential_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        donorId,
        firstName.trim(),
        lastName.trim(),
        normalizedEmail,
        phoneNumber || null,
        nationality,
        isNri ? 1 : 0,
        passportOrId || null,
        countryOfResidence,
        residentialAddress.trim()
      ]);
      recordLedgerMirrorEvent('DONOR', { donorId, email: normalizedEmail, nationality });
    }

    // 2. Insert Pending UPI Donation Record
    const donationId = uuidv4();
    await dbQuery(`
      INSERT INTO donations (
        id, donor_id, trust_id, trust_name, paypal_order_id, idempotency_key,
        currency, gross_amount, paypal_fee, net_amount, status,
        fcra_purpose, fcra_financial_year, payment_method, upi_vpa
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      donationId,
      donorId,
      trustId,
      profile.name,
      orderId,
      idempotencyKey,
      'INR',
      numAmount,
      0.00,
      numAmount,
      'PENDING_UPI',
      'SOCIAL',
      '2026-2027',
      'UPI',
      vpa
    ]);

    // 3. Build NPCI Compliant Standard UPI URI & App Deep Links
    const cleanNote = `Seva Contribution - ${profile.name}`.slice(0, 50);
    const standardUpiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payeeName)}&am=${numAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(cleanNote)}&tr=${orderId}`;

    const deepLinks = {
      generic: standardUpiUri,
      gpay: `tez://upi/pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payeeName)}&am=${numAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(cleanNote)}&tr=${orderId}`,
      phonepe: `phonepe://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payeeName)}&am=${numAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(cleanNote)}&tr=${orderId}`,
      paytm: `paytmmp://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payeeName)}&am=${numAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(cleanNote)}&tr=${orderId}`,
      bhim: `bhim://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payeeName)}&am=${numAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(cleanNote)}&tr=${orderId}`
    };

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(standardUpiUri)}`;

    recordLedgerMirrorEvent('UPI_INITIATE', {
      orderId,
      donationId,
      donorId,
      amount: numAmount,
      currency: 'INR',
      vpa,
      trustId
    });

    logger.info('UPI Donation Intent initiated', {
      orderId,
      vpa,
      amount: numAmount,
      currency: 'INR',
      trustId
    }, 'UPI_INIT', correlationId);

    return res.json({
      success: true,
      orderId,
      donationId,
      amount: numAmount,
      currency: 'INR',
      vpa,
      payeeName,
      standardUpiUri,
      qrCodeUrl,
      deepLinks
    });
  } catch (err: any) {
    logger.error('Error initiating UPI donation', err, undefined, correlationId);
    return res.status(500).json({ error: 'Failed to initiate UPI donation.' });
  }
});

/**
 * 3C. Verify & Capture Domestic UPI Donation
 * Records UTR / payment confirmation, captures donation, triggers receipt email
 */
app.post('/api/donations/upi/verify', async (req: Request, res: Response) => {
  const correlationId = (req as any).correlationId;
  try {
    const { orderId, utr } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing UPI order ID.' });
    }

    const checkRes = await dbQuery('SELECT * FROM donations WHERE paypal_order_id = $1', [orderId]);
    if (!checkRes.rows || checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'UPI donation order not found.' });
    }

    const donation = checkRes.rows[0];
    const captureId = utr ? utr.trim() : `UPI-CAP-${Date.now()}`;

    // Idempotent: If already captured, return existing data
    if (donation.status === 'CAPTURED') {
      return res.json({
        success: true,
        status: 'COMPLETED',
        orderId,
        captureId: donation.paypal_capture_id || captureId,
        gross: donation.gross_amount,
        currency: donation.currency || 'INR'
      });
    }

    // Update status to CAPTURED
    await dbQuery(`
      UPDATE donations SET
        status = 'CAPTURED',
        paypal_capture_id = $1,
        upi_ref = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE paypal_order_id = $3
    `, [captureId, utr || captureId, orderId]);

    recordLedgerMirrorEvent('UPI_SUCCESS', {
      orderId,
      captureId,
      amount: donation.gross_amount,
      currency: donation.currency,
      status: 'CAPTURED'
    });

    try {
      await createDatabaseSnapshot('CAPTURE');
    } catch (e: any) {
      logger.warn(`Backup warning: ${e.message}`, { error: e.message }, 'DB_SNAPSHOT', correlationId);
    }

    // Trigger post-donation confirmation email workflow (non-blocking & idempotent)
    triggerDonationEmailWorkflow(orderId, correlationId).catch((err) => {
      logger.error('Background UPI post-capture email dispatch error', err, { orderId }, correlationId);
    });

    logger.info('UPI Donation verified and captured', {
      orderId,
      captureId,
      amount: donation.gross_amount
    }, 'UPI_SUCCESS', correlationId);

    return res.json({
      success: true,
      status: 'COMPLETED',
      orderId,
      captureId,
      gross: donation.gross_amount,
      currency: donation.currency || 'INR',
      trustId: donation.trust_id
    });
  } catch (err: any) {
    logger.error('Error verifying UPI donation', err, undefined, correlationId);
    return res.status(500).json({ error: 'Failed to verify UPI donation.' });
  }
});

/**
 * 4. Cryptographically Signed Webhook Listener
 */
app.post('/api/webhooks/paypal', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isValid = await verifyPayPalWebhookSignature(req);
    if (!isValid) {
      return res.status(400).send('Invalid signature');
    }

    const event = req.body;
    const eventId = event.id;
    const eventType = event.event_type;

    const existing = await dbQuery('SELECT id FROM webhook_logs WHERE event_id = $1', [eventId]);
    if (existing.rows.length > 0) {
      return res.status(200).json({ status: 'ALREADY_PROCESSED' });
    }

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = event.resource;
      const captureId = capture.id;
      const orderId = capture.supplementary_data?.related_ids?.order_id;
      const fee = parseFloat(capture.seller_receivable_breakdown?.paypal_fee?.value || '0.00');
      const net = parseFloat(capture.seller_receivable_breakdown?.net_amount?.value || capture.amount.value);

      if (orderId) {
        await dbQuery(`
          UPDATE donations
          SET paypal_capture_id = $1, paypal_fee = $2, net_amount = $3, status = 'CAPTURED', updated_at = CURRENT_TIMESTAMP
          WHERE paypal_order_id = $4
        `, [captureId, fee, net, orderId]);

        recordLedgerMirrorEvent('CAPTURE', {
          orderId,
          captureId,
          fee,
          net,
          source: 'WEBHOOK'
        });

        // Trigger post-donation confirmation email workflow (idempotent, non-blocking)
        triggerDonationEmailWorkflow(orderId, (req as any).correlationId).catch((err) => {
          logger.error('Background webhook email dispatch error', err, { orderId }, (req as any).correlationId);
        });
      }
    }

    await dbQuery(`
      INSERT INTO webhook_logs (id, event_id, event_type, resource_type, payload, processed_status)
      VALUES ($1, $2, $3, $4, $5, 'SUCCESS')
    `, [uuidv4(), eventId, eventType, event.resource_type, JSON.stringify(event)]);

    return res.status(200).json({ status: 'RECEIVED' });
  } catch (err: any) {
    logger.error('Webhook processing exception', err, { eventId: req.body?.id }, (req as any).correlationId);
    return res.status(500).json({ error: 'Internal failure processing webhook.' });
  }
});

// ============================================================================
// TRUSTEE ADMIN & COMPLIANCE APIS (PROTECTED WITH AUTHENTICATION)
// ============================================================================

/**
 * 5. Trustee Admin Login
 */
app.post('/api/admin/login', authLimiter, (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Passcode is required.' });
  }

  // Constant-time comparison to prevent timing attacks
  const inputBuffer = Buffer.from(password);
  const secretBuffer = Buffer.from(ADMIN_PASSWORD);

  const isMatch = inputBuffer.length === secretBuffer.length &&
    crypto.timingSafeEqual(inputBuffer, secretBuffer);

  if (!isMatch) {
    logger.warn('Failed admin login attempt', { ip: req.ip }, 'ADMIN_AUTH_FAILED', (req as any).correlationId);
    return res.status(401).json({ error: 'Invalid Trustee Passcode. Access denied.' });
  }

  const token = generateAdminToken();
  logger.info('Trustee admin authenticated successfully', undefined, 'ADMIN_AUTH_SUCCESS', (req as any).correlationId);
  return res.json({
    success: true,
    token,
    message: 'Authentication successful. Trustee console unlocked.'
  });
});

/**
 * 6. Session Verification
 */
app.get('/api/admin/verify-session', adminAuthMiddleware, (req: Request, res: Response) => {
  res.json({ authenticated: true, role: 'trustee_admin' });
});

/**
 * 7. Trustee Dashboard Stats (Protected)
 */
app.get('/api/admin/stats', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const trustFilter = req.query.trust as string;
    let sql = `
      SELECT 
        COUNT(*) as total_donations,
        COALESCE(SUM(CASE WHEN UPPER(currency) = 'USD' THEN gross_amount ELSE 0 END), 0) as total_usd_gross,
        COALESCE(SUM(CASE WHEN UPPER(currency) = 'USD' THEN paypal_fee ELSE 0 END), 0) as total_usd_fees,
        COALESCE(SUM(CASE WHEN UPPER(currency) = 'USD' THEN net_amount ELSE 0 END), 0) as total_usd_net,
        COALESCE(SUM(CASE WHEN UPPER(currency) = 'INR' THEN gross_amount ELSE 0 END), 0) as total_inr_gross,
        COALESCE(SUM(CASE WHEN UPPER(currency) = 'INR' THEN paypal_fee ELSE 0 END), 0) as total_inr_fees,
        COALESCE(SUM(CASE WHEN UPPER(currency) = 'INR' THEN net_amount ELSE 0 END), 0) as total_inr_net,
        COUNT(DISTINCT donor_id) as unique_donors
      FROM donations
      WHERE status = 'CAPTURED'
    `;
    const params: any[] = [];
    if (trustFilter) {
      sql += ' AND trust_id = $1';
      params.push(trustFilter);
    }

    const stats = await dbQuery(sql, params);
    const row = stats.rows[0];

    const usdGross = parseFloat(row.total_usd_gross) || 0;
    const usdFees = parseFloat(row.total_usd_fees) || 0;
    const usdNet = parseFloat(row.total_usd_net) || 0;
    const inrGross = parseFloat(row.total_inr_gross) || 0;
    const inrNet = parseFloat(row.total_inr_net) || 0;

    // Realized INR credited to Trust bank accounts: USD converted at wholesale rate (~₹83.50/USD) + direct domestic INR
    const totalInrRealized = Math.round((usdNet * 83.50) + inrNet);

    res.json({
      totalDonations: parseInt(row.total_donations, 10),
      totalGrossUsd: usdGross.toFixed(2),
      totalGrossInr: inrGross.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      totalFeesUsd: usdFees.toFixed(2),
      totalNetUsd: usdNet.toFixed(2),
      totalNetInr: inrNet.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      totalInrRealized: totalInrRealized.toLocaleString('en-IN'),
      uniqueDonors: parseInt(row.unique_donors, 10)
    });
  } catch (err: any) {
    logger.error('Admin stats retrieval error', err, undefined, (req as any).correlationId);
    res.status(500).json({ error: 'Failed to retrieve stats.' });
  }
});

/**
 * 8. Trustee Live Donations Ledger (Protected)
 */
app.get('/api/admin/donations', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const trustFilter = req.query.trust as string;
    let sql = `
      SELECT 
        d.id as donation_id,
        d.created_at,
        d.trust_id,
        d.trust_name,
        d.paypal_order_id,
        d.paypal_capture_id,
        d.currency,
        d.gross_amount,
        d.paypal_fee,
        d.net_amount,
        d.status,
        d.fcra_purpose,
        d.fcra_financial_year,
        d.payment_method,
        d.upi_vpa,
        d.upi_ref,
        dn.first_name,
        dn.last_name,
        dn.email,
        dn.nationality,
        dn.country_of_residence,
        dn.residential_address,
        dn.passport_or_id_number,
        dn.is_nri
      FROM donations d
      JOIN donors dn ON d.donor_id = dn.id
      ORDER BY d.created_at DESC
      LIMIT 100;
    `;
    const result = await dbQuery(sql);
    let donations = result.rows;
    if (trustFilter) {
      donations = donations.filter((item: any) => item.trust_id === trustFilter);
    }
    res.json(donations);
  } catch (err: any) {
    logger.error('Admin ledger retrieval error', err, undefined, (req as any).correlationId);
    res.status(500).json({ error: 'Failed to retrieve donations.' });
  }
});

/**
 * 9. Visual Analytics & Aggregations API (Protected)
 * Feeds line charts, donut/pie charts, and geographical breakdowns
 */
app.get('/api/admin/analytics', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // 1. Time-series daily trend (normalized to USD value for standard chart comparison)
    const timelineSql = `
      SELECT 
        SUBSTR(created_at, 1, 10) as date_key,
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN UPPER(currency) = 'INR' THEN gross_amount / 83.50 ELSE gross_amount END), 0) as gross_usd,
        COALESCE(SUM(CASE WHEN UPPER(currency) = 'INR' THEN net_amount / 83.50 ELSE net_amount END), 0) as net_usd
      FROM donations
      WHERE status = 'CAPTURED'
      GROUP BY SUBSTR(created_at, 1, 10)
      ORDER BY date_key ASC
      LIMIT 30;
    `;
    const timelineRes = await dbQuery(timelineSql);

    // 2. Trust distribution (Primary vs. Secondary)
    const trustSql = `
      SELECT 
        trust_id,
        trust_name,
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN UPPER(currency) = 'INR' THEN gross_amount / 83.50 ELSE gross_amount END), 0) as gross_usd,
        COALESCE(SUM(CASE WHEN UPPER(currency) = 'INR' THEN net_amount / 83.50 ELSE net_amount END), 0) as net_usd
      FROM donations
      WHERE status = 'CAPTURED'
      GROUP BY trust_id, trust_name;
    `;
    const trustRes = await dbQuery(trustSql);

    // 3. Country distribution
    const countrySql = `
      SELECT 
        CASE 
          WHEN LOWER(TRIM(dn.country_of_residence)) IN ('in', 'india') THEN 'India'
          ELSE dn.country_of_residence 
        END as country,
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN UPPER(d.currency) = 'INR' THEN d.gross_amount / 83.50 ELSE d.gross_amount END), 0) as gross_usd
      FROM donations d
      JOIN donors dn ON d.donor_id = dn.id
      WHERE d.status = 'CAPTURED'
      GROUP BY 
        CASE 
          WHEN LOWER(TRIM(dn.country_of_residence)) IN ('in', 'india') THEN 'India'
          ELSE dn.country_of_residence 
        END
      ORDER BY gross_usd DESC
      LIMIT 10;
    `;
    const countryRes = await dbQuery(countrySql);

    // 4. India Resident vs NRI vs Foreign National breakdown
    const categorySql = `
      SELECT 
        CASE 
          WHEN LOWER(TRIM(dn.country_of_residence)) IN ('in', 'india') THEN 'India'
          WHEN dn.is_nri = 1 THEN 'Non-Resident Indian (NRI)' 
          ELSE 'Foreign National' 
        END as category,
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN UPPER(d.currency) = 'INR' THEN d.gross_amount / 83.50 ELSE d.gross_amount END), 0) as gross_usd
      FROM donations d
      JOIN donors dn ON d.donor_id = dn.id
      WHERE d.status = 'CAPTURED'
      GROUP BY 
        CASE 
          WHEN LOWER(TRIM(dn.country_of_residence)) IN ('in', 'india') THEN 'India'
          WHEN dn.is_nri = 1 THEN 'Non-Resident Indian (NRI)' 
          ELSE 'Foreign National' 
        END;
    `;
    const categoryRes = await dbQuery(categorySql);

    res.json({
      timeline: timelineRes.rows,
      byTrust: trustRes.rows,
      byCountry: countryRes.rows,
      byCategory: categoryRes.rows
    });
  } catch (err: any) {
    logger.error('Analytics aggregation error', err, undefined, (req as any).correlationId);
    res.status(500).json({ error: 'Failed to compute analytics.' });
  }
});

/**
 * 10. Granular Transaction Line Items & Subline Items Inspector (Protected)
 */
app.get('/api/admin/transaction/:id', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const txId = req.params.id;
    const sql = `
      SELECT 
        d.id as donation_id,
        d.created_at,
        d.updated_at,
        d.trust_id,
        d.trust_name,
        d.paypal_order_id,
        d.paypal_capture_id,
        d.idempotency_key,
        d.currency,
        d.gross_amount,
        d.paypal_fee,
        d.net_amount,
        d.status,
        d.fcra_purpose,
        d.fcra_financial_year,
        d.payment_method,
        d.upi_vpa,
        d.upi_ref,
        dn.id as donor_id,
        dn.first_name,
        dn.last_name,
        dn.email,
        dn.nationality,
        dn.country_of_residence,
        dn.residential_address,
        dn.passport_or_id_number,
        dn.is_nri
      FROM donations d
      JOIN donors dn ON d.donor_id = dn.id
      WHERE d.id = $1 OR d.paypal_order_id = $1 OR d.paypal_capture_id = $1;
    `;
    const result = await dbQuery(sql, [txId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction record not found.' });
    }

    const tx = result.rows[0];
    const profile = TRUST_PROFILES[tx.trust_id] || TRUST_PROFILES.divya;

    const gross = parseFloat(tx.gross_amount) || 0;
    const fee = parseFloat(tx.paypal_fee) || 0;
    const net = parseFloat(tx.net_amount) || (gross - fee);
    const fxRate = 83.50;
    const isDomesticInr = (tx.currency || '').toUpperCase() === 'INR' || (tx.payment_method || '').toUpperCase() === 'UPI';
    const realizedInr = isDomesticInr ? Math.round(net) : Math.round(net * fxRate);
    const feePercent = gross > 0 ? ((fee / gross) * 100).toFixed(2) : '0.00';

    // Structured Financial Waterfall & Subline Items (Customized by Currency & Payment Method)
    const lineItems = [
      {
        lineNumber: 1,
        title: isDomesticInr 
          ? `Domestic Seva Contribution to ${tx.trust_name}` 
          : `Foreign Contribution to ${tx.trust_name}`,
        purpose: tx.fcra_purpose,
        currency: tx.currency || (isDomesticInr ? 'INR' : 'USD'),
        grossAmount: gross,
        sublineItems: isDomesticInr ? [
          { label: 'Gross Donated Amount', value: `₹${gross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`, type: 'credit' },
          { label: tx.payment_method === 'UPI' ? 'UPI Domestic Processing Surcharge (0%)' : `Merchant Fee (${feePercent}%)`, value: `₹${fee.toFixed(2)} INR`, type: 'deduction' },
          { label: 'Net Gateway Settlement', value: `₹${net.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`, type: 'net' },
          { label: 'Currency Settlement & FX Conversion', value: 'Direct Domestic Settlement (1:1 INR - No Foreign Exchange Required)', type: 'conversion' },
          { label: 'Estimated Realized Bank Credit', value: `₹${realizedInr.toLocaleString('en-IN')}`, type: 'realized' },
          { label: 'Settlement Bank Account', value: `${profile.bankName} (${profile.accountMasked}, IFSC: ${profile.ifsc})`, type: 'destination' },
          { label: 'Remittance Mode / Payee VPA', value: `${tx.payment_method || 'UPI'} (${tx.upi_vpa || profile.upiVpa || 'charity.seva@sbi'})`, type: 'statutory' },
          { label: 'Bank UTR / Transaction Reference', value: tx.upi_ref || tx.paypal_capture_id || tx.paypal_order_id, type: 'statutory' },
          { label: 'Statutory Regime / Tax Receipt', value: `${tx.fcra_financial_year} (Direct Domestic Charitable Seva)`, type: 'statutory' }
        ] : [
          { label: 'Gross Donated Amount', value: `$${gross.toFixed(2)} USD`, type: 'credit' },
          { label: `PayPal Merchant Fee (${feePercent}%)`, value: `-$${fee.toFixed(2)} USD`, type: 'deduction' },
          { label: 'Net Gateway Settlement', value: `$${net.toFixed(2)} USD`, type: 'net' },
          { label: 'Wholesale Interbank FX Rate', value: `₹${fxRate.toFixed(2)} / USD`, type: 'conversion' },
          { label: 'Estimated Realized Bank Credit', value: `₹${realizedInr.toLocaleString('en-IN')}`, type: 'realized' },
          { label: 'Settlement Bank Account', value: `${profile.bankName} (${profile.accountMasked}, IFSC: ${profile.ifsc})`, type: 'destination' },
          { label: 'RBI Purpose Code', value: `${profile.purposeCode} (Cross-Border Charitable Contribution)`, type: 'statutory' },
          { label: 'FCRA Financial Year', value: tx.fcra_financial_year, type: 'statutory' }
        ]
      }
    ];

    // Determine accurate donor statutory category:
    // If the donor is residing in India, category MUST be 'India', not 'Foreign National'.
    const countryClean = (tx.country_of_residence || '').trim().toLowerCase();
    const isResidingInIndia = countryClean === 'india' || countryClean === 'in' || countryClean === 'ind';

    let donorCategory = 'Foreign National';
    if (isResidingInIndia) {
      donorCategory = 'India';
    } else if (tx.is_nri === 1 || (tx.nationality || '').trim().toLowerCase() === 'indian') {
      donorCategory = 'Non-Resident Indian (NRI)';
    }

    const donorKyc = {
      fullName: `${tx.first_name} ${tx.last_name}`,
      email: tx.email,
      nationality: tx.nationality,
      isNri: isResidingInIndia ? false : tx.is_nri === 1,
      category: donorCategory,
      passportOrIdNumber: tx.passport_or_id_number || 'N/A',
      countryOfResidence: tx.country_of_residence,
      residentialAddress: tx.residential_address
    };

    const auditTrail = [
      { stage: 'ORDER_INITIATED', time: tx.created_at, reference: tx.paypal_order_id, status: 'COMPLETED' },
      { stage: 'PAYMENT_CAPTURED', time: tx.updated_at, reference: tx.upi_ref || tx.paypal_capture_id || 'PENDING', status: tx.status },
      { stage: 'LEDGER_RECORDED', time: tx.updated_at, reference: tx.idempotency_key, status: 'RECORDED' },
      { stage: isDomesticInr ? 'DOMESTIC_10BE_INDEXED' : 'FC4_COMPLIANCE_INDEXED', time: tx.updated_at, reference: `FY-${tx.fcra_financial_year}`, status: 'ACTIVE' }
    ];

    res.json({
      transactionId: tx.donation_id,
      status: tx.status,
      timestamp: tx.created_at,
      trustProfile: profile,
      lineItems,
      donorKyc,
      auditTrail,
      rawIdentifiers: {
        paypalOrderId: tx.paypal_order_id,
        paypalCaptureId: tx.paypal_capture_id,
        upiRef: tx.upi_ref,
        paymentMethod: tx.payment_method,
        idempotencyKey: tx.idempotency_key
      }
    });
  } catch (err: any) {
    logger.error('Transaction inspection error', err, { txId: req.params.id }, (req as any).correlationId);
    res.status(500).json({ error: 'Failed to inspect transaction line items.' });
  }
});

/**
 * 11. Database Redundancy & Backup Status (Protected)
 */
app.get('/api/admin/database/status', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const status = await getDatabaseStatus();
    res.json(status);
  } catch (err: any) {
    logger.error('Database status error', err, undefined, (req as any).correlationId);
    res.status(500).json({ error: 'Failed to retrieve database status.' });
  }
});

/**
 * 12. Trigger Instant Database Backup (Protected)
 */
app.post('/api/admin/database/backup', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const snapshot = await createDatabaseSnapshot('MANUAL_USER');
    logger.info(`Database backup generated: ${snapshot.filename}`, { snapshot }, 'DB_SNAPSHOT', (req as any).correlationId);
    res.json({
      success: true,
      message: `Database backup snapshot '${snapshot.filename}' generated successfully.`,
      snapshot
    });
  } catch (err: any) {
    logger.error('Backup trigger error', err, undefined, (req as any).correlationId);
    res.status(500).json({ error: 'Failed to create backup snapshot: ' + err.message });
  }
});

/**
 * 13. Download Backup Snapshot File (Protected)
 */
app.get('/api/admin/database/download/:filename', adminAuthMiddleware, (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const backupsDir = path.join(__dirname, '..', 'backups');
  const filePath = path.join(backupsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup file does not exist.' });
  }

  res.setHeader('Content-Type', 'application/vnd.sqlite3');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.sendFile(filePath);
});

/**
 * 14. One-Click Ministry of Home Affairs (MHA) Form FC-4 Exporter (Protected)
 */
app.get('/api/admin/fc4-export', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const sql = `
      SELECT 
        d.created_at AS date_of_receipt,
        d.trust_name,
        (dn.first_name || ' ' || dn.last_name) AS donor_full_name,
        dn.nationality,
        CASE 
          WHEN LOWER(TRIM(dn.country_of_residence)) IN ('in', 'india') THEN 'India'
          WHEN dn.is_nri = 1 THEN 'Yes (NRI)' 
          ELSE 'No (Foreign National)' 
        END AS is_nri,
        COALESCE(dn.passport_or_id_number, 'N/A') AS passport_id,
        dn.country_of_residence,
        dn.residential_address,
        d.currency,
        d.gross_amount,
        d.paypal_fee,
        d.net_amount,
        ROUND(CASE WHEN UPPER(d.currency) = 'INR' THEN d.net_amount ELSE d.net_amount * 83.50 END, 2) AS estimated_inr_credit,
        d.fcra_purpose,
        COALESCE(d.upi_ref, d.paypal_capture_id) AS paypal_capture_id
      FROM donations d
      JOIN donors dn ON d.donor_id = dn.id
      WHERE d.status = 'CAPTURED'
      ORDER BY d.created_at ASC;
    `;
    const result = await dbQuery(sql);
    const rows = result.rows;

    const format = req.query.format as string;
    if (format === 'json') {
      return res.json({ financialYear: '2026-2027', count: rows.length, records: rows });
    }

    // Generate CSV format for Form FC-4 filing
    const headers = [
      'Date of Receipt', 'Trust Entity', 'Donor Legal Name', 'Nationality',
      'Is NRI', 'Passport/ID', 'Country of Residence', 'Residential Address',
      'Currency', 'Gross Foreign Amount', 'Gateway Fee', 'Net Foreign Amount',
      'Estimated INR Credited', 'FCRA Purpose', 'Transaction Capture ID'
    ];

    const csvLines = [headers.join(',')];
    for (const r of rows) {
      const line = [
        `"${r.date_of_receipt}"`,
        `"${r.trust_name}"`,
        `"${r.donor_full_name}"`,
        `"${r.nationality}"`,
        `"${r.is_nri}"`,
        `"${r.passport_id}"`,
        `"${r.country_of_residence}"`,
        `"${(r.residential_address || '').replace(/"/g, '""')}"`,
        `"${r.currency}"`,
        r.gross_amount,
        r.paypal_fee,
        r.net_amount,
        r.estimated_inr_credit,
        `"${r.fcra_purpose}"`,
        `"${r.paypal_capture_id}"`
      ];
      csvLines.push(line.join(','));
    }

    const csvContent = csvLines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="MHA_Form_FC4_Annual_Return_2026.csv"');
    return res.send(csvContent);
  } catch (err: any) {
    logger.error('FC-4 export failure', err, undefined, (req as any).correlationId);
    res.status(500).json({ error: 'Failed to generate FC-4 export.' });
  }
});

/**
 * 15. Demo Donation Generator (Protected, For Trustee Testing in Workspace)
 */
app.post('/api/admin/demo-donation', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { trustId = 'divya', amount = 100 } = req.body;
    const profile = TRUST_PROFILES[trustId] || TRUST_PROFILES.divya;
    const donorId = uuidv4();
    const donationId = uuidv4();
    const orderId = `SIM-ORDER-${Date.now()}`;
    const captureId = `SIM-CAP-${Date.now()}`;
    const donationAmount = parseFloat(amount) || 100;
    const fee = parseFloat((donationAmount * 0.0199 + 0.49).toFixed(2));
    const net = parseFloat((donationAmount - fee).toFixed(2));

    const testCountries = ['US', 'GB', 'CA', 'AE', 'SG', 'AU'];
    const randomCountry = testCountries[Math.floor(Math.random() * testCountries.length)];

    await dbQuery(`
      INSERT INTO donors (
        id, email, first_name, last_name, nationality, is_nri, passport_or_id_number,
        country_of_residence, residential_address
      )
      VALUES ($1, $2, 'Dr. Robert', 'Vanderbilt', 'American', 0, 'PASS-US-998822', $3, '120 Broadway, Manhattan, NY 10271')
      ON CONFLICT (email) DO NOTHING;
    `, [donorId, `donor.${Date.now()}@globalphilanthropy.org`, randomCountry]);

    await dbQuery(`
      INSERT INTO donations (
        id, donor_id, trust_id, trust_name, paypal_order_id, paypal_capture_id, idempotency_key,
        currency, gross_amount, paypal_fee, net_amount, status, fcra_purpose, fcra_financial_year
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', $8, $9, $10, 'CAPTURED', $11, '2026-2027');
    `, [
      donationId, donorId, profile.id, profile.name, orderId, captureId,
      uuidv4(), donationAmount, fee, net, profile.purposeCode
    ]);

    recordLedgerMirrorEvent('DONATION', {
      orderId,
      donationId,
      trustId: profile.id,
      amount: donationAmount,
      currency: 'USD',
      status: 'CAPTURED',
      simulation: true
    });

    try {
      await createDatabaseSnapshot('SIMULATION');
    } catch {}

    res.json({
      success: true,
      message: `Test donation of $${donationAmount.toFixed(2)} USD successfully processed for ${profile.name}!`,
      donationId,
      orderId,
      captureId,
      gross: donationAmount,
      fee,
      net
    });

    // Trigger email confirmation for simulated donation test
    triggerDonationEmailWorkflow(orderId, (req as any).correlationId).catch((err) => {
      logger.error('Background demo email dispatch error', err, { orderId }, (req as any).correlationId);
    });
  } catch (err: any) {
    logger.error('Demo donation error', err, undefined, (req as any).correlationId);
    res.status(500).json({ error: 'Failed to create demo donation.' });
  }
});

/**
 * 16. Transactional Email Dispatch Logs (Protected)
 */
app.get('/api/admin/email/logs', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const logs = await dbQuery(`
      SELECT id, order_id, donor_email, provider, status, message_id, error_details, sent_at
      FROM email_dispatch_logs
      ORDER BY sent_at DESC
      LIMIT 50
    `);
    res.json({ logs: logs.rows });
  } catch (err: any) {
    logger.error('Error fetching email dispatch logs', err, undefined, (req as any).correlationId);
    res.status(500).json({ error: 'Failed to fetch email logs' });
  }
});

/**
 * 17. Test Email Dispatcher (Protected)
 */
app.post('/api/admin/email/test-send', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { to = 'donor@example.com', trustId = 'divya', amount = 50 } = req.body;
    const profile = TRUST_PROFILES[trustId] || TRUST_PROFILES.divya;
    const campaignHost = process.env.BASE_URL || `http://localhost:${PORT}`;

    const testData: DonationEmailData = {
      donorName: 'Devotee Seva Supporter',
      donorEmail: to,
      grossAmount: parseFloat(amount) || 50,
      currency: 'USD',
      paypalOrderId: `TEST-ORD-${Date.now()}`,
      paypalCaptureId: `TEST-CAP-${Date.now()}`,
      donationDate: new Date().toUTCString(),
      trustId,
      trustName: profile.name,
      trustTagline: profile.tagline,
      managingTrustee: profile.managingTrustee,
      bankName: profile.bankName,
      accountMasked: profile.accountMasked,
      ifsc: profile.ifsc,
      purposeCode: profile.purposeCode,
      campaignUrl: `${campaignHost}/?trust=${trustId}`
    };

    const result = await sendDonationConfirmationEmail(testData, (req as any).correlationId);
    res.json({
      status: 'DISPATCH_COMPLETED',
      result,
      recipient: to,
      trust: profile.name
    });
  } catch (err: any) {
    logger.error('Error sending test email', err, undefined, (req as any).correlationId);
    res.status(500).json({ error: 'Failed to dispatch test email.' });
  }
});

/**
 * 18. Live Dynamic Email HTML Preview (Protected)
 */
app.get('/api/admin/email/preview', adminAuthMiddleware, (req: Request, res: Response) => {
  try {
    const trustId = (req.query.trustId as string) || 'divya';
    const amount = parseFloat(req.query.amount as string) || 108;
    const profile = TRUST_PROFILES[trustId] || TRUST_PROFILES.divya;
    const campaignHost = process.env.BASE_URL || `http://localhost:${PORT}`;

    const previewData: DonationEmailData = {
      donorName: 'Smt. Ananya & Sri Ramesh Sharma',
      donorEmail: 'donor@example.org',
      grossAmount: amount,
      currency: 'USD',
      paypalOrderId: 'ORD-PREVIEW-' + Math.floor(Math.random() * 900000 + 100000),
      paypalCaptureId: 'CAP-PREVIEW-' + Math.floor(Math.random() * 900000 + 100000),
      donationDate: new Date().toUTCString(),
      trustId,
      trustName: profile.name,
      trustTagline: profile.tagline,
      managingTrustee: profile.managingTrustee,
      bankName: profile.bankName,
      accountMasked: profile.accountMasked,
      ifsc: profile.ifsc,
      purposeCode: profile.purposeCode,
      campaignUrl: `${campaignHost}/?trust=${trustId}`
    };

    const html = renderDonationEmailHtml(previewData);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err: any) {
    logger.error('Error generating email preview', err, undefined, (req as any).correlationId);
    res.status(500).send('<h3>Failed to render email preview</h3>');
  }
});

// Centralized Express Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req as any).correlationId;
  logger.fatal(`Unhandled express exception: ${err.message}`, err, {
    url: req.originalUrl || req.url,
    method: req.method
  }, correlationId);

  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    error: 'Internal server error',
    correlationId
  });
});

// Boot Server & Initialize Database
async function startServer() {
  await initDatabase();
  app.listen(PORT, () => {
    logger.info(`FinTech Cross-Border Non-Profit Engine Online on port ${PORT} [${PAYPAL_MODE.toUpperCase()}]`, {
      port: PORT,
      paypalMode: PAYPAL_MODE,
      screen1: `http://localhost:${PORT}`,
      screen2: `http://localhost:${PORT}/admin`
    }, 'SERVER_STARTUP');

    console.log(`=======================================================`);
    console.log(` FinTech Cross-Border Non-Profit Engine Online       `);
    console.log(` Port: ${PORT} | Mode: ${PAYPAL_MODE.toUpperCase()}  `);
    console.log(` Entities: Multi-Entity Regulatory Compliance Active `);
    console.log(` Donor Portal (Screen 1): http://localhost:${PORT}   `);
    console.log(` Trustee Workspace (Screen 2): http://localhost:${PORT}/admin`);
    console.log(` Security: Helmet CSP Active | Rate Limit Active     `);
    console.log(` Redundancy: WAL Mode Enabled | Backups Directory     `);
    console.log(` Logging: Structured JSON + 7-Day Free-Tier Retention `);
    console.log(`=======================================================`);
  });
}

startServer();

