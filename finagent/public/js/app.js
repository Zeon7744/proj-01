'use strict';

const KEY_BY_ROLE = {
  admin: 'fa_admin',
  analyst: 'fa_analyst_7f3a',
  viewer: 'fa_viewer_1c9d',
};
let version = 'full';
let role = 'admin';
let lastData = [];

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

function fmt(n, d = 2) { return n == null ? '–' : Number(n).toFixed(d); }
function pct(n, d = 1) { return n == null ? '–' : Number(n).toFixed(d) + '%'; }

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
document.getElementById('roleSelect').addEventListener('change', (e) => { role = e.target.value; loadAll(); });

// ---------------- actions ----------------
document.getElementById('collectBtn').addEventListener('click', async () => {
  const btn = document.getElementById('collectBtn');
  btn.disabled = true; btn.textContent = '采集中…';
  await api(`/agent/run`, { method: 'POST', body: JSON.stringify({ version }) });
  document.getElementById('lastRun').textContent = '运行于 ' + new Date().toLocaleTimeString();
  btn.disabled = false; btn.textContent = '运行采集';
  loadAll();
});
document.getElementById('backupBtn').addEventListener('click', async () => {
  const r = await api('/ops/backup', { method: 'POST' });
  document.getElementById('lastRun').textContent = r && r.file ? '备份 ' + r.file.split('\\').pop() : '备份失败(需 admin)';
});
document.getElementById('refreshBtn').addEventListener('click', loadAll);

// ---------------- load ----------------
async function loadAll() {
  const data = await api(`/tickers/all?version=${version}`);
  lastData = (data && data.records) || [];
  renderDashboard(lastData);
  renderData(lastData);
  renderAnalysis(lastData);
  renderModel(lastData);
  if (version === 'full') renderPredictions(lastData);
  renderOps();
  renderOpenApi();
  // 恢复详情页（若已有选中）
  const sel = window.__selTicker;
  if (sel) openDetail(sel);
}

function renderDashboard(data) {
  const ticks = data.map((t) => t.metrics);
  const ups = ticks.filter((t) => t.trend === 'bullish').length;
  const downs = ticks.filter((t) => t.trend === 'bearish').length;
  const avg = ticks.length ? ticks.reduce((a, t) => a + (t.lastPrice || 0), 0) / ticks.length : 0;
  const ih0 = data[0] && data[0].inHouse;
  const ar0 = data[0] && data[0].modelArena;
  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card"><div class="num">${data.length}</div><div class="lbl">资产数 (${version})</div></div>
    <div class="stat-card"><div class="num">${ups} / ${downs}</div><div class="lbl">看涨 / 看跌</div></div>
    <div class="stat-card accent"><div class="num">${fmt(avg)}</div><div class="lbl">均价</div></div>
    <div class="stat-card"><div class="num">${ih0 ? ih0.model : '–'}</div><div class="lbl">
      自研模型${ar0 && ar0.best ? ` · 竞技场 ${pct(ar0.best.winRate)}` : ''}
    </div></div>`;

  document.getElementById('dashList').innerHTML = data.length
    ? data.map((t) => {
        const ih = t.inHouse || {};
        const th = t.reasoning || {};
        return `
      <div class="row" data-tk="${t.ticker}">
        <div class="tk">${t.ticker}</div>
        <div class="chip">
          最后 ${fmt(t.metrics.lastPrice)} · 趋势
          <span class="tag ${t.metrics.trend === 'bullish' ? 'good' : t.metrics.trend === 'bearish' ? 'bad' : 'warn'}">${t.metrics.trend}</span>
          ${t.metrics.signal ? `<span class="tag">${t.metrics.signal}</span>` : ''}
          ${ih.model ? `<span class="tag model">${ih.model}${ih.upgraded ? ' ↑' : ''}</span>` : ''}
        </div>
        <div class="chip">${th.direction ? `方向 ${th.direction}` : ''}${th.confidence != null ? ` · 置信 ${pct(th.confidence * 100)}` : ''}</div>
      </div>`;
      }).join('')
    : '<div class="chip">尚未运行采集，点击右上角「运行采集」</div>';

  document.querySelectorAll('.dash-list .row').forEach((r) =>
    r.addEventListener('click', () => openDetail(r.dataset.tk))
  );
}

function renderData(data) {
  document.getElementById('dataList').innerHTML = data.length
    ? data.map((t) => {
        const multi = (t.multi || []).map((m) => `${m.source}:${m.bars}`).join(' · ');
        return `
      <div class="row" data-tk="${t.ticker}">
        <div class="tk">${t.ticker}</div>
        <div class="chip">asOf ${t.metrics.asOf} · bars ${t.bars} · 主源 ${t.source}${multi ? ` · 多源 ${multi}` : ''}</div>
        <div class="chip">高 ${fmt((t.metrics.boll || {}).upper)} 低 ${fmt((t.metrics.boll || {}).lower)}</div>
      </div>`;
      }).join('')
    : '<div class="chip">暂无数据</div>';
  document.querySelectorAll('#dataList .row').forEach((r) => r.addEventListener('click', () => openDetail(r.dataset.tk)));
}

function renderAnalysis(data) {
  document.getElementById('analysisList').innerHTML = data.length
    ? data.map((t) => {
        const m = t.metrics;
        const ih = t.inHouse || {};
        const r = t.reasoning || {};
        const rsi = m.rsi;
        const width = rsi == null ? 50 : rsi;
        const hot = rsi > 70 ? 'var(--bad)' : rsi < 30 ? 'var(--good)' : 'var(--warn)';
        const hyp = (r.hypotheses || []).slice(0, 2).map((h) => `<div class="hyp">· ${h}</div>`).join('');
        return `
      <div class="row" data-tk="${t.ticker}" style="grid-template-columns:110px 1fr 230px">
        <div class="tk">${t.ticker}</div>
        <div class="chip">
          SMA20 ${fmt(m.sma20)} · SMA50 ${fmt(m.sma50)} · RSI ${fmt(m.rsi, 1)} · ATR ${fmt(m.atr, 2)} · Vol ${m.vol != null ? m.vol + '%' : 'n/a'}
          ${ih.model ? `<span class="tag model">${ih.model}${ih.upgraded ? ' ↑晋级' : ''}</span>` : ''}
          ${r.thought ? `<div class="chip" style="margin-top:4px">思考：${r.thought}</div>` : ''}${hyp}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <div style="display:flex;align-items:center;gap:8px"><span class="chip">RSI</span>
            <div class="meter"><i style="width:${width}%;background:${hot}"></i></div><span class="chip">${fmt(rsi, 1)}</span>
          </div>
          ${r.uncertainty != null ? `<span class="chip">不确定度 ${fmt(r.uncertainty, 1)} · 模型置信 ${pct((r.confidence || 0) * 100)}</span>` : ''}
        </div>
      </div>`;
      }).join('')
    : '<div class="chip">暂无分析</div>';
  document.querySelectorAll('#analysisList .row').forEach((r) => r.addEventListener('click', () => openDetail(r.dataset.tk)));
}

function renderPredictions(data) {
  const list = data.filter((t) => t.prediction);
  document.getElementById('predList').innerHTML = list.length
    ? list.map((t) => {
        const p = t.prediction || {};
        const hs = (p.horizons || []).map((h) =>
          `<span class="tag">${h.days}d→${h.target} (${h.expectedReturnPct > 0 ? '+' : ''}${h.expectedReturnPct}%) conf ${Math.round(h.confidence * 100)}%</span>`
        ).join(' ');
        const bt = t.backtest && t.backtest.historical ? t.backtest.historical : t.backtest;
        const acc = bt && bt.accuracyPct != null ? `<span class="tag good">历史命中 ${bt.accuracyPct}% (${bt.hits}/${bt.samples})</span>` : '<span class="chip">命中待回测</span>';
        const fb = bt && bt.adaptiveFeedback ? ` · 自适应样本 ${bt.adaptiveFeedback.length}` : '';
        return `<div class="row" data-tk="${t.ticker}" style="grid-template-columns:110px 1fr">
          <div class="tk">${t.ticker}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">${hs} ${acc}<span class="chip">${p.model ? p.model : ''}${p.upgraded ? ' ↑' : ''}${fb}</span></div>
        </div>`;
      }).join('')
    : '<div class="chip">暂无预测（请先运行完整版采集）</div>';
  document.querySelectorAll('#predList .row').forEach((r) => r.addEventListener('click', () => openDetail(r.dataset.tk)));
}

function renderModel(data) {
  const withArena = data.filter((t) => t.modelArena);
  document.getElementById('modelList').innerHTML = withArena.length
    ? withArena.map((t) => {
        const a = t.modelArena;
        const rows = a.scored
          .map((s) => `
        <div class="arena-row" style="grid-template-columns:110px 1fr 120px 90px">
          <div class="tk">${t.ticker} · ${s.key}</div>
          <div style="display:flex;align-items:center;gap:8px"><div class="bar"><i style="width:${s.winRate}%;background:${s.key === a.best.key ? 'var(--accent2)' : 'var(--good)'}"></i></div></div>
          <div class="chip">胜率 ${pct(s.winRate)}</div>
          <div class="chip">err ${fmt(s.avgAbsErr == null || !isFinite(s.avgAbsErr) ? 0 : s.avgAbsErr * 100, 2)}%</div>
        </div>`)
          .join('');
        return `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <strong>${t.ticker}</strong>
          <span class="chip">最佳 <span class="tag model">${a.best.key}</span> 胜率 ${pct(a.best.winRate)} · 阈值 ${pct(a.threshold * 100)}</span>
        </div>
        ${rows}
      </div>`;
      }).join('')
    : '<div class="chip">暂无竞技场（先运行完整版）</div>';
}

async function renderOps() {
  const r = await api('/ops/health');
  const body = document.getElementById('opsBody');
  if (!r) { body.innerHTML = '<div class="chip">运维需 admin 权限</div>'; return; }
  body.innerHTML = `
    <div class="ops-card"><div class="k">资产数</div><div class="v">${r.tickers}</div></div>
    <div class="ops-card"><div class="k">原始数据</div><div class="v">${(r.rawBytes / 1048576).toFixed(1)} MB</div></div>
    <div class="ops-card"><div class="k">Stale 资产</div><div class="v ${r.staleTickers.length ? 'warn' : 'good'}">${r.staleTickers.length}</div></div>`;
}

function openDetail(tk) {
  window.__selTicker = tk;
  const t = lastData.find((x) => x.ticker === tk);
  const panel = document.getElementById('detailPanel');
  if (!t) { panel.hidden = true; return; }
  panel.hidden = false;
  document.getElementById('detailTitle').textContent = `${tk} · 详情（${t.version}）`;
  const m = t.metrics || {};
  const ih = t.inHouse || {};
  const r = t.reasoning || {};
  const a = t.modelArena || {};
  const bt = t.backtest && t.backtest.historical ? t.backtest.historical : null;
  document.getElementById('detailBody').innerHTML = `
    <div id="sparkWrap"><canvas class="spark" id="sparkCanvas" width="800" height="180"></canvas></div>
    <div class="kv">
      <div><div class="k">最后价</div><div class="v">${fmt(m.lastPrice)}</div></div>
      <div><div class="k">趋势</div><div class="v">${m.trend}</div></div>
      <div><div class="k">自研模型</div><div class="v">${ih.model || '–'}</div></div>
      <div><div class="k">置信度</div><div class="v">${ih.confidence != null ? pct(ih.confidence * 100) : '–'}</div></div>
    </div>
    <div class="thought"><strong>自我思考：</strong><br>${r.thought || '—'}
      ${(r.hypotheses || []).map((h) => `<div class="hyp">• ${h}</div>`).join('')}
    </div>
    ${a.best ? `<div class="chip">模型竞技场：最佳 <span class="tag model">${a.best.key}</span> 胜率 ${pct(a.best.winRate)}${a.threshold != null ? ` · 命中阈值 ${pct(a.threshold * 100)}` : ''}</div>` : ''}
    ${bt ? `<div class="chip">历史 dry-run：命中 ${bt.hits}/${bt.samples} = ${bt.accuracyPct}% · 平均误差 ${bt.avgAbsErrPct}%</div>` : ''}`;
  drawSpark(tk);
}

// 用最近 120 根 bar 画 sparkline
async function drawSpark(tk) {
  const c = document.getElementById('sparkCanvas');
  if (!c) return;
  const r = await api(`/tickers/${encodeURIComponent(tk)}/bars?limit=120`);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  if (!r || !r.bars || !r.bars.length) return;
  const closes = r.bars.map((b) => b.close);
  const min = Math.min(...closes), max = Math.max(...closes), span = max - min || 1;
  const W = c.width, H = c.height, pad = 8;
  ctx.beginPath();
  closes.forEach((p, i) => {
    const x = pad + (i / (closes.length - 1)) * (W - pad * 2);
    const y = H - pad - ((p - min) / span) * (H - pad * 2);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  const up = closes[closes.length - 1] >= closes[0];
  ctx.strokeStyle = up ? getComputedStyle(document.body).getPropertyValue('--good') : getComputedStyle(document.body).getPropertyValue('--bad');
  ctx.lineWidth = 2;
  ctx.stroke();
}

function renderOpenApi() {
  document.getElementById('openapiDoc').innerHTML = `
    <div class="ep"><div class="method">GET</div><div><code>/api/tickers/all?version=full</code> 全量契约快照，需 <code>read:analysis</code></div></div>
    <div class="ep"><div class="method">GET</div><div><code>/api/tickers/{ticker}/bars</code> 原始行情，需 <code>read:data</code></div></div>
    <div class="ep"><div class="method">GET</div><div><code>/api/arena/{ticker}</code> 模型竞技场，需 <code>read:analysis</code></div></div>
    <div class="ep"><div class="method">GET</div><div><code>/api/predictions</code> / <code>/api/backtest/{ticker}</code>，需 <code>read:predictions</code></div></div>
    <div class="ep"><div class="method">POST</div><div><code>/api/agent/run</code> 触发采集+分析+预测+命中+自我升级，需 <code>write:collect</code></div></div>
    <div class="ep"><div class="method">OPS</div><div><code>/api/ops/health|audit|backup|prune|jobs</code>，需 <code>manage:ops</code>（admin）</div></div>
    <div class="ep"><div class="method">AUTH</div><div><code>Authorization: Bearer &lt;key&gt;</code>；角色 viewer/analyst/admin；严格模式需 key</div></div>
  `;
}

loadAll();
