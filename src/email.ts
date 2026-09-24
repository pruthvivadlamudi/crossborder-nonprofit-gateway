import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import { dbQuery } from './db';

/**
 * Structured Donor Email Data Contract
 */
export interface DonationEmailData {
  donorName: string;
  donorEmail: string;
  grossAmount: number;
  currency: string;
  paypalOrderId: string;
  paypalCaptureId?: string;
  donationDate: string;
  trustId: string;
  trustName: string;
  trustTagline?: string;
  managingTrustee?: string;
  bankName?: string;
  accountMasked?: string;
  ifsc?: string;
  purposeCode?: string;
  campaignUrl?: string;
}

/**
 * Result of Email Dispatch Attempt
 */
export interface EmailDispatchResult {
  success: boolean;
  provider: 'resend' | 'brevo' | 'sendgrid' | 'simulation';
  messageId?: string;
  error?: string;
  renderedHtml?: string;
}

/**
 * Social Sharing Link Generator
 * Generates pre-formatted, URL-encoded sharing URLs for WhatsApp, X (Twitter), LinkedIn, and Facebook
 */
export function generateSocialShareLinks(trustName: string, campaignUrl: string) {
  const cleanUrl = campaignUrl || 'https://your-domain.duckdns.org';
  const shareMessage = `I just made a charitable contribution to support ${trustName}! Join me in empowering community health, yoga seva, and wellness:`;
  
  const encodedText = encodeURIComponent(shareMessage);
  const encodedUrl = encodeURIComponent(cleanUrl);

  return {
    whatsapp: `https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    directLink: cleanUrl
  };
}

/**
 * Dynamic, High-Fidelity HTML Email Template
 * Mobile-responsive, cross-client compatible (Gmail, Apple Mail, Outlook), with traditional sacred motif
 */
export function renderDonationEmailHtml(data: DonationEmailData): string {
  const shareLinks = generateSocialShareLinks(data.trustName, data.campaignUrl || '');
  const estimatedInr = Math.round(data.grossAmount * 83.50).toLocaleString('en-IN');
  const formattedGross = data.grossAmount.toFixed(2);
  const purpose = data.purposeCode || 'P1301';
  const trusteeName = data.managingTrustee || 'Authorized Managing Trustee';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Donation Receipt & Confirmation - ${escapeHtml(data.trustName)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0b111e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; border-radius: 0 !important; }
      .mobile-stack { display: block !important; width: 100% !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 32px 12px; background-color: #0b111e;">

  <center>
    <!-- Outer Wrapper -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto;">
      
      <!-- Traditional Sacred Header -->
      <tr>
        <td align="center" style="padding: 24px 20px; background-color: #080c14; border-bottom: 3px solid #d97706; border-radius: 12px 12px 0 0;">
          <div style="color: #fbbf24; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px;">
            ॥ वसुधैव कुटुम्बकम् ॥ • OFFICIAL REMITTANCE CONFIRMATION
          </div>
          <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.01em;">
            ${escapeHtml(data.trustName)}
          </h1>
          <div style="color: #94a3b8; font-size: 13px;">
            ${escapeHtml(data.trustTagline || 'Regulated Non-Profit Foreign Contribution Gateway')}
          </div>
        </td>
      </tr>

      <!-- Main Body Card -->
      <tr>
        <td style="background-color: #ffffff; padding: 36px 28px; color: #1e293b;">
          
          <!-- Gratitude Banner -->
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
            <tr>
              <td align="center" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 20px 16px;">
                <div style="width: 44px; height: 44px; background-color: #10b981; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #ffffff; font-size: 22px; line-height: 44px; text-align: center; margin-bottom: 10px;">
                  ✓
                </div>
                <h2 style="color: #166534; font-size: 19px; font-weight: 700; margin: 0 0 6px;">
                  Heartfelt Gratitude for Your Seva, ${escapeHtml(data.donorName)}!
                </h2>
                <p style="color: #374151; font-size: 14px; margin: 0; line-height: 1.5;">
                  Your contribution of <strong style="color: #0284c7;">$${formattedGross} USD</strong> has been successfully verified and credited.
                </p>
              </td>
            </tr>
          </table>

          <!-- Personalized Note -->
          <p style="font-size: 14px; line-height: 1.65; color: #334155; margin-bottom: 20px;">
            Dear <strong>${escapeHtml(data.donorName)}</strong>,<br><br>
            On behalf of <strong>${escapeHtml(data.trustName)}</strong>, our trustees, and the communities served, we gratefully acknowledge your cross-border contribution. Your generosity directly powers our sacred seva initiatives—providing daily wholesome nutrition, free yoga and wellness camps, and rural healthcare outreach to those in need.
          </p>

          <!-- Official Receipt Details Table -->
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 28px; font-size: 13px;">
            <tr>
              <td colspan="2" style="background-color: #f1f5f9; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">
                🧾 Official Contribution Summary
              </td>
            </tr>
            <tr>
              <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Contribution Amount:</td>
              <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #0284c7; font-size: 15px;">
                $${formattedGross} USD <span style="font-size: 12px; color: #64748b; font-weight: 500;">(~₹${estimatedInr} INR)</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Date & Timestamp:</td>
              <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #1e293b; font-weight: 600;">
                ${escapeHtml(data.donationDate)}
              </td>
            </tr>
            <tr>
              <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b;">PayPal Reference:</td>
              <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; color: #334155;">
                ${escapeHtml(data.paypalCaptureId || data.paypalOrderId)}
              </td>
            </tr>
            <tr>
              <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Beneficiary Entity:</td>
              <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #0f172a; font-weight: 600;">
                ${escapeHtml(data.trustName)}
              </td>
            </tr>
            <tr>
              <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Designated Bank:</td>
              <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155;">
                ${escapeHtml(data.bankName || 'Designated National Bank')} (${escapeHtml(data.accountMasked || '...XXXX')})
              </td>
            </tr>
            <tr>
              <td style="padding: 11px 16px; color: #64748b;">RBI Regulatory Purpose Code:</td>
              <td style="padding: 11px 16px; text-align: right; font-weight: 700; color: #10b981;">
                ${escapeHtml(purpose)} (Charitable / Social Grants)
              </td>
            </tr>
          </table>

          <!-- Seva Pillars Reminder -->
          <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; padding: 16px; margin-bottom: 28px;">
            <div style="font-weight: 700; color: #b45309; font-size: 13px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em;">
              🪔 How Your Contribution Creates Impact
            </div>
            <ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 13px; line-height: 1.6;">
              <li><strong>Free Daily Yoga & Pranayama:</strong> Sustaining health and meditation programs for seekers.</li>
              <li><strong>Annadanam Seva:</strong> Distributing fresh, wholesome satvic meals daily to rural communities.</li>
              <li><strong>Rural Health Outreach:</strong> Supporting free Ayurvedic and holistic wellness camps.</li>
              <li><strong>Youth Values Education:</strong> Guiding the next generation in mindfulness and cultural wisdom.</li>
            </ul>
          </div>

          <!-- Social Sharing & Campaign Multiplier -->
          <div style="text-align: center; border-top: 1px solid #e2e8f0; padding-top: 24px; margin-bottom: 24px;">
            <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">
              🌟 Inspire Others to Support This Sacred Mission
            </div>
            <p style="font-size: 13px; color: #64748b; margin: 0 0 16px; line-height: 1.5;">
              Share your contribution with friends and family to multiply our community impact:
            </p>

            <!-- Social Buttons Grid -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <!-- WhatsApp -->
                      <td style="padding: 4px;">
                        <a href="${shareLinks.whatsapp}" target="_blank" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 9px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.02em;">
                          💬 WhatsApp
                        </a>
                      </td>
                      <!-- X / Twitter -->
                      <td style="padding: 4px;">
                        <a href="${shareLinks.twitter}" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 9px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.02em;">
                          𝕏 Share
                        </a>
                      </td>
                      <!-- LinkedIn -->
                      <td style="padding: 4px;">
                        <a href="${shareLinks.linkedin}" target="_blank" style="display: inline-block; background-color: #0077b5; color: #ffffff; text-decoration: none; padding: 9px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.02em;">
                          💼 LinkedIn
                        </a>
                      </td>
                      <!-- Direct Link -->
                      <td style="padding: 4px;">
                        <a href="${shareLinks.directLink}" target="_blank" style="display: inline-block; background-color: #d97706; color: #ffffff; text-decoration: none; padding: 9px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.02em;">
                          🌐 View Portal
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>

          <!-- Trustee Signature Block -->
          <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; font-size: 13px; color: #475569; line-height: 1.5;">
            With deep gratitude and blessings,<br>
            <strong style="color: #0f172a;">${escapeHtml(trusteeName)}</strong><br>
            Managing Trustee • ${escapeHtml(data.trustName)}
          </div>

        </td>
      </tr>

      <!-- Regulatory & Compliance Legal Footer -->
      <tr>
        <td style="background-color: #f1f5f9; padding: 20px 24px; border-radius: 0 0 12px 12px; font-size: 11px; color: #64748b; line-height: 1.6; text-align: center;">
          <p style="margin: 0 0 8px;">
            <strong>Statutory Compliance Disclaimer:</strong> This electronic receipt is an official acknowledgment of foreign inward remittance under Section 11 & 12 of the Indian Income Tax Act and applicable FCRA regulatory guidelines. No goods or commercial services were provided in whole or part consideration of this contribution.
          </p>
          <p style="margin: 0; color: #94a3b8;">
            Issued by ${escapeHtml(data.trustName)} | Central Institutional Ledger | ${escapeHtml(data.paypalOrderId)}
          </p>
        </td>
      </tr>

    </table>
  </center>

</body>
</html>`;
}

/**
 * Helper to escape HTML characters
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Universal Transactional Email Dispatcher
 * Automatically detects configured provider (Resend -> Brevo -> SendGrid -> Simulation)
 */
export async function sendDonationConfirmationEmail(
  data: DonationEmailData,
  correlationId?: string
): Promise<EmailDispatchResult> {
  const fromEmail = process.env.EMAIL_FROM || process.env.RESEND_FROM || 'donations@yourtrust.org';
  const fromName = data.trustName || 'Non-Profit Charitable Trust';
  const subject = `Tax Receipt & Confirmation: $${data.grossAmount.toFixed(2)} USD Donation to ${data.trustName}`;
  const htmlContent = renderDonationEmailHtml(data);

  // 1. Resend Provider (Recommended: 3,000 free emails/month via simple REST)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey && !resendApiKey.includes('your_')) {
    logger.info(`Dispatching donation email via Resend to ${data.donorEmail}`, { orderId: data.paypalOrderId, provider: 'resend' }, 'EMAIL_DISPATCH', correlationId);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [data.donorEmail],
          subject,
          html: htmlContent
        })
      });

      const responseBody = await res.json() as any;
      if (!res.ok) {
        throw new Error(`Resend API returned ${res.status}: ${JSON.stringify(responseBody)}`);
      }

      await logEmailDispatch(data, 'resend', 'SUCCESS', responseBody.id);
      logger.info(`Donation email successfully delivered via Resend`, { messageId: responseBody.id, orderId: data.paypalOrderId }, 'EMAIL_SUCCESS', correlationId);
      return { success: true, provider: 'resend', messageId: responseBody.id };
    } catch (err: any) {
      logger.error('Failed to send donation email via Resend', err, { orderId: data.paypalOrderId, donorEmail: data.donorEmail }, correlationId);
      await logEmailDispatch(data, 'resend', 'FAILURE', undefined, err.message);
      return { success: false, provider: 'resend', error: err.message };
    }
  }

  // 2. Brevo / Sendinblue Provider (300 free emails/day = 9,000/month via REST API)
  const brevoApiKey = process.env.BREVO_API_KEY;
  if (brevoApiKey && !brevoApiKey.includes('your_')) {
    logger.info(`Dispatching donation email via Brevo to ${data.donorEmail}`, { orderId: data.paypalOrderId, provider: 'brevo' }, 'EMAIL_DISPATCH', correlationId);
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: data.donorEmail, name: data.donorName }],
          subject,
          htmlContent
        })
      });

      const responseBody = await res.json() as any;
      if (!res.ok) {
        throw new Error(`Brevo API returned ${res.status}: ${JSON.stringify(responseBody)}`);
      }

      await logEmailDispatch(data, 'brevo', 'SUCCESS', responseBody.messageId);
      logger.info(`Donation email successfully delivered via Brevo`, { messageId: responseBody.messageId, orderId: data.paypalOrderId }, 'EMAIL_SUCCESS', correlationId);
      return { success: true, provider: 'brevo', messageId: responseBody.messageId };
    } catch (err: any) {
      logger.error('Failed to send donation email via Brevo', err, { orderId: data.paypalOrderId, donorEmail: data.donorEmail }, correlationId);
      await logEmailDispatch(data, 'brevo', 'FAILURE', undefined, err.message);
      return { success: false, provider: 'brevo', error: err.message };
    }
  }

  // 3. SendGrid Provider (100 free emails/day)
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  if (sendgridApiKey && !sendgridApiKey.includes('your_')) {
    logger.info(`Dispatching donation email via SendGrid to ${data.donorEmail}`, { orderId: data.paypalOrderId, provider: 'sendgrid' }, 'EMAIL_DISPATCH', correlationId);
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: data.donorEmail, name: data.donorName }] }],
          from: { email: fromEmail, name: fromName },
          subject,
          content: [{ type: 'text/html', value: htmlContent }]
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`SendGrid API returned ${res.status}: ${errText}`);
      }

      const msgId = `sg-${uuidv4()}`;
      await logEmailDispatch(data, 'sendgrid', 'SUCCESS', msgId);
      logger.info(`Donation email successfully delivered via SendGrid`, { messageId: msgId, orderId: data.paypalOrderId }, 'EMAIL_SUCCESS', correlationId);
      return { success: true, provider: 'sendgrid', messageId: msgId };
    } catch (err: any) {
      logger.error('Failed to send donation email via SendGrid', err, { orderId: data.paypalOrderId, donorEmail: data.donorEmail }, correlationId);
      await logEmailDispatch(data, 'sendgrid', 'FAILURE', undefined, err.message);
      return { success: false, provider: 'sendgrid', error: err.message };
    }
  }

  // 4. Development / Simulation Mode (When no 3rd-party API key is configured)
  const simMessageId = `SIM-MSG-${Date.now()}-${uuidv4().slice(0, 8)}`;
  const formattedGross = data.grossAmount.toFixed(2);
  
  logger.info(`[SIMULATION MODE] Generated donation confirmation email for ${data.donorEmail}`, {
    orderId: data.paypalOrderId,
    donor: data.donorName,
    amount: `$${formattedGross} USD`,
    trust: data.trustName,
    simulatedMessageId: simMessageId
  }, 'EMAIL_SIMULATION', correlationId);

  // In Debug Mode: Output detailed template preview and share URLs to logs
  if (process.env.LOG_LEVEL === 'DEBUG') {
    logger.debug('Email template dispatch debug payload', {
      subject,
      from: `${fromName} <${fromEmail}>`,
      to: data.donorEmail,
      socialShareUrls: generateSocialShareLinks(data.trustName, data.campaignUrl || ''),
      htmlLengthBytes: htmlContent.length
    }, correlationId);
  }

  await logEmailDispatch(data, 'simulation', 'SUCCESS', simMessageId);
  return {
    success: true,
    provider: 'simulation',
    messageId: simMessageId,
    renderedHtml: htmlContent
  };
}

/**
 * Record Email Dispatch Audit in Database
 */
async function logEmailDispatch(
  data: DonationEmailData,
  provider: string,
  status: string,
  messageId?: string,
  errorMessage?: string
): Promise<void> {
  try {
    await dbQuery(`
      INSERT INTO email_dispatch_logs (
        id, order_id, donor_email, provider, status, message_id, error_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      uuidv4(),
      data.paypalOrderId,
      data.donorEmail,
      provider,
      status,
      messageId || null,
      errorMessage || null
    ]);
  } catch (e: any) {
    logger.warn(`Could not record email dispatch audit log: ${e.message}`, { error: e.message }, 'EMAIL_AUDIT');
  }
}
