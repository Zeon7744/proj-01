'use strict';

// 会员等级（entitlement）体系：不同等级开放不同功能与配额。
// 等级：free / pro / enterprise。
// 保留现有 RBAC 角色（viewer/analyst/admin）作为“操作权限”，
// 会员等级作为“功能开放 + 配额”维度，二者正交：
//   角色决定 能不能做某类操作；会员等级决定 开放哪些功能 / 多少配额。
//
// 功能开放矩阵（按会员等级）：
//   feature        free   pro   enterprise
//   version=lite    ✅     ✅      ✅
//   version=full    ❌     ✅      ✅
//   predict         ❌     ✅      ✅
//   hitBacktest     ❌     ✅(基础) ✅(含 regime)
//   regimeAware     ❌     ❌      ✅
//   evolutionLog    最近20  最近200  全部(流式)
//   modelArena      ❌     ✅      ✅
//   apiRateLimit    60/min 300/min 1200/min
//   keyQuota        1      5       不限
//   dataLookback    365d   3650d  3650d+
//
// 企业版专属：regime 感知 + 全量进化日志 + 高配额 + 不限密钥。

const TIER = {
  free: {
    label: '免费',
    version: ['lite'],
    predict: false,
    hitBacktest: false,
    regimeAware: false,
    modelArena: false,
    evolutionLimit: 20,
    apiRate: 60,
    keyQuota: 1,
    lookbackDays: 365,
  },
  pro: {
    label: '专业版',
    version: ['lite', 'full'],
    predict: true,
    hitBacktest: true,
    regimeAware: false,
    modelArena: true,
    evolutionLimit: 200,
    apiRate: 300,
    keyQuota: 5,
    lookbackDays: 3650,
  },
  enterprise: {
    label: '企业版',
    version: ['lite', 'full'],
    predict: true,
    hitBacktest: true,
    regimeAware: true,
    modelArena: true,
    evolutionLimit: Infinity,
    apiRate: 1200,
    keyQuota: Infinity,
    lookbackDays: 3650,
  },
};

// 账号 -> 会员等级 映射（内置演示账号）
const ACCOUNT_TIER = {
  viewer: 'free',
  analyst: 'pro',
  admin: 'enterprise',
};

function tierOf(role) {
  const key = ACCOUNT_TIER[role];
  return TIER[key] ? key : 'free';
}

// 判断某会员等级是否开放某功能
function can(feature, role) {
  const t = TIER[tierOf(role)];
  if (feature === 'version') return true; // 由调用方按 allowedVersions 过滤
  switch (feature) {
    case 'predict':
      return t.predict;
    case 'hitBacktest':
      return t.hitBacktest;
    case 'regime':
      return t.regimeAware;
    case 'modelArena':
      return t.modelArena;
    case 'evolution':
      return true; // 全部等级可看，但受 evolutionLimit 限制
    default:
      return false;
  }
}

// 某等级允许运行的版本列表
function allowedVersions(role) {
  return TIER[tierOf(role)].version.slice();
}

// 按等级收紧快照：free 看不到 full/predict/regime；pro 看不到 regime；enterprise 全量。
function applyTier(snap, role) {
  const t = TIER[tierOf(role)];
  if (!snap) return snap;
  const out = { ...snap };
  if (!t.version.includes('full') && snap.version === 'full') {
    // free 用户访问 full 快照：降级为 lite 字段（去掉预测/regime/竞技场）
    delete out.prediction;
    delete out.modelArena;
    delete out.inHouse;
    delete out.backtest;
  }
  if (!t.predict) {
    delete out.prediction;
    delete out.backtest;
  }
  if (!t.regimeAware) {
    // 非企业：隐藏 regime 细节（保留模型本身）
    if (out.inHouse && out.inHouse.regime) {
      out.inHouse = { ...out.inHouse, regime: undefined };
      if (out.inHouse.factors && out.inHouse.factors.regime) {
        out.inHouse.factors = { ...out.inHouse.factors, regime: undefined };
      }
    }
    if (out.reasoning && out.reasoning.regime) {
      out.reasoning = { ...out.reasoning, regime: undefined };
    }
  }
  if (!t.modelArena) delete out.modelArena;
  return out;
}

module.exports = { TIER, ACCOUNT_TIER, tierOf, can, allowedVersions, applyTier };
