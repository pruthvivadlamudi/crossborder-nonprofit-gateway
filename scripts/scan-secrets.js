#!/usr/bin/env node
/**
 * ============================================================================
 * DYMCT & AOR Non-Profit Gateway - Secret & PII Exposure Scanner
 * ============================================================================
 * Industry-standard security scanner designed to inspect the codebase
 * and prevent accidental leakage of API keys, private keys, database credentials,
 * and unencrypted donor PII before git commits or production deployments.
 *
 * Exits with code 1 if any high-risk pattern or secret signature is identified.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// Directories and files excluded from scanning
const IGNORED_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.system_generated',
  'logs',
  'package-lock.json',
  '.env.example'
];

// Patterns representing critical secrets or credentials
const HIGH_RISK_SIGNATURES = [
  {
    name: 'Private Cryptographic Key',
    regex: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH|PGP|ENCRYPTED)?\s*PRIVATE KEY-----/i
  },
  {
    name: 'Active Resend API Key',
    regex: /\bre_[a-zA-Z0-9_-]{24,}\b/
  },
  {
    name: 'AWS Access Key ID',
    regex: /\b(AKIA|ABIA|ACCA)[0-9A-Z]{16}\b/
  },
  {
    name: 'Google Cloud / Firebase API Key',
    regex: /\bAIza[0-9A-Za-z\\-_]{35}\b/
  },
  {
    name: 'Hardcoded Database Password in URI',
    regex: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]{8,}@[^:\s]+/i
  },
  {
    name: 'GitHub Personal Access Token',
    regex: /\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b/
  },
  {
    name: 'Plaintext Credit Card Number',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/
  }
];

let totalFilesScanned = 0;
let findings = [];

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(ROOT_DIR, fullPath);

    // Skip ignored directories
    if (IGNORED_PATHS.some(ignored => relPath === ignored || relPath.startsWith(ignored + path.sep))) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      // Scan text files only
      const ext = path.extname(entry.name).toLowerCase();
      if (['.ts', '.js', '.json', '.html', '.css', '.md', '.env', '.yaml', '.yml'].includes(ext)) {
        // Skip scanning the scanner itself and unit tests containing test mock patterns
        if (relPath === path.join('scripts', 'scan-secrets.js') || relPath.startsWith('tests')) {
          continue;
        }
        scanFile(fullPath, relPath);
      }
    }
  }
}

function scanFile(filePath, relPath) {
  totalFilesScanned++;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const sig of HIGH_RISK_SIGNATURES) {
        if (sig.regex.test(line)) {
          findings.push({
            file: relPath,
            line: i + 1,
            rule: sig.name,
            snippet: line.trim().slice(0, 100)
          });
        }
      }
    }
  } catch (err) {
    // Non-UTF8 or unreadable file
  }
}

console.log('\n🔍 [SECURITY AUDIT] Starting Deep Secret & PII Exposure Scan...');
scanDirectory(ROOT_DIR);

console.log(`📊 Scanned ${totalFilesScanned} repository files.`);

if (findings.length > 0) {
  console.error(`\n❌ [SECURITY BREACH ALERT] Found ${findings.length} potential secrets or unredacted credentials:\n`);
  findings.forEach((finding, idx) => {
    console.error(`  ${idx + 1}. [${finding.rule}] in ${finding.file}:${finding.line}`);
    console.error(`     Snippet: ${finding.snippet}`);
  });
  console.error('\n🚫 Commit or deployment halted. Remove or mask all sensitive tokens before proceeding.\n');
  process.exit(1);
} else {
  console.log('✅ [PASSED] Zero leaked secrets, raw private keys, or exposed credentials detected in repository.\n');
  process.exit(0);
}
