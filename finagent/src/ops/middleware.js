'use strict';

// API 中间件：限流 + 审计日志（轻量、无额外依赖）。
// 限流：按 API key / IP 的固定窗口计数；支持 perIdentity(req) 按会员等级动态配额；超限返回 429。
// 审计：记录 谁(角色) 在 何时 调了 哪个方法/路径，结果码。

const logger = require('./logger');

function rateLimit({ windowMs = 60 * 1000, max = 60, perIdentity } = {}) {
  const hits = new Map(); // key -> { count, resetAt }
  setInterval(() => {
    for (const [k, v] of hits) if (Date.now() > v.resetAt) hits.delete(k);
  }, windowMs).unref();
  return function (req, res, next) {
    const id = (req.ctx && req.ctx.user) || req.headers['x-api-key'] || req.ip || 'anon';
    // 配额：优先按会员等级（perIdentity），否则用固定 max
    const limit = typeof perIdentity === 'function' ? perIdentity(req) : max;
    const now = Date.now();
    let e = hits.get(id);
    if (!e || now > e.resetAt) e = { count: 0, resetAt: now + windowMs };
    e.count++;
    hits.set(id, e);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - e.count)));
    if (e.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((e.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'rate limit exceeded', retryAfterSec: Math.ceil((e.resetAt - now) / 1000), tierLimit: limit });
    }
    next();
  };
}

function auditLog() {
  return function (req, res, next) {
    res.on('finish', () => {
      const who = (req.ctx && req.ctx.user) || 'anon';
      const role = (req.ctx && req.ctx.role) || '-';
      const tier = (req.ctx && req.ctx.tier) || '-';
      const msg = `${req.method} ${req.originalUrl} -> ${res.statusCode} (${who}/${role}/${tier})`;
      res.statusCode >= 500 ? logger.error(msg) : res.statusCode >= 400 ? logger.warn(msg) : logger.debug(msg);
    });
    next();
  };
}

module.exports = { rateLimit, auditLog };
