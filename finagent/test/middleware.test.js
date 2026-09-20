'use strict';
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('http');
const { rateLimit, auditLog } = require('../src/ops/middleware');

function buildApp(opts = {}) {
  const app = express();
  app.use(opts.rl || rateLimit({ windowMs: 1000, max: opts.max || 3 }));
  app.use(auditLog());
  app.get('/ping', (req, res) => res.json({ ok: true }));
  return app;
}

function start(app) {
  return new Promise((resolve) => {
    const srv = app.listen(0, () => resolve({ srv, port: srv.address().port }));
  });
}

test('rate limiter returns 429 after exceeding max', async () => {
  const { srv, port } = await start(buildApp({ max: 3 }));
  const base = `http://127.0.0.1:${port}/ping`;
  const codes = [];
  for (let i = 0; i < 5; i++) {
    const r = await fetch(base);
    codes.push(r.status);
  }
  srv.close();
  assert.ok(codes.slice(0, 3).every((c) => c === 200), 'first 3 should pass');
  assert.ok(codes[3] === 429, '4th should be rate-limited');
  assert.ok(codes[4] === 429);
});

test('auditLog does not break requests', async () => {
  const { srv, port } = await start(buildApp({ max: 50 }));
  const r = await fetch(`http://127.0.0.1:${port}/ping`);
  srv.close();
  assert.strictEqual(r.status, 200);
  const body = await r.json();
  assert.ok(body.ok);
});
