'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { FinAgentClient } = require('../src/shared/client');
const contract = require('../src/shared/contract');
const ops = require('../src/ops/scheduler');

test('three-end shared client returns contract-consistent snapshots', async () => {
  const c = new FinAgentClient({ version: 'full' });
  await c.run(['AAPL']);
  const { snapshot, contractErrors } = await c.snapshot('AAPL');
  assert.ok(snapshot, 'snapshot should exist after run');
  assert.deepStrictEqual(contractErrors, [], 'full snapshot must satisfy contract');
  assert.ok(snapshot.inHouse.model.startsWith('T'));
  assert.ok(Array.isArray(snapshot.reasoning.hypotheses));
  assert.ok(snapshot.modelArena.best.key);
});

test('lite snapshot is contract-clean (no predict fields required)', async () => {
  const c = new FinAgentClient({ version: 'lite' });
  await c.run(['AAPL']);
  const { snapshot, contractErrors } = await c.snapshot('AAPL');
  assert.deepStrictEqual(contractErrors, []);
  assert.ok(!snapshot.prediction, 'lite should not expose predictions');
});

test('contract validator flags broken snapshots', () => {
  const errs = contract.validateSnapshot({ ticker: 'X', version: 'full', metrics: {} });
  assert.ok(errs.includes('metrics.lastPrice missing'));
  assert.ok(errs.includes('inHouse.model missing (full)'));
});

test('ops scheduler exposes job status', () => {
  const status = ops.jobStatus();
  assert.ok(Array.isArray(status));
  assert.ok(typeof ops.jobsStarted === 'function');
});
