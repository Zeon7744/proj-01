const fs=require('fs');
const p='public/js/app.js';
let s=fs.readFileSync(p,'utf8');
if(s.includes('function promotionTimeline')){console.log('already patched');process.exit(0);}
const oldStart='async function renderEvolution() {';
const i=s.indexOf(oldStart);
if(i<0){console.error('old fn not found');process.exit(1);}
// find closing brace matching i
let depth=0,j=i;
while(j<s.length){
  const c=s[j];
  if(c==='{')depth++;
  else if(c==='}'){depth--;if(depth===0)break;}
  j++;
}
j++; // include the closing brace
const old=s.slice(i,j);
const next=`async function renderEvolution() {
  const limit = (tierInfo && tierInfo.features && tierInfo.features.evolutionLimit === Infinity) ? 200 : 30;
  const r = await api('/evolution?limit=' + limit);
  const el = document.getElementById('evolutionBody');
  if (!el) return;
  if (!r || !r.events || !r.events.length) {
    el.innerHTML = '<div class="chip">暂无进化事件（先运行完整版采集，晋级/校准/竞技场胜出会在此记录）</div>';
    return;
  }
  const ev = r.events;
  const promotions = ev.filter((e) => e.kind === 'promotion');

  let timeline = '';
  if (promotions.length) {
    timeline = '<div class="panel" style="margin-bottom:14px">';
    timeline += '<h3 style="font-size:13px;margin-bottom:8px">晋级时间线</h3>';
    timeline += '<div class="timeline">';
    promotions.slice().reverse().forEach((e, idx, arr) => {
      const last = idx === 0;
      const time = e.ts ? e.ts.slice(5, 16).replace('T', ' ') : '';
      timeline += '<div class="tl-node ' + (last ? 'latest' : '') + '">';
      timeline += '<div class="tl-dot"></div>';
      timeline += '<div class="tl-body"><strong>' + e.ticker + '</strong> ' + (e.detail || '') + '<div class="tl-time">' + time + '</div></div>';
      timeline += '</div>';
    });
    timeline += '</div></div>';
  }

  const list = ev.map((e) => {
    const icon = e.kind === 'promotion' ? '▲' : e.kind === 'calibration' ? '◈' : '★';
    const cls = e.kind === 'promotion' ? 'good' : e.kind === 'calibration' ? 'warn' : '';
    const time = e.ts ? e.ts.slice(5, 16).replace('T', ' ') : '';
    return '<div class="evo-row"><span class="tag ' + cls + '">' + icon + ' ' + e.kind + '</span> <strong>' + e.ticker + '</strong> <span class="chip">' + (e.detail||'') + '</span> <span class="chip" style="margin-left:auto">' + time + '</span></div>';
  }).join('');

  el.innerHTML = timeline + '<div style="display:flex;flex-direction:column;gap:8px">' + list + '</div>';
}`;
s=s.slice(0,i)+next+s.slice(j);
fs.writeFileSync(p,s);
console.log('ok, replaced renderEvolution, new length', s.length);
