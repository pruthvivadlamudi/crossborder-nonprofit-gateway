const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getStatus, stageAll, commit, push, triggerDeployHook } = require('./git-util');

const WATCH_DIR = path.resolve(__dirname, '..', 'src');
const DEBOUNCE_MS = 3500; // Wait 3.5s after last file change before deploying

let debounceTimer = null;
let isDeploying = false;
let pendingChanges = new Set();

console.log('\n========================================================');
console.log('  Render Real-Time Live Watch Engine');
console.log('  Auto-Deploy Active: Listening for local changes...');
console.log('========================================================');
console.log(`📁 Watching directory: ${WATCH_DIR}`);
console.log(`⏱️  Debounce interval:  ${DEBOUNCE_MS / 1000}s`);
console.log('⚡ Any file save will automatically test, commit & push to Render!');
console.log('Press Ctrl + C anytime to stop watching.\n');

async function triggerAutoDeploy() {
  if (isDeploying) {
    console.log('⏳ Deploy already in progress, queuing pending changes...');
    return;
  }

  isDeploying = true;
  const changedList = Array.from(pendingChanges);
  pendingChanges.clear();

  try {
    const status = getStatus();
    if (status.isClean) {
      console.log('ℹ️  Working tree is clean. Skipping push.');
      isDeploying = false;
      return;
    }

    console.log(`\n--------------------------------------------------------`);
    console.log(`⚡ [${new Date().toLocaleTimeString()}] Real-time change detected!`);
    console.log(`📂 Modified files: ${changedList.slice(0, 5).join(', ')}${changedList.length > 5 ? '...' : ''}`);

    // 1. Verify build
    console.log('🔨 Testing build compilation...');
    const isWin = process.platform === 'win32';
    const build = spawnSync(isWin ? 'cmd.exe' : 'npm', isWin ? ['/c', 'npm', 'run', 'build'] : ['run', 'build'], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8'
    });

    if (build.status !== 0) {
      console.error('\n❌ Build compilation failed! Push skipped to protect live service.');
      console.error(build.stderr || build.stdout);
      console.log('Fix the code error and save to retry automatically.\n');
      isDeploying = false;
      return;
    }
    console.log('✅ Build compilation passed.');

    // 2. Stage and commit
    console.log('📦 Staging changes...');
    stageAll();
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const summary = changedList.slice(0, 2).map(f => path.basename(f)).join(', ');
    const msg = `auto: real-time sync [${summary || 'updates'}] at ${timestamp}`;
    commit(msg);
    console.log(`✅ Committed: "${msg}"`);

    // 3. Push to GitHub
    console.log('🚀 Pushing to origin/main -> Triggering Render auto-deploy...');
    push('origin', 'main');
    console.log('✅ Successfully pushed to GitHub main branch!');

    // 4. Deploy Hook ping if available
    const hookRes = await triggerDeployHook();
    if (hookRes) {
      console.log(`✅ Render Deploy Hook pinged (Status ${hookRes.statusCode})`);
    }

    console.log('🌐 Render is deploying live: https://dymct-aor-gateway.onrender.com');
    console.log(`--------------------------------------------------------\n`);
    console.log('👀 Resuming live watch for changes in src/ ...\n');

  } catch (err) {
    console.error('❌ Auto-deploy error:', err.message);
  } finally {
    isDeploying = false;
    // If files changed while deploying, schedule next run
    if (pendingChanges.size > 0) {
      scheduleDeploy();
    }
  }
}

function scheduleDeploy() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    triggerAutoDeploy();
  }, DEBOUNCE_MS);
}

// Start recursive file watch
try {
  fs.watch(WATCH_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    // Ignore temporary files, lock files, and hidden files
    if (filename.includes('~') || filename.startsWith('.') || filename.endsWith('.tmp')) {
      return;
    }

    pendingChanges.add(filename);
    console.log(`📝 [${new Date().toLocaleTimeString()}] Saved: src/${filename} (syncing in ${DEBOUNCE_MS / 1000}s)`);
    scheduleDeploy();
  });
} catch (err) {
  console.error('Failed to start file watcher:', err.message);
  process.exit(1);
}

// Handle clean shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Live watcher stopped. Have a great day!\n');
  process.exit(0);
});
