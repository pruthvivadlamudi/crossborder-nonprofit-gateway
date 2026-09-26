const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

// Ensure Git binary path is discoverable on Windows even if missing from process PATH
function resolveGitBinary() {
  const candidates = [
    'git',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'cmd', 'git.exe'),
    path.join(process.env.ProgramFiles || '', 'Git', 'cmd', 'git.exe')
  ];

  for (const candidate of candidates) {
    try {
      const res = spawnSync(candidate, ['--version'], { encoding: 'utf8', shell: false });
      if (res.status === 0 && res.stdout) {
        // Prepend git folder to process.env.PATH so sub-processes inherit it
        const dir = path.dirname(candidate);
        if (candidate !== 'git' && !process.env.PATH.includes(dir)) {
          process.env.PATH = `${dir};${process.env.PATH}`;
        }
        return candidate;
      }
    } catch (_) {
      // Continue to next candidate
    }
  }

  return 'git';
}

const GIT_BIN = resolveGitBinary();

function runGit(args, opts = {}) {
  const result = spawnSync(GIT_BIN, args, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    shell: false,
    ...opts
  });

  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim()
  };
}

function getStatus() {
  const res = runGit(['status', '--porcelain']);
  if (res.status !== 0) {
    throw new Error(`Git status failed: ${res.stderr}`);
  }
  const lines = res.stdout ? res.stdout.split('\n').filter(Boolean) : [];
  return {
    isClean: lines.length === 0,
    changedFiles: lines
  };
}

function stageAll() {
  const res = runGit(['add', '-A']);
  if (res.status !== 0) {
    throw new Error(`Git add failed: ${res.stderr}`);
  }
}

function commit(message) {
  const res = runGit(['commit', '-m', message]);
  if (res.status !== 0) {
    throw new Error(`Git commit failed: ${res.stderr}`);
  }
  return res.stdout;
}

function push(remote = 'origin', branch = 'main') {
  const res = runGit(['push', remote, branch]);
  if (res.status !== 0) {
    throw new Error(`Git push failed: ${res.stderr}`);
  }
  return res.stdout || res.stderr;
}

function triggerDeployHook() {
  const hookUrl = process.env.RENDER_DEPLOY_HOOK_URL;
  if (!hookUrl) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(hookUrl);
      const req = https.request(parsedUrl, { method: 'POST' }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      });
      req.on('error', (err) => reject(err));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = {
  GIT_BIN,
  runGit,
  getStatus,
  stageAll,
  commit,
  push,
  triggerDeployHook
};
