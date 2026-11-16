const { spawnSync } = require('child_process');
const path = require('path');

if (!process.env.DB_FILE || !process.env.API_URL) {
  console.error('Refusing to run: set DB_FILE and API_URL first (isolated test setup).');
  process.exit(2);
}

const root = path.join(__dirname, '..');
const suites = [
  'scripts/validate-knowledge.js',
  'test-api.js',
  'test-bookings.js',
  'test-stage3.js',
  'test-reports.js',
  'test-payments.js',
  'test-checkins.js',
  'test-referrals.js',
  'test-knowledge.js',
  'test-knowledge-stage1.js',
  'test-knowledge-stage1b.js',
  'test-knowledge-stage2b.js',
  'test-knowledge-stage2c.js',
  'test-roles.js',
  'test-staff.js',
  'test-manager.js',
];

let totalPassed = 0;
let totalFailed = 0;
const summary = [];

for (const file of suites) {
  const res = spawnSync(process.execPath, [file], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = (res.stdout || '') + (res.stderr || '');
  process.stdout.write(out);

  const matches = [...out.matchAll(/(\d+) passed, (\d+) failed/g)];
  const last = matches.length ? matches[matches.length - 1] : null;
  const libuvExit = /UV_HANDLE_CLOSING/.test(out);
  const exitOk = res.status === 0 || libuvExit;

  if (!last) {
    summary.push(`FAIL  ${file}: no result line found (exit ${res.status})`);
    totalFailed += 1;
    break;
  }
  const passed = Number(last[1]);
  const failed = Number(last[2]);
  totalPassed += passed;
  totalFailed += failed;
  const ok = failed === 0 && exitOk;
  summary.push(`${ok ? 'ok  ' : 'FAIL'}  ${file}: ${passed} passed, ${failed} failed${res.status !== 0 && libuvExit ? ' (libuv exit quirk ignored)' : ''}`);
  if (!ok) {
    if (failed === 0) totalFailed += 1;
    break;
  }
}

console.log('\n==== Suite summary ====');
for (const line of summary) console.log(line);
console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
process.exit(totalFailed === 0 ? 0 : 1);
