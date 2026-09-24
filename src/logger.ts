import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const MAX_LOG_AGE_DAYS = 7;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per file
const ACTIVE_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'INFO';
const SENSITIVE_KEYS = new Set([
  'password', 'clientsecret', 'client_secret', 'secret',
  'token', 'authorization', 'cookie', 'accesstoken', 'access_token'
]);

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  environment: string;
  correlationId?: string;
  action?: string;
  message: string;
  context?: Record<string, any>;
  error?: {
    name?: string;
    message: string;
    stack?: string;
  };
  client?: {
    ip?: string;
    method?: string;
    path?: string;
    statusCode?: number;
    durationMs?: number;
    userAgent?: string;
  };
}

/**
 * Sanitize sensitive data from context objects
 */
function sanitizeContext(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeContext);

  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      clean[key] = '[REDACTED]';
    } else if (lowerKey.includes('passport') || lowerKey.includes('id_number') || lowerKey.includes('tax_id')) {
      // Mask ID to last 4 chars for FCRA audit trail safety
      const strVal = String(val);
      clean[key] = strVal.length > 4 ? `***-***-${strVal.slice(-4)}` : '***';
    } else if (typeof val === 'object' && val !== null) {
      clean[key] = sanitizeContext(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * Prune log files older than 7 days or larger than 5 MB
 */
export function pruneOldLogs(): void {
  try {
    if (!fs.existsSync(LOGS_DIR)) return;

    const now = Date.now();
    const maxAgeMs = MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LOGS_DIR);

    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      const filePath = path.join(LOGS_DIR, file);
      const stat = fs.statSync(filePath);

      // Check age
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        continue;
      }

      // Check size
      if (stat.size > MAX_FILE_SIZE_BYTES) {
        const rotatedName = `${file}.${Date.now()}.bak`;
        fs.renameSync(filePath, path.join(LOGS_DIR, rotatedName));
      }
    }
  } catch (err: any) {
    process.stderr.write(`[LOGGER_WARNING] Failed to prune logs: ${err.message}\n`);
  }
}

/**
 * Core Structured Logger Engine
 */
class Logger {
  private serviceName: string;
  private environment: string;
  private externalWebhookUrl: string;

  constructor() {
    this.serviceName = 'paypal-fcra-engine';
    this.environment = process.env.NODE_ENV || 'development';
    this.externalWebhookUrl = process.env.EXTERNAL_LOG_WEBHOOK_URL || '';
    pruneOldLogs();
  }

  private writeEntry(entry: StructuredLogEntry): void {
    if (LOG_LEVEL_PRIORITY[entry.level] < LOG_LEVEL_PRIORITY[ACTIVE_LEVEL]) {
      return;
    }

    const jsonString = JSON.stringify(entry);
    const dateStr = new Date().toISOString().slice(0, 10);
    const appLogFile = path.join(LOGS_DIR, `app-${dateStr}.log`);
    const errorLogFile = path.join(LOGS_DIR, `error-${dateStr}.log`);

    // 1. Output to standard container streams (stdout/stderr for Render, Cloud Run, Docker)
    if (entry.level === 'ERROR' || entry.level === 'FATAL') {
      process.stderr.write(jsonString + '\n');
    } else {
      process.stdout.write(jsonString + '\n');
    }

    // 2. Append to rolling local log files (7-day retention)
    try {
      fs.appendFileSync(appLogFile, jsonString + '\n', 'utf8');
      if (entry.level === 'ERROR' || entry.level === 'FATAL') {
        fs.appendFileSync(errorLogFile, jsonString + '\n', 'utf8');
      }
    } catch {
      // Non-fatal if local write fails on read-only environments
    }

    // 3. Offload Critical Errors to Free External Tracker (Sentry / Logtail / Webhook)
    if ((entry.level === 'ERROR' || entry.level === 'FATAL') && this.externalWebhookUrl) {
      this.offloadToExternalTracker(entry);
    }
  }

  private async offloadToExternalTracker(entry: StructuredLogEntry): Promise<void> {
    try {
      const fetchModule = await import('node-fetch');
      const fetch = (fetchModule as any).default || fetchModule;
      await fetch(this.externalWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        timeout: 4000
      });
    } catch {
      // Gracefully silent; external logger should never bring down the primary engine
    }
  }

  public debug(message: string, context?: Record<string, any>, correlationId?: string): void {
    this.writeEntry({
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      service: this.serviceName,
      environment: this.environment,
      correlationId,
      message,
      context: sanitizeContext(context)
    });
  }

  public info(message: string, context?: Record<string, any>, action?: string, correlationId?: string): void {
    this.writeEntry({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: this.serviceName,
      environment: this.environment,
      correlationId,
      action,
      message,
      context: sanitizeContext(context)
    });
  }

  public warn(message: string, context?: Record<string, any>, action?: string, correlationId?: string): void {
    this.writeEntry({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      service: this.serviceName,
      environment: this.environment,
      correlationId,
      action,
      message,
      context: sanitizeContext(context)
    });
  }

  public error(message: string, err?: any, context?: Record<string, any>, correlationId?: string): void {
    const errorDetails = err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : err ? { message: String(err) } : undefined;

    this.writeEntry({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      service: this.serviceName,
      environment: this.environment,
      correlationId,
      message,
      error: errorDetails,
      context: sanitizeContext(context)
    });
  }

  public fatal(message: string, err?: any, context?: Record<string, any>, correlationId?: string): void {
    const errorDetails = err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : err ? { message: String(err) } : undefined;

    this.writeEntry({
      timestamp: new Date().toISOString(),
      level: 'FATAL',
      service: this.serviceName,
      environment: this.environment,
      correlationId,
      message,
      error: errorDetails,
      context: sanitizeContext(context)
    });
  }
}

export const logger = new Logger();

/**
 * Express Request Tracing & Correlation Middleware
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Generate or forward correlation ID
  const correlationId = (req.headers['x-correlation-id'] as string) || `req-${crypto.randomBytes(4).toString('hex')}`;
  (req as any).correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  const start = Date.now();
  const clientIp = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '').split(',')[0].trim();
  const anonymizedIp = clientIp.includes('.')
    ? clientIp.split('.').slice(0, 2).join('.') + '.***.***'
    : 'masked';

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const isError = res.statusCode >= 400;

    const msg = `HTTP ${req.method} ${req.originalUrl || req.url} - ${res.statusCode} (${durationMs}ms)`;
    const ctx = { durationMs, statusCode: res.statusCode };
    const action = `HTTP_${req.method}`;

    if (res.statusCode >= 500) {
      logger.error(msg, undefined, ctx, correlationId);
    } else if (res.statusCode >= 400) {
      logger.warn(msg, ctx, action, correlationId);
    } else {
      logger.info(msg, ctx, action, correlationId);
    }
  });

  next();
}
