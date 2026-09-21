const fs=require('fs');
const p='public/js/app.js';
let s=fs.readFileSync(p,'utf8');
if(s.includes('function applyTierUI')){console.log('already present');process.exit(0);}
const anchor='function renderDashboard(data) {';
const i=s.indexOf(anchor);
if(i<0){console.error('anchor not found');process.exit(1);}
const insert=`
// ---------------- 会员等级 UI ----------------
function applyTierUI(tier) {
  if (!tier) return;
  const badge = document.getElementById('tierBadge');
  if (badge) {
    badge.textContent = tier.label + ' · ' + tier.tier;
    badge.title = '当前会员等级：' + tier.label + '，API 配额 ' + tier.quotas.apiRate + '/60s，密钥配额 ' + (tier.quotas.keyQuota === Infinity ? '不限' : tier.quotas.keyQuota);
  }

  const versions = (tier.features.versions) || ['lite'];
  document.querySelectorAll('#versionToggle .vbtn').forEach((b) => {
    b.style.display = versions.includes(b.dataset.v) ? '' : 'none';
  });
  if (!versions.includes(version)) {
    version = versions[0] || 'lite';
    document.querySelectorAll('#versionToggle .vbtn').forEach((b) => b.classList.toggle('active', b.dataset.v === version));
  }

  const f = tier.features || {};
  const tabMap = { prediction: !!f.predict, model: !!f.modelArena, evolution: true, tier: true };
  document.querySelectorAll('.nav-item').forEach((b) => {
    const page = b.dataset.page;
    if (page in tabMap) b.style.display = tabMap[page] ? '' : 'none';
  });

  const evoLimit = f.evolutionLimit;
  const evoNote = document.getElementById('evolutionNote');
  if (evoNote) evoNote.textContent = evoLimit === Infinity ? '全部事件（流式）' : ('最近 ' + evoLimit + ' 条（升级解锁更多）');
}

async function renderTierPage() {
  const r = await api('/tier');
  if (!r) return;
  tierInfo = r;
  applyTierUI(r);

  const TIER_MATRIX = [
    { tier: 'free', label: '免费版', version: 'lite', predict: false, hitBacktest: false, regimeAware: false, modelArena: false, evolutionLimit: 20, apiRate: 60, keyQuota: 1, lookbackDays: 365 },
    { tier: 'pro', label: '专业版', version: 'lite+full', predict: true, hitBacktest: true, regimeAware: false, modelArena: true, evolutionLimit: 200, apiRate: 300, keyQuota: 5, lookbackDays: 3650 },
    { tier: 'enterprise', label: '企业版', version: 'lite+full', predict: true, hitBacktest: true, regimeAware: true, modelArena: true, evolutionLimit: Infinity, apiRate: 1200, keyQuota: Infinity, lookbackDays: 3650 },
  ];
  const cur = r.tier;
  const cols = ['功能'].concat(TIER_MATRIX.map((t) => '<th class="' + (t.tier === cur ? 'cur' : '') + '">' + t.label + '</th>')).join('');
  const rowsDef = [
    ['支持版本', (t) => t.version],
    ['预测', (t) => (t.predict ? '✓' : '—')],
    ['命中回测', (t) => (t.hitBacktest ? '✓' : '—')],
    ['模型竞技场', (t) => (t.modelArena ? '✓' : '—')],
    ['Regime 感知', (t) => (t.regimeAware ? '✓' : '—')],
    ['进化日志', (t) => (t.evolutionLimit === Infinity ? '全部' : '最近 ' + t.evolutionLimit)],
    ['API 配额', (t) => t.apiRate + '/min'],
    ['密钥配额', (t) => (t.keyQuota === Infinity ? '不限' : String(t.keyQuota))],
    ['数据回溯', (t) => t.lookbackDays + 'd'],
  ];
  const tbody = rowsDef.map(([name, fn]) => {
    const tds = TIER_MATRIX.map((t) => '<td class="' + (t.tier === cur ? 'cur' : '') + '">' + fn(t) + '</td>').join('');
    return '<tr><td class="k">' + name + '</td>' + tds + '</tr>';
  }).join('');
  const matrix = document.getElementById('tierMatrix');
  if (matrix) {
    matrix.innerHTML = '<table class="tier-table"><thead><tr>' + cols + '</tr></thead><tbody>' + tbody + '</tbody></table>';
  }

  const detail = document.getElementById('tierDetail');
  if (detail) {
    const f = r.features || {};
    const q = r.quotas || {};
    detail.innerHTML = '<div class="kv">' +
      '<div><div class="k">当前角色</div><div class="v">' + r.role + '</div></div>' +
      '<div><div class="k">当前等级</div><div class="v"><span class="tag ' + (cur === 'enterprise' ? 'good' : cur === 'pro' ? 'warn' : '') + '">' + r.label + '</span></div></div>' +
      '<div><div class="k">支持版本</div><div class="v">' + (f.versions || []).join(' / ') + '</div></div>' +
      '<div><div class="k">API 配额</div><div class="v">' + q.apiRate + ' / min</div></div>' +
      '<div><div class="k">密钥配额</div><div class="v">' + (q.keyQuota === Infinity ? '不限' : q.keyQuota) + '</div></div>' +
      '<div><div class="k">数据回溯</div><div class="v">' + q.lookbackDays + ' 天</div></div>' +
      '</div>';
  }
}

`;
s=s.slice(0,i)+insert+s.slice(i);
fs.writeFileSync(p,s);
console.log('inserted tier UI, new length', s.length);
