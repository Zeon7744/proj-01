// pm2 风格的进程守护脚本（轻量、无额外依赖）。
// 用法：
//   node scripts/serve.js            # 前台运行
//   node scripts/serve.js --daemon    # 后台运行（写 PID 到 .finagent.pid）
//   node scripts/serve.js --stop      # 停止守护进程
const path = require('path');
const fs = require('fs');

const PIDFILE = path.join(__dirname, '..', '.finagent.pid');
const logFile = path.join(__dirname, '..', 'logs', 'server.log');

function readPid() {
  try {
    return parseInt(fs.readFileSync(PIDFILE, 'utf8').trim(), 10);
  } catch (e) {
    return null;
  }
}
function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

const args = process.argv.slice(2);

if (args.includes('--stop')) {
  const pid = readPid();
  if (alive(pid)) {
    process.kill(pid, 'SIGTERM');
    console.log(`stopped pid ${pid}`);
  } else {
    console.log('no running daemon');
  }
  process.exit(0);
}

if (args.includes('--daemon')) {
  if (alive(readPid())) {
    console.log(`already running pid ${readPid()}`);
    process.exit(0);
  }
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const { spawn } = require('child_process');
  const out = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    stdio: ['ignore', out, out],
    detached: true,
    env: { ...process.env },
  });
  child.unref();
  fs.writeFileSync(PIDFILE, String(child.pid));
  console.log(`daemon started pid ${child.pid} log=${logFile}`);
  process.exit(0);
}

// 前台运行
console.log('FinAgent running in foreground (Ctrl+C to stop)');
require('../server.js');
process.on('SIGINT', () => {
  console.log('\nstopping...');
  process.exit(0);
});
