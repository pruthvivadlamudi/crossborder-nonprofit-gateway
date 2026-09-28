const { spawnSync } = require('child_process');
const path = require('path');
const { getStatus, stageAll, commit, push, triggerDeployHook } = require('./git-util');

async function deploy() {
  console.log('\n========================================================');
  console.log('  Render Real-Time Deploy Engine');
  console.log('  Divya Yoga Mandali & The Art Of Relaxation Gateway');
  console.log('========================================================\n');

  try {
    const status = getStatus();
    const args = process.argv.slice(2);
    const customMessage = args.join(' ').trim();

    if (status.isClean) {
      console.log('ℹ️  Working tree is clean. No local modifications detected.');
      
      // If user passed a deploy hook or wants to re-trigger
      console.log('Checking if Render Deploy Hook is available for manual trigger...');
      const hookRes = await triggerDeployHook();
      if (hookRes) {
        console.log(`✅ Render Deploy Hook triggered (Status ${hookRes.statusCode})`);
        console.log('🌐 Deployment running live at: https://dymct-aor-gateway.onrender.com');
      } else {
        console.log('ℹ️  No changes to push. To make changes, edit files in src/ and re-run.');
      }
      return;
    }

    console.log(`📂 Detected changes in ${status.changedFiles.length} file(s):`);
    status.changedFiles.slice(0, 8).forEach(f => console.log(`   ${f}`));
    if (status.changedFiles.length > 8) {
      console.log(`   ...and ${status.changedFiles.length - 8} more file(s)`);
    }

    const isWin = process.platform === 'win32';

    // 1. Secret & PII Leak Scanner
    console.log('\n🔒 [1/4] Running Deep Secret & PII Exposure Scan...');
    const scanResult = spawnSync(isWin ? 'cmd.exe' : 'npm', isWin ? ['/c', 'npm', 'run', 'scan:secrets'] : ['run', 'scan:secrets'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit'
    });

    if (scanResult.status !== 0) {
      console.error('\n❌ Secret or sensitive PII detected! Aborting deploy to prevent exposure.');
      process.exit(1);
    }
    console.log('✅ Zero leaked secrets detected.');

    // 2. Automated Test Suite Verification
    console.log('\n🧪 [2/4] Executing Jest Unit & Integration Test Suite...');
    const testResult = spawnSync(isWin ? 'cmd.exe' : 'npm', isWin ? ['/c', 'npm', 'test'] : ['test'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit'
    });

    if (testResult.status !== 0) {
      console.error('\n❌ Test suite failed! Aborting deploy to prevent regression.');
      process.exit(1);
    }
    console.log('✅ All tests passed cleanly.');

    // 3. Build Verification
    console.log('\n🔨 [3/4] Verifying TypeScript build & asset compilation...');
    const buildResult = spawnSync(isWin ? 'cmd.exe' : 'npm', isWin ? ['/c', 'npm', 'run', 'build'] : ['run', 'build'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit'
    });

    if (buildResult.status !== 0) {
      console.error('\n❌ Build failed! Aborting deploy to protect production service.');
      process.exit(1);
    }
    console.log('✅ Build verification passed.');

    // 4. Stage & Commit
    console.log('\n📦 [4/4] Staging, committing and pushing changes...');
    stageAll();
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const commitMsg = customMessage || `deploy: real-time update [${timestamp}]`;
    const commitOutput = commit(commitMsg);
    console.log(`✅ Committed: "${commitMsg}"`);

    // 3. Push to GitHub
    console.log('\n🚀 [3/3] Pushing to origin/main (Render Auto-Deploy trigger)...');
    push('origin', 'main');
    console.log('✅ Successfully pushed to GitHub main branch!');

    // 4. Trigger Deploy Hook if configured
    const hookRes = await triggerDeployHook();
    if (hookRes) {
      console.log(`✅ Render Deploy Hook called (Status ${hookRes.statusCode})`);
    }

    console.log('\n========================================================');
    console.log('🎉 DEPLOY TRIGGERED SUCCESSFULLY!');
    console.log('Render is now pulling your latest commit and building live.');
    console.log('Track deployment & test live:');
    console.log('  Live App:     https://dymct-aor-gateway.onrender.com');
    console.log('  Admin Portal: https://dymct-aor-gateway.onrender.com/admin');
    console.log('  Dashboard:    https://dashboard.render.com');
    console.log('========================================================\n');

  } catch (err) {
    console.error('\n❌ Deployment failed:', err.message);
    process.exit(1);
  }
}

deploy();
