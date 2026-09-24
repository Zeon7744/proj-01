'use strict';
const fs=require('fs');
const p='src/entitlements/tiers.js';
let s=fs.readFileSync(p,'utf8');

// 1) free tier: add workerRoster + benchmarkGap
s=s.replace(
  "    evolutionLimit: 20,\n    apiRate: 60,\n    keyQuota: 1,\n    lookbackDays: 365,\n  },",
  "    evolutionLimit: 20,\n    apiRate: 60,\n    keyQuota: 1,\n    lookbackDays: 365,\n    workerRoster: 'lite3',\n    benchmarkGap: false,\n  },"
);

// 2) pro tier
s=s.replace(
  "    evolutionLimit: 200,\n    apiRate: 300,\n    keyQuota: 5,\n    lookbackDays: 3650,\n  },",
  "    evolutionLimit: 200,\n    apiRate: 300,\n    keyQuota: 5,\n    lookbackDays: 3650,\n    workerRoster: 'pro5',\n    benchmarkGap: false,\n  },"
);

// 3) enterprise tier
s=s.replace(
  "    evolutionLimit: Infinity,\n    apiRate: 1200,\n    keyQuota: Infinity,\n    lookbackDays: 3650,\n  },",
  "    evolutionLimit: Infinity,\n    apiRate: 1200,\n    keyQuota: Infinity,\n    lookbackDays: 3650,\n    workerRoster: 'enterprise7',\n    benchmarkGap: true,\n  },"
);

// 4) can() adds benchmarkGap + workers cases
s=s.replace(
  "    case 'evolution':\n      return true; // 全部等级可看，但受 evolutionLimit 限制",
  "    case 'evolution':\n      return true; // 全部等级可看，但受 evolutionLimit 限制\n    case 'benchmarkGap':\n      return t.benchmarkGap; // 仅 enterprise 开放基准对标\n    case 'workers':\n      return true; // 岗位报告全员可见，roster 数量随等级"
);

fs.writeFileSync(p,s);
console.log('tiers.js updated');
