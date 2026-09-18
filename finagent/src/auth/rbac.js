'use strict';

// 权限隔离 + 应用开放 API。
// 三种角色：
//   viewer  : 只能读（行情、分析、预测）
//   analyst : 可读 + 触发采集 / 分析
//   admin   : 全部 + 管理密钥
// 每个“应用”持有一个 API Key（前缀 fa_），带作用域 scope 列表。
// 默认内置 admin 密钥 fa_admin（生产环境请改为随机并走环境变量）。

const crypto = require('crypto');

const ROLE_SCOPE = {
  viewer: ['read:data', 'read:analysis', 'read:predictions'],
  analyst: ['read:data', 'read:analysis', 'read:predictions', 'write:collect', 'write:analyze'],
  admin: ['*', 'manage:keys'],
};

// 内置账户（示例用；生产建议放 DB + 密码哈希）
const ACCOUNTS = [
  { user: 'admin', role: 'admin', apiKey: process.env.FINAGENT_ADMIN_KEY || 'fa_admin', scopes: ROLE_SCOPE.admin },
  { user: 'analyst', role: 'analyst', apiKey: 'fa_analyst_7f3a', scopes: ROLE_SCOPE.analyst },
  { user: 'viewer', role: 'viewer', apiKey: 'fa_viewer_1c9d', scopes: ROLE_SCOPE.viewer },
];

function grantKey(role) {
  const acct = ACCOUNTS.find((a) => a.role === role);
  if (acct) return acct;
  const raw = crypto.randomBytes(12).toString('hex');
  return { user: role, role, apiKey: 'fa_' + raw, scopes: ROLE_SCOPE[role] || ROLE_SCOPE.viewer };
}

// 鉴权中间件：从 Authorization: Bearer <key> 或 X-API-Key 解析
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  let key = h.startsWith('Bearer ') ? h.slice(7) : req.headers['x-api-key'];
  if (!key) {
    // 本地控制台无 key 时降级为 admin，方便开发（生产关闭）
    if (process.env.FINAGENT_LOCAL_OPEN !== '0') {
      req.ctx = { user: 'local', role: 'admin', scopes: ROLE_SCOPE.admin };
      return next();
    }
    return res.status(401).json({ error: 'missing API key' });
  }
  const acct = ACCOUNTS.find((a) => a.apiKey === key);
  if (!acct) return res.status(403).json({ error: 'invalid API key' });
  req.ctx = { user: acct.user, role: acct.role, scopes: acct.scopes };
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

function currentIdentity(req) {
  return req.ctx || { user: 'anon', role: 'viewer', scopes: ROLE_SCOPE.viewer };
}

module.exports = { auth, requireScope, grantKey, currentIdentity, ROLE_SCOPE, ACCOUNTS };
