'use strict';

// 权限隔离 + 应用开放 API + 会员等级。
// 角色：viewer / analyst / admin（操作权限），会员等级 free / pro / enterprise（功能开放 + 配额）。
// 每个“应用”持有一个 API Key（前缀 fa_）+ 作用域 scope 列表。
// 默认内置密钥便于本地开箱即用；生产请用 FINAGENT_*_KEY 环境变量覆盖，
// 并设 FINAGENT_STRICT_KEYS=1 关闭“无 key 降级 admin”。

const crypto = require('crypto');
const { tierOf, TIER, ACCOUNT_TIER } = require('../entitlements/tiers');

const ROLE_SCOPE = {
  viewer: ['read:data', 'read:analysis', 'read:predictions'],
  analyst: ['read:data', 'read:analysis', 'read:predictions', 'write:collect', 'write:analyze'],
  admin: ['*', 'manage:keys', 'manage:ops'],
};

// 内置账户（示例用；生产建议放 DB + 密码哈希）
const ACCOUNTS = [
  { user: 'admin', role: 'admin', apiKey: process.env.FINAGENT_ADMIN_KEY || 'fa_admin', scopes: ROLE_SCOPE.admin },
  { user: 'analyst', role: 'analyst', apiKey: process.env.FINAGENT_ANALYST_KEY || 'fa_analyst_7f3a', scopes: ROLE_SCOPE.analyst },
  { user: 'viewer', role: 'viewer', apiKey: process.env.FINAGENT_VIEWER_KEY || 'fa_viewer_1c9d', scopes: ROLE_SCOPE.viewer },
];

function grantKey(role) {
  const acct = ACCOUNTS.find((a) => a.role === role);
  if (acct) return acct;
  const raw = crypto.randomBytes(12).toString('hex');
  return { user: role, role, apiKey: 'fa_' + raw, scopes: ROLE_SCOPE[role] || ROLE_SCOPE.viewer };
}

// 鉴权中间件：从 Authorization: Bearer <key> 或 X-API-Key 解析，
// 并计算会员等级（tier）挂载到 req.ctx，供功能开放 / 配额使用。
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  let key = h.startsWith('Bearer ') ? h.slice(7) : req.headers['x-api-key'];
  if (!key) {
    if (process.env.FINAGENT_STRICT_KEYS === '1') {
      return res.status(401).json({ error: 'API key required (strict mode)' });
    }
    if (process.env.FINAGENT_LOCAL_OPEN !== '0') {
      req.ctx = { user: 'local', role: 'admin', tier: tierOf('admin'), scopes: ROLE_SCOPE.admin };
      return next();
    }
    return res.status(401).json({ error: 'missing API key' });
  }
  const acct = ACCOUNTS.find((a) => a.apiKey === key);
  if (!acct) return res.status(403).json({ error: 'invalid API key' });
  req.ctx = {
    user: acct.user,
    role: acct.role,
    tier: tierOf(acct.role),
    scopes: acct.scopes,
  };
  next();
}

function requireScope(scope) {
  return (req, res, next) => {
    const ctx = req.ctx;
    if (!ctx) return res.status(401).json({ error: 'unauthenticated' });
    const ok = ctx.scopes.includes('*') || ctx.scopes.includes(scope);
    if (!ok) return res.status(403).json({ error: `missing scope: ${scope}`, role: ctx.role });
    next();
  };
}

// 会员等级门控：要求该功能对当前 tier 开放，否则 402/403
function requireFeature(feature) {
  const { can } = require('../entitlements/tiers');
  return (req, res, next) => {
    const ctx = req.ctx || { role: 'viewer' };
    if (can(feature, ctx.role)) return next();
    return res.status(403).json({
      error: `feature '${feature}' not available for tier '${ctx.tier || 'free'}'`,
      upgradeTo: feature === 'regime' ? 'enterprise' : feature === 'modelArena' || feature === 'predict' ? 'pro' : null,
    });
  };
}

function currentIdentity(req) {
  const base = req.ctx || { user: 'anon', role: 'viewer', scopes: ROLE_SCOPE.viewer };
  return { ...base, tier: base.tier || tierOf(base.role) };
}

module.exports = { auth, requireScope, requireFeature, grantKey, currentIdentity, ROLE_SCOPE, ACCOUNTS, TIER, ACCOUNT_TIER, tierOf };
