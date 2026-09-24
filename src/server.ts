import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
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
        COALESCE(SUM(gross_amount), 0) as total_usd,
        COALESCE(SUM(paypal_fee), 0) as total_fees,
        COALESCE(SUM(net_amount), 0) as total_net,
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

    // Estimated INR realized (wholesale card exchange rate ~ ₹83.50/USD)
    const totalInr = Math.round((parseFloat(row.total_net) || 0) * 83.50);

    res.json({
      totalDonations: parseInt(row.total_donations, 10),
      totalGrossUsd: parseFloat(row.total_usd).toFixed(2),
      totalFeesUsd: parseFloat(row.total_fees).toFixed(2),
      totalNetUsd: parseFloat(row.total_net).toFixed(2),
      totalInrRealized: totalInr.toLocaleString('en-IN'),
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
    // 1. Time-series daily trend
    const timelineSql = `
      SELECT 
        SUBSTR(created_at, 1, 10) as date_key,
        COUNT(*) as count,
        COALESCE(SUM(gross_amount), 0) as gross_usd,
        COALESCE(SUM(net_amount), 0) as net_usd
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
        COALESCE(SUM(gross_amount), 0) as gross_usd,
        COALESCE(SUM(net_amount), 0) as net_usd
      FROM donations
      WHERE status = 'CAPTURED'
      GROUP BY trust_id, trust_name;
    `;
    const trustRes = await dbQuery(trustSql);

    // 3. Country distribution
    const countrySql = `
      SELECT 
        dn.country_of_residence as country,
        COUNT(*) as count,
        COALESCE(SUM(d.gross_amount), 0) as gross_usd
      FROM donations d
      JOIN donors dn ON d.donor_id = dn.id
      WHERE d.status = 'CAPTURED'
      GROUP BY dn.country_of_residence
      ORDER BY gross_usd DESC
      LIMIT 10;
    `;
    const countryRes = await dbQuery(countrySql);

    // 4. NRI vs Foreign National breakdown
    const categorySql = `
      SELECT 
        CASE WHEN dn.is_nri = 1 THEN 'Non-Resident Indian (NRI)' ELSE 'Foreign National' END as category,
        COUNT(*) as count,
        COALESCE(SUM(d.gross_amount), 0) as gross_usd
      FROM donations d
      JOIN donors dn ON d.donor_id = dn.id
      WHERE d.status = 'CAPTURED'
      GROUP BY dn.is_nri;
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
    const realizedInr = Math.round(net * fxRate);
    const feePercent = gross > 0 ? ((fee / gross) * 100).toFixed(2) : '0.00';

    // Structured Financial Waterfall & Subline Items
    const lineItems = [
      {
        lineNumber: 1,
        title: `Foreign Contribution to ${tx.trust_name}`,
        purpose: tx.fcra_purpose,
        currency: tx.currency,
        grossAmount: gross,
        sublineItems: [
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

    const donorKyc = {
      fullName: `${tx.first_name} ${tx.last_name}`,
      email: tx.email,
      nationality: tx.nationality,
      isNri: tx.is_nri === 1,
      category: tx.is_nri === 1 ? 'Non-Resident Indian (NRI)' : 'Foreign National',
      passportOrIdNumber: tx.passport_or_id_number || 'N/A',
      countryOfResidence: tx.country_of_residence,
      residentialAddress: tx.residential_address
    };

    const auditTrail = [
      { stage: 'ORDER_INITIATED', time: tx.created_at, reference: tx.paypal_order_id, status: 'COMPLETED' },
      { stage: 'PAYMENT_CAPTURED', time: tx.updated_at, reference: tx.paypal_capture_id || 'PENDING', status: tx.status },
      { stage: 'LEDGER_RECORDED', time: tx.updated_at, reference: tx.idempotency_key, status: 'RECORDED' },
      { stage: 'FC4_COMPLIANCE_INDEXED', time: tx.updated_at, reference: `FY-${tx.fcra_financial_year}`, status: 'ACTIVE' }
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
        CASE WHEN dn.is_nri = 1 THEN 'Yes (NRI)' ELSE 'No (Foreign National)' END AS is_nri,
        COALESCE(dn.passport_or_id_number, 'N/A') AS passport_id,
        dn.country_of_residence,
        dn.residential_address,
        d.currency,
        d.gross_amount,
        d.paypal_fee,
        d.net_amount,
        ROUND(d.net_amount * 83.50, 2) AS estimated_inr_credit,
        d.fcra_purpose,
        d.paypal_capture_id
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
  } catch (err: any) {
    logger.error('Demo donation error', err, undefined, (req as any).correlationId);
    res.status(500).json({ error: 'Failed to create demo donation.' });
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

