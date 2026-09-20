'use strict';

// CLI 运维入口：audit / backup / prune / jobs。
// 用法：
//   node scripts/ops.js audit
//   node scripts/ops.js backup
//   node scripts/ops.js prune --keep-days 30
//   node scripts/ops.js jobs --version full
const health = require('../src/ops/health');
const backup = require('../src/ops/backup');
const scheduler = require('../src/ops/scheduler');
const logger = require('../src/ops/logger');

const args = process.argv.slice(2);
const cmd = args[0];
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

switch (cmd) {
  case 'audit': {
    const rep = health.audit();
    console.log(rep.lines.join('\n'));
    break;
  }
  case 'backup': {
    const r = backup.backup();
    console.log(`backup -> ${r.file} (${r.tickers} tickers)`);
    break;
  }
  case 'prune': {
    const keep = parseInt(flag('--keep-days') || '30', 10);
    const removed = backup.pruneOld(keep);
    const trimmed = backup.trimRaw(2500);
    console.log(`pruned ${removed.length} files, trimmed ${trimmed} raw files (keep ${keep}d, raw<=2500 bars)`);
    break;
  }
  case 'jobs': {
    const v = flag('--version') === 'lite' ? 'lite' : 'full';
    scheduler.dataRefreshJob(v);
    scheduler.logPruneJob();
    scheduler.hitRateAuditJob();
    scheduler.markStarted();
    const status = () => {
      console.log('\n=== FinAgent jobs ===');
      scheduler.jobStatus().forEach((j) => {
        console.log(
          `${j.name} every=${Math.round(j.everyMs / 1000)}s runs=${j.runs} running=${j.running} last=${j.lastRun || '-'}${j.error ? ' ERROR=' + j.error : ''}`
        );
      });
    };
    status();
    logger.info('ops jobs started (Ctrl+C to stop)');
    setInterval(status, 5 * 60 * 1000);
    process.on('SIGINT', () => {
      scheduler.stopAll();
      logger.info('ops jobs stopped');
      process.exit(0);
    });
    break;
  }
  case 'help':
  default:
    console.log('usage:\n  node scripts/ops.js audit\n  node scripts/ops.js backup\n  node scripts/ops.js prune --keep-days 30\n  node scripts/ops.js jobs --version full');
}
