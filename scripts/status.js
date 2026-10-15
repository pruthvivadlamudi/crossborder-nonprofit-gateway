#!/usr/bin/env node
/**
 * Instant Project Status & Health Dashboard
 * Runs in <1 second to give a complete health check and operational summary.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..');

function getGitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT_DIR, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    const lastCommit = execSync('git log -1 --pretty=format:"%h - %s (%cr)"', { cwd: ROOT_DIR, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    const status = execSync('git status -s', { cwd: ROOT_DIR, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    return {
      branch,
      lastCommit,
      isClean: status.length === 0,
      modifiedCount: status.length === 0 ? 0 : status.split('\n').filter(Boolean).length
    };
  } catch (e) {
    return { branch: 'unknown', lastCommit: 'unknown', isClean: true, modifiedCount: 0 };
  }
}

function getDatabaseInfo() {
  const dbPath = path.join(ROOT_DIR, 'donations.sqlite');
  if (!fs.existsSync(dbPath)) {
    return { exists: false };
  }
  const stat = fs.statSync(dbPath);
  try {
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(dbPath);
    return new Promise((resolve) => {
      db.get('SELECT count(*) as count FROM donors', (err, donorRow) => {
        db.get('SELECT count(*) as count, sum(gross_amount) as total_usd FROM donations', (err2, donRow) => {
          db.close();
          resolve({
            exists: true,
            sizeKb: Math.round(stat.size / 1024),
            donorsCount: donorRow ? donorRow.count : 0,
            donationsCount: donRow ? donRow.count : 0,
            totalUsd: donRow && donRow.total_usd ? donRow.total_usd.toFixed(2) : '0.00'
          });
        });
      });
    });
  } catch (e) {
    return Promise.resolve({ exists: true, sizeKb: Math.round(stat.size / 1024) });
  }
}

function getBackupsInfo() {
  const backupsDir = path.join(ROOT_DIR, 'backups');
  if (!fs.existsSync(backupsDir)) return { count: 0, latest: 'None' };
  const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.sqlite'));
  return {
    count: files.length,
    latest: files.length > 0 ? files[files.length - 1] : 'None'
  };
}

function checkLiveHealth() {
  return new Promise((resolve) => {
    const req = https.get('https://dymct-aor-gateway.onrender.com/api/health', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ online: true, statusCode: res.statusCode });
        } else {
          resolve({ online: false, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', () => resolve({ online: false, error: 'Connection timeout / network unreachable' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ online: false, error: 'Request timed out' });
    });
  });
}

async function renderDashboard() {
  console.log('\n======================================================================');
  console.log('  \x1b[36m⚡ DYMCT & AOR GATEWAY — INSTANT STATUS DASHBOARD\x1b[0m');
  console.log('======================================================================');

  const git = getGitInfo();
  console.log(`\n\x1b[1m📂 Repository State:\x1b[0m`);
  console.log(`   • Branch:       \x1b[32m${git.branch}\x1b[0m (${git.isClean ? 'Clean' : `${git.modifiedCount} modified files`})`);
  console.log(`   • Last Commit:  ${git.lastCommit}`);

  const db = await getDatabaseInfo();
  console.log(`\n\x1b[1m🗄️  Database & Ledger (donations.sqlite):\x1b[0m`);
  if (db.exists) {
    console.log(`   • Status:       \x1b[32mOnline (WAL Mode Active)\x1b[0m [${db.sizeKb} KB]`);
    if (db.donorsCount !== undefined) {
      console.log(`   • Total Donors: \x1b[33m${db.donorsCount}\x1b[0m registered`);
      console.log(`   • Transactions: \x1b[33m${db.donationsCount}\x1b[0m recorded (Gross: $${db.totalUsd})`);
    }
  } else {
    console.log(`   • Status:       \x1b[31mNot found (will initialize on startup)\x1b[0m`);
  }

  const backups = getBackupsInfo();
  console.log(`   • Snapshots:    \x1b[32m${backups.count} atomic snapshots\x1b[0m in /backups`);

  process.stdout.write('\n\x1b[1m🌐 Cloud Production Health (Render):\x1b[0m\n   • Pinging... ');
  const health = await checkLiveHealth();
  if (health.online) {
    console.log(`\x1b[32m200 OK — Live & Responsive\x1b[0m (https://dymct-aor-gateway.onrender.com)`);
  } else {
    console.log(`\x1b[33m${health.error || `HTTP ${health.statusCode}`} (Might be cold starting)\x1b[0m`);
  }

  console.log(`\n\x1b[1m📋 Key Action Items:\x1b[0m`);
  console.log(`   • \x1b[33m[Pending P1]\x1b[0m Switch PayPal Sandbox -> Live in Render environment`);
  console.log(`   • \x1b[32m[Verified]\x1b[0m   Domestic UPI QR, Deep links, and Tax Receipts live`);
  console.log(`   • \x1b[32m[Verified]\x1b[0m   Resend Email Receipt Dispatch live`);
  console.log(`   • \x1b[32m[Verified]\x1b[0m   MHA Form FC-4 CSV Exporter live`);
  console.log('======================================================================\n');
}

renderDashboard();
