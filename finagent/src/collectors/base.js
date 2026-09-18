'use strict';
// 模拟数据源基类：用于无网络 / 无 key 环境演示，保证可复现。
function fakeSeries({ length, seed, startPrice, drift, vol }) {
  const rnd = (s) => {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 3432918353), h = h << 13 | h >>> 19;
    return () => (h = Math.imul(h ^ (h >>> 16), 2246822507), h = Math.imul(h ^ (h >>> 13), 3266489909), (h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const r = rnd(String(seed));
  const out = [];
  let p = startPrice || (50 + r() * 950);
  const dd = drift || -0.0002;
  const vv = vol || 0.018;
  const now = Date.now();
  for (let i = length - 1; i >= 0; i--) {
    const ret = dd + (r() - 0.5) * vv;
    p = Math.max(1, p * (1 + ret));
    const open = p / (1 + (r() - 0.5) * vv / 2);
    const close = p;
    const high = Math.max(open, close) * (1 + r() * vv / 2);
    const low = Math.min(open, close) * (1 - r() * vv / 2);
    out.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      open: r2(open),
      high: r2(high),
      low: r2(low),
      close: r2(close),
      volume: Math.round(1e6 + r() * 4e7),
    });
  }
  return out;
}
function r2(x) {
  return Math.round(x * 100) / 100;
}
module.exports = { fakeSeries };
