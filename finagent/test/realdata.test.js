'use strict';

// 真实数据源 smoke test：
// 若 ALPHAVANTAGE_API_KEY 存在，拉取 3 个标的 10 年数据跑 collect-full 子集，
// 断言 bars > 500 且 source !== 'simulated'；无 key 时自动 skip。
// 此测试用于在 CI 或部署前验证「多源采集」链路在真实数据下仍可用。
const test = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');

const KEY = process.env.ALPHAVANTAGE_API_KEY;

test('real-data smoke (skipped without ALPHAVANTAGE_API_KEY)', {
  // 无 key 时直接 skip，让 CI 不挂
  skip: !KEY,
}, async () => {
  // 跑一个 3 标的子集（AAPL, MSFT, NVDA）的 full 采集，超时 60s
  const out = execSync(
    `node scripts/collect-realdata.js AAPL,MSFT,NVDA`,
    { env: { ...process.env, ALPHAVANTAGE_API_KEY: KEY }, encoding: 'utf8', timeout: 90000 }
  );
  const parsed = JSON.parse(out);
  assert.ok(parsed.tickers.length >= 3, 'should collect at least 3 tickers');
  for (const t of parsed.tickers) {
    assert.ok(t.bars > 500, `${t.ticker} should have > 500 bars (got ${t.bars})`);
    assert.notStrictEqual(t.source, 'simulated', `${t.ticker} should use real source, not simulated`);
  }
});
