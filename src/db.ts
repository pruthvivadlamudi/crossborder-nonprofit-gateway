import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Pool } from 'pg';
import sqlite3 from 'sqlite3';
import { open, Database as SqliteDB } from 'sqlite';
import dotenv from 'dotenv';
import { logger } from './logger';

dotenv.config();

let pgPool: Pool | null = null;
let sqliteDb: SqliteDB | null = null;
let isPostgres = false;
let dbFilePath = '';

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
const LEDGER_MIRROR_FILE = path.join(BACKUPS_DIR, 'donations_ledger_mirror.jsonl');

// Ensure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

/**
 * Initialize Database Connection
 * Auto-detects PostgreSQL vs Local SQLite fallback with redundancy
 */
export async function initDatabase(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl && dbUrl.startsWith('postgres')) {
    try {
      pgPool = new Pool({
        connectionString: dbUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      const client = await pgPool.connect();
      client.release();
      isPostgres = true;
      logger.info('Connected to PostgreSQL database.', undefined, 'DB_INIT');
      return;
    } catch (err: any) {
      logger.warn(`PostgreSQL connection failed (${err.message}). Falling back to local embedded SQLite.`, { error: err.message }, 'DB_FALLBACK');
      pgPool = null;
    }
  }

  // SQLite Fallback with Redundancy & Crash Protection
  dbFilePath = path.join(__dirname, '..', 'donations.sqlite');
  sqliteDb = await open({
    filename: dbFilePath,
    driver: sqlite3.Database
  });

  // Enable WAL Mode (Write-Ahead Logging) for high concurrency and crash durability
  await sqliteDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);

  // Create SQLite Schema with exact same tables & fields
  await sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS donors (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      nationality TEXT NOT NULL,
      is_nri INTEGER NOT NULL DEFAULT 0,
      passport_or_id_number TEXT,
      country_of_residence TEXT NOT NULL,
      residential_address TEXT NOT NULL,
      phone_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS donations (
      id TEXT PRIMARY KEY,
      donor_id TEXT NOT NULL,
      trust_id TEXT NOT NULL DEFAULT 'divya',
      trust_name TEXT NOT NULL DEFAULT 'Primary Non-Profit Trust',
      paypal_order_id TEXT UNIQUE NOT NULL,
      paypal_capture_id TEXT UNIQUE,
      idempotency_key TEXT UNIQUE NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      gross_amount REAL NOT NULL,
      paypal_fee REAL DEFAULT 0.00,
      net_amount REAL,
      status TEXT NOT NULL DEFAULT 'CREATED',
      fcra_purpose TEXT NOT NULL DEFAULT 'SOCIAL',
      fcra_financial_year TEXT NOT NULL DEFAULT '2026-2027',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(donor_id) REFERENCES donors(id)
    );

    CREATE TABLE IF NOT EXISTS webhook_logs (
      id TEXT PRIMARY KEY,
      event_id TEXT UNIQUE NOT NULL,
      event_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      processed_status TEXT NOT NULL DEFAULT 'PENDING',
      error_message TEXT,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS backup_logs (
      id TEXT PRIMARY KEY,
      backup_filename TEXT NOT NULL,
      backup_size_bytes INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_dispatch_logs (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      donor_email TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      message_id TEXT,
      error_details TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure receipt_email_sent and UPI columns exist on donations
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(`ALTER TABLE donations ADD COLUMN IF NOT EXISTS receipt_email_sent INTEGER DEFAULT 0;`);
      await pgPool.query(`ALTER TABLE donations ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'PAYPAL';`);
      await pgPool.query(`ALTER TABLE donations ADD COLUMN IF NOT EXISTS upi_vpa TEXT;`);
      await pgPool.query(`ALTER TABLE donations ADD COLUMN IF NOT EXISTS upi_ref TEXT;`);
    } else if (sqliteDb) {
      const colCheck = await sqliteDb.all(`PRAGMA table_info(donations);`);
      const hasCol = colCheck.some((c: any) => c.name === 'receipt_email_sent');
      if (!hasCol) {
        await sqliteDb.run(`ALTER TABLE donations ADD COLUMN receipt_email_sent INTEGER DEFAULT 0;`);
      }
      const hasPaymentMethod = colCheck.some((c: any) => c.name === 'payment_method');
      if (!hasPaymentMethod) {
        await sqliteDb.run(`ALTER TABLE donations ADD COLUMN payment_method TEXT DEFAULT 'PAYPAL';`);
      }
      const hasUpiVpa = colCheck.some((c: any) => c.name === 'upi_vpa');
      if (!hasUpiVpa) {
        await sqliteDb.run(`ALTER TABLE donations ADD COLUMN upi_vpa TEXT;`);
      }
      const hasUpiRef = colCheck.some((c: any) => c.name === 'upi_ref');
      if (!hasUpiRef) {
        await sqliteDb.run(`ALTER TABLE donations ADD COLUMN upi_ref TEXT;`);
      }
    }
  } catch (err: any) {
    // Non-fatal if columns exist
  }

  logger.info(`Embedded local database online at: ${dbFilePath} [WAL Mode Active]`, { dbFilePath, journalMode: 'WAL' }, 'DB_INIT');

  // Automatically create a startup backup snapshot
  try {
    await createDatabaseSnapshot('STARTUP');
  } catch (err: any) {
    logger.warn(`Initial backup warning: ${err.message}`, { error: err.message }, 'DB_SNAPSHOT');
  }
}

/**
 * Unified Query Wrapper
 * Handles both PostgreSQL ($1, $2) and SQLite syntax
 */
export async function dbQuery(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
  if (isPostgres && pgPool) {
    const result = await pgPool.query(sql, params);
    return { rows: result.rows };
  }

  if (sqliteDb) {
    // Convert PostgreSQL style parameters $1, $2 to SQLite ?
    let sqliteSql = sql.replace(/\$(\d+)/g, '?');

    // Replace NOW() with CURRENT_TIMESTAMP for SQLite compatibility
    sqliteSql = sqliteSql.replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP');

    if (sqliteSql.trim().toUpperCase().startsWith('SELECT')) {
      const rows = await sqliteDb.all(sqliteSql, params);
      return { rows: rows || [] };
    } else {
      const result = await sqliteDb.run(sqliteSql, params);
      return { rows: [{ id: result.lastID }] };
    }
  }

  throw new Error('Database not initialized.');
}

/**
 * Append-Only Immutable Mirror Ledger
 * Records transaction events to an append-only JSONL file with SHA256 integrity hash
 */
export function recordLedgerMirrorEvent(
  eventType: 'DONOR' | 'DONATION' | 'CAPTURE' | 'EMAIL_SENT' | 'UPI_INITIATE' | 'UPI_SUCCESS',
  payload: any
): void {
  try {
    const timestamp = new Date().toISOString();
    const eventString = JSON.stringify({ eventType, timestamp, payload });
    const hash = crypto.createHash('sha256').update(eventString).digest('hex');
    const line = JSON.stringify({ eventType, timestamp, hash, payload }) + '\n';
    fs.appendFileSync(LEDGER_MIRROR_FILE, line, 'utf8');
  } catch (err: any) {
    logger.error('Failed to append to ledger mirror', err, { eventType, error: err.message });
  }
}

/**
 * Database Snapshot / Backup Engine
 * Creates an atomic backup file and prunes old backups to retain the last 15
 */
export async function createDatabaseSnapshot(reason: string = 'MANUAL'): Promise<{ filename: string; size: number }> {
  if (isPostgres) {
    return { filename: 'postgres-managed', size: 0 };
  }

  if (!sqliteDb || !dbFilePath || !fs.existsSync(dbFilePath)) {
    throw new Error('SQLite database is not accessible for snapshot.');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `donations_backup_${timestamp}_${reason}.sqlite`;
  const backupFilePath = path.join(BACKUPS_DIR, backupFileName);

  try {
    // SQLite VACUUM INTO provides an atomic, consistent hot backup while running in WAL mode
    await sqliteDb.run(`VACUUM INTO ?`, [backupFilePath]);
  } catch (vacuumErr) {
    // Fallback to copy if VACUUM INTO is not supported in environment
    fs.copyFileSync(dbFilePath, backupFilePath);
  }

  const stat = fs.statSync(backupFilePath);

  // Log backup to database
  try {
    const backupId = crypto.randomUUID();
    await sqliteDb.run(
      `INSERT INTO backup_logs (id, backup_filename, backup_size_bytes) VALUES (?, ?, ?)`,
      [backupId, backupFileName, stat.size]
    );
  } catch {
    // Non-fatal if backup log table write fails
  }

  // Prune older backups to keep the most recent 15
  pruneOldBackups();

  return { filename: backupFileName, size: stat.size };
}

/**
 * Prune backups keeping the newest 15 files
 */
function pruneOldBackups(): void {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('donations_backup_') && f.endsWith('.sqlite'))
      .map(f => ({
        name: f,
        path: path.join(BACKUPS_DIR, f),
        time: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 15) {
      const toDelete = files.slice(15);
      for (const item of toDelete) {
        fs.unlinkSync(item.path);
      }
    }
  } catch (err: any) {
    logger.warn(`Pruning backups warning: ${err.message}`, { error: err.message }, 'DB_PRUNE');
  }
}

/**
 * Retrieve Database Redundancy & Backup Telemetry
 */
export async function getDatabaseStatus(): Promise<any> {
  const isPg = isPostgres;
  let fileSize = 0;
  let walSize = 0;
  let backupFiles: any[] = [];
  let mirrorEntriesCount = 0;

  if (!isPg && dbFilePath && fs.existsSync(dbFilePath)) {
    fileSize = fs.statSync(dbFilePath).size;
    const walFile = `${dbFilePath}-wal`;
    if (fs.existsSync(walFile)) {
      walSize = fs.statSync(walFile).size;
    }

    if (fs.existsSync(BACKUPS_DIR)) {
      backupFiles = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.startsWith('donations_backup_') && f.endsWith('.sqlite'))
        .map(f => {
          const s = fs.statSync(path.join(BACKUPS_DIR, f));
          return {
            filename: f,
            sizeBytes: s.size,
            sizeFormatted: (s.size / 1024).toFixed(1) + ' KB',
            createdAt: s.mtime
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    if (fs.existsSync(LEDGER_MIRROR_FILE)) {
      const content = fs.readFileSync(LEDGER_MIRROR_FILE, 'utf8');
      mirrorEntriesCount = content.split('\n').filter(Boolean).length;
    }
  }

  return {
    engine: isPg ? 'PostgreSQL' : 'SQLite (Embedded with WAL & Hot Redundancy)',
    isPostgres: isPg,
    journalMode: isPg ? 'N/A' : 'WAL (Write-Ahead Logging)',
    synchronous: isPg ? 'N/A' : 'NORMAL',
    primaryDbBytes: fileSize,
    primaryDbFormatted: (fileSize / 1024).toFixed(1) + ' KB',
    walBytes: walSize,
    backupsDirectory: BACKUPS_DIR,
    totalSnapshots: backupFiles.length,
    latestSnapshot: backupFiles[0] || null,
    recentSnapshots: backupFiles.slice(0, 5),
    ledgerMirror: {
      active: true,
      file: LEDGER_MIRROR_FILE,
      entryCount: mirrorEntriesCount
    }
  };
}

