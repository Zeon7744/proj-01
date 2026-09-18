'use strict';

const KEY_BY_ROLE = {
  admin: 'fa_admin',
  analyst: 'fa_analyst_7f3a',
  viewer: 'fa_viewer_1c9d',
};
let version = 'full';
let role = 'admin';

function headers() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY_BY_ROLE[role]}` };
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { ...opts, headers: { ...(opts.headers || {}), ...headers() } });
  if (res.status === 401 || res.status === 403) {
    const el = document.getElementById('openapiDoc');
    if (el) {
      el.insertAdjacentHTML(
        'afterbegin',
        `<div class="ep" style="grid-template-columns:1fr"><div class="method" style="color:var(--bad)">${res.status}</div><div>权限不足：当前角色 ${role} 无法访问 ${path}</div></div>`
      );
    }
    return null;
  }
  return res.json();
}

function fmt(n, d = 2) {
  return n == null ? '–' : Number(n).toFixed(d);
}
function pct(n, d = 1) {
  return n == null ? '–' : Number(n).toFixed(d) + '%';
}

// ---------------- nav ----------------
document.querySelectorAll('.nav-item').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.page').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById('page-' + b.dataset.page).classList.add('active');
    document.getElementById('pageTitle').textContent = b.textContent;
    loadAll();
  })
);

// ---------------- version + role ----------------
document.querySelectorAll('#versionToggle .vbtn').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('#versionToggle .vbtn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    version = b.dataset.v;
    loadAll();
  })
);
document.getElementById('roleSelect').addEventListener('change', (e) => {
  role = e.target.value;
  loadAll();
});

// ---------------- actions ----------------
document.getElementById('collectBtn').addEventListener('click', async () => {
  const btn = document.getElementById('collectBtn');
  btn.disabled = true;
  btn.textContent = '采集中…';
  await api(`/${version}/collect`, { method: 'POST', body: '{}' });
  document.getElementById('lastRun').textContent = '运行于 ' + new Date().toLocaleTimeString();
  btn.disabled = false;
  btn.textContent = '运行采集';
  loadAll();
});
document.getElementById('refreshBtn').addEventListener('click', loadAll);

// ---------------- load ----------------
async function loadAll() {
  const data = await api(`/${version}/data`);
  renderDashboard(data);
  renderData(data);
  renderAnalysis(data);
  if (version === 'full') renderPredictions(data);
  renderOpenApi();
}

function renderDashboard(data) {
  const list = data || [];
  const ticks = list.map((t) => t.metrics);
  const ups = ticks.filter((t) => t.trend === 'bullish').length;
  const downs = ticks.filter((t) => t.trend === 'bearish').length;
  const avg = ticks.length ? ticks.reduce((a, t) => a + (t.lastPrice || 0), 0) / ticks.length : 0;
  const inHouseBest = list.length ? list[0].inHouse : null;
  const arenaBest = list.length ? list[0].modelArena && list[0].modelArena.best : null;

  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card"><div class="num">${list.length}</div><div class="lbl">资产数 (${version})</div></div>
    <div class="stat-card"><div class="num">${ups} / ${downs}</div><div class="lbl">看涨 / 看跌</div></div>
    <div class="stat-card accent"><div class="num">${fmt(avg)}</div><div class="lbl">均价</div></div>
    <div class="stat-card"><div class="num">${inHouseBest ? inHouseBest.model : '–'}</div><div class="lbl">
      自研模型${arenaBest ? ` · 竞技场命中 ${pct(arenaBest.winRate)}` : ''}
    </div></div>`;

  document.getElementById('dashList').innerHTML = list.length
    ? list
        .map((t) => {
          const ih = t.inHouse || {};
          const th = t.reasoning || {};
          const arena = t.modelArena || {};
          return `
      <div class="row" style="grid-template-columns:90px 1fr auto">
        <div class="tk">${t.ticker}</div>
        <div class="chip">
          最后 ${fmt(t.metrics.lastPrice)} · 趋势
          <span class="tag ${t.metrics.trend === 'bullish' ? 'good' : t.metrics.trend === 'bearish' ? 'bad' : 'warn'}">${t.metrics.trend}</span>
          ${t.metrics.signal ? ` · 信号 <span class="tag">${t.metrics.signal}</span>` : ''}
          ${ih.model ? ` · 自研 <span class="tag ${ih.upgraded ? 'good' : ''}">${ih.model}${ih.upgraded ? ' ↑' : ''}</span>` : ''}
          ${arena.best ? ` · 竞技场 ${arena.best.label} ${pct(arena.best.winRate)}` : ''}
        </div>
        <div class="chip">${th.direction ? `方向 ${th.direction}` : ''}${th.confidence != null ? ` · 置信 ${pct(th.confidence * 100)}` : ''}</div>
      </div>`;
        })
        .join('')
    : '<div class="chip">尚未运行采集，点击右上角「运行采集」</div>';
}

function renderData(data) {
  const list = data || [];
  document.getElementById('dataList').innerHTML = list.length
    ? list
        .map((t) => {
          const multi = (t.multi || []).map((m) => `${m.source}:${m.bars}`).join(' · ');
          return `
      <div class="row" style="grid-template-columns:90px 1fr auto">
        <div class="tk">${t.ticker}</div>
        <div class="chip">asOf ${t.metrics.asOf} · bars ${t.bars} · 主源 ${t.source}${multi ? ` · 多源 ${multi}` : ''}</div>
        <div class="chip">高 ${fmt((t.metrics.boll || {}).upper)} 低 ${fmt((t.metrics.boll || {}).lower)}</div>
      </div>`;
        })
        .join('')
    : '<div class="chip">暂无数据</div>';
}

function renderAnalysis(data) {
  const list = data || [];
  document.getElementById('analysisList').innerHTML = list.length
    ? list
        .map((t) => {
          const m = t.metrics;
          const ih = t.inHouse || {};
          const r = t.reasoning || {};
          const rsi = m.rsi;
          const width = rsi == null ? 50 : rsi;
          const hot = rsi > 70 ? 'bad' : rsi < 30 ? 'good' : 'warn';
          const hypotheses = (r.hypotheses || []).slice(0, 2).map((h) => `<div class="chip">· ${h}</div>`).join('');
          return `
      <div class="row" style="grid-template-columns:90px 1fr 220px">
        <div class="tk">${t.ticker}</div>
        <div class="chip">
          SMA20 ${fmt(m.sma20)} · SMA50 ${fmt(m.sma50)} · RSI ${fmt(m.rsi, 1)} · ATR ${fmt(m.atr, 2)} · Vol ${m.vol != null ? m.vol + '%' : 'n/a'}
          ${ih.model ? ` · 自研 <span class="tag ${ih.upgraded ? 'good' : ''}">${ih.model}${ih.upgraded ? ' ↑晋级' : ''}</span>` : ''}
          ${r.thought ? `<div class="chip" style="margin-top:4px">思考：${r.thought}</div>` : ''}
          ${hypotheses}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <div style="display:flex;align-items:center;gap:8px"><span class="chip">RSI</span>
            <div class="meter"><i style="width:${width}%;background:var(--${hot})"></i></div><span class="chip">${fmt(rsi, 1)}</span>
          </div>
          ${r.uncertainty != null ? `<div class="chip">不确定度 ${fmt(r.uncertainty, 1)} · 模型置信 ${pct((r.confidence || 0) * 100)}</div>` : ''}
        </div>
      </div>`;
        })
        .join('')
    : '<div class="chip">暂无分析</div>';
}

function renderPredictions(data) {
  const list = (data || []).filter((t) => t.prediction);
  document.getElementById('predList').innerHTML = list.length
    ? list
        .map((t) => {
          const p = t.prediction || {};
          const hs = (p.horizons || [])
            .map((h) =>
              `<span class="tag">${h.days}d → ${h.target} (${h.expectedReturnPct > 0 ? '+' : ''}${h.expectedReturnPct}%) conf ${Math.round(h.confidence * 100)}%</span>`
            )
            .join(' ');
          const bt =
            t.backtest && t.backtest.accuracyPct != null
              ? `<span class="tag good">命中 ${t.backtest.hitPoints}/${t.backtest.totalForecastPoints} = ${t.backtest.accuracyPct}%</span>`
              : '<span class="chip">命中待价格到来后回测</span>';
          const fb = t.backtest && t.backtest.feedbackCount ? ` · 自适应反馈样本 ${t.backtest.feedbackCount}` : '';
          const arena = t.modelArena && t.modelArena.best ? ` · 竞技场最佳 ${t.modelArena.best.label} (${pct(t.modelArena.best.winRate)})` : '';
          return `<div class="row" style="grid-template-columns:90px 1fr"><div class="tk">${t.ticker}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">${hs} ${bt}
              <span class="chip">${p.model ? p.model : ''}${p.upgraded ? ' ↑晋级' : ''}${fb}${arena}</span>
            </div></div>`;
        })
        .join('')
    : '<div class="chip">暂无预测（请先运行完整版采集）</div>';
}

function renderOpenApi() {
  document.getElementById('openapiDoc').innerHTML = `
    <div class="ep"><div class="method">GET</div><div><code>/api/{version}/data</code> 只读行情+自研模型，需 <code>read:data</code></div></div>
    <div class="ep"><div class="method">GET</div><div><code>/api/{version}/analysis/{ticker}</code> 技术指标，需 <code>read:analysis</code></div></div>
    <div class="ep"><div class="method">GET</div><div><code>/api/full/predictions</code> 预测记录，需 <code>read:predictions</code></div></div>
    <div class="ep"><div class="method">GET</div><div><code>/api/full/backtest?ticker=X</code> 命中回测，需 <code>read:predictions</code></div></div>
    <div class="ep"><div class="method">GET</div><div><code>/api/full/arena?ticker=X</code> 模型竞技场，需 <code>read:analysis</code></div></div>
    <div class="ep"><div class="method">POST</div><div><code>/{version}/collect</code> 触发采集+分析(+预测+命中+自我校准)，需 <code>write:collect</code></div></div>
    <div class="ep"><div class="method">POST</div><div><code>/{version}/analyze/{ticker}</code> 单标的分析，需 <code>write:analyze</code></div></div>
    <div class="ep"><div class="method">POST</div><div><code>/api/apps/key</code> 生成应用密钥，需 <code>*</code>（admin）</div></div>
    <div class="ep"><div class="method">AUTH</div><div><code>Authorization: Bearer &lt;key&gt;</code> 或 <code>X-API-Key</code>；角色：viewer/analyst/admin</div></div>
  `;
}

loadAll();
