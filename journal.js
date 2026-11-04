/*! journal.js: the painted layer of ghostjolokia.github.io (a Kaziranga field journal).
 *
 * The brush engine below (mulberry/withSeed, qcurve/polar, mk, drawS, drawList, clump, edgeOf, washPoly) is adapted
 * from the "Watercolor Brush" style of Lemo-Opuscar, https://github.com/lemomo-ai/lemo-opuscar
 *
 * MIT License
 * Copyright (c) 2026 LemoLab
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of
 * the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
 * THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function () {
'use strict';
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DPR = Math.min(2, window.devicePixelRatio || 1);

// ---------------------------------------------------------------- engine
function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let RNG = mulberry(20261104);
const rnd = (a = 0, b = 1) => a + (b - a) * RNG();
const pick = a => a[Math.floor(RNG() * a.length)];
function withSeed(seed, fn) { const keep = RNG; RNG = mulberry(seed); try { return fn(); } finally { RNG = keep; } }
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ss = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const eo = t => 1 - Math.pow(1 - clamp(t), 3);
const eio = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const hash = n => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
const vnoise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); };
const fbm = x => vnoise(x) * .55 + vnoise(x * 2.1 + 17) * .3 + vnoise(x * 4.3 + 41) * .15;

const PAPER = '#f1e9da', INK = '#2b2520', INK2 = '#3d3129', GAMOSA = '#c6473b';
const _rgb = {};
const hex2rgb = h => _rgb[h] || (_rgb[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const mixc = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * clamp(t)).toString(16).padStart(2, '0')).join(''); };
const rgba = (h, a) => { const c = hex2rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${clamp(a).toFixed(3)})`; };

function qcurve(x0, y0, x1, y1, bend = 0, n = 12) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const cx = mx - dy / L * bend, cy = my + dx / L * bend, out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]); }
  return out;
}
const polar = (x, y, a, len, bend = 0, n = 8) => qcurve(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, bend, n);

// one stroke: centre-line + width profile + dry-brush bristle tracks (flying white)
function mk(pts, w, col, o = {}) {
  const n = pts.length, ws = [], nx = [], ny = [];
  const seed = rnd(0, 1000), rough = o.rough ?? .22, prof = o.prof || 'brush';
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1); let f;
    if (prof === 'leaf') f = Math.pow(Math.sin(Math.PI * (s * .94 + .03)), .7);
    else if (prof === 'even') f = Math.min(1, s / .06 + .35) * Math.min(1, (1 - s) / .08 + .4);
    else if (prof === 'tip') f = Math.pow(1 - s * .92, .85) * Math.min(1, s / .05 + .6);
    else if (prof === 'trunk') f = (1 - s * .62) * (1 + Math.max(0, .06 - s) * 9);
    else f = Math.min(1, s / .1 + .3) * Math.pow(1 - s * .85, .6);
    ws.push(Math.max(.5, w * f * (1 + rough * (vnoise(seed + i * .9) * 2 - 1))));
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    nx.push(-dy / L); ny.push(dx / L);
  }
  const nb = o.nb ?? (w >= 6 ? Math.min(9, Math.max(3, Math.round(w / 3.2))) : 0);
  let br = null;
  if (nb > 0) {
    br = [];
    for (let j = 0; j < nb; j++) {
      const dash = []; for (let k = 0; k < 6; k++) dash.push(k % 2 ? rnd(1, w * .5 + 3) : rnd(18, 90));
      br.push({ off: rnd(-.46, .46), bw: Math.max(.7, w / nb * rnd(.6, 1.3)), a: rnd(.3, .85), end: rnd(.72, 1), dash });
    }
  }
  return { pts, ws, nx, ny, col, a: o.a ?? .92, rib: o.rib ?? (nb ? .62 : .92), br };
}
function drawS(c, s, p = 1, col = null, am = 1) {
  if (p <= 0) return;
  const P = s.pts, n = P.length, m = (n - 1) * clamp(p), k = Math.floor(m), f = m - k, cc = col || s.col;
  const cnt = f > .001 && k < n - 1 ? k + 2 : k + 1;
  const X = i => i <= k ? P[i][0] : lerp(P[k][0], P[k + 1][0], f), Y = i => i <= k ? P[i][1] : lerp(P[k][1], P[k + 1][1], f);
  c.beginPath();
  for (let i = 0; i < cnt; i++) { const j = Math.min(i, n - 1), hw = s.ws[j] / 2 * (p < 1 && i === cnt - 1 ? .5 : 1); const x = X(i) + s.nx[j] * hw, y = Y(i) + s.ny[j] * hw; i ? c.lineTo(x, y) : c.moveTo(x, y); }
  for (let i = cnt - 1; i >= 0; i--) { const j = Math.min(i, n - 1), hw = s.ws[j] / 2 * (p < 1 && i === cnt - 1 ? .5 : 1); c.lineTo(X(i) - s.nx[j] * hw, Y(i) - s.ny[j] * hw); }
  c.closePath(); c.fillStyle = rgba(cc, s.a * s.rib * am); c.fill();
  if (s.br) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const b of s.br) {
      const e = Math.min(m, (n - 1) * b.end), kk = Math.floor(e); if (kk < 1) continue;
      c.beginPath();
      for (let i = 0; i <= kk; i++) { const hw = s.ws[i] * b.off, x = P[i][0] + s.nx[i] * hw, y = P[i][1] + s.ny[i] * hw; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.setLineDash(b.dash); c.lineWidth = b.bw; c.strokeStyle = rgba(cc, s.a * b.a * am); c.stroke();
    }
    c.setLineDash([]);
  }
}
function drawList(c, L, p = 1, col = null, am = 1) {
  const N = L.length; if (!N || p <= 0) return;
  if (p >= 1) { for (const s of L) drawS(c, s, 1, col, am); return; }
  const dur = Math.min(.5, Math.max(.12, 4 / N));
  for (let j = 0; j < N; j++) { const t0 = j / N * (1 - dur); drawS(c, L[j], (p - t0) / dur, col, am); }
}
function clump(S, cx, cy, r, n, cols, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), rr = r * Math.sqrt(rnd());
    const x = cx + Math.cos(a) * rr * (o.sx ?? 1.25), y = cy + Math.sin(a) * rr * (o.sy ?? .8);
    const d = o.dir !== undefined ? o.dir + rnd(-(o.spread ?? .6), o.spread ?? .6) : rnd(0, Math.PI * 2);
    const len = rnd(o.l0 ?? 10, o.l1 ?? 22), w = rnd(o.w0 ?? 6, o.w1 ?? 12);
    S.push(mk(qcurve(x, y, x + Math.cos(d) * len, y + Math.sin(d) * len, rnd(-3, 3), 5), w, pick(cols), { prof: 'leaf', nb: w > 9 ? 3 : 0, a: rnd(o.a0 ?? .72, o.a1 ?? .95), rough: .3 }));
  }
}
function edgeOf(s, side, w, col, a = .85) {
  const pts = s.pts.map((p, i) => [p[0] + s.nx[i] * s.ws[i] * .47 * side, p[1] + s.ny[i] * s.ws[i] * .47 * side]);
  return mk(pts, w, col, { prof: 'even', nb: 0, a, rough: .35 });
}
// a flat wash painted in passes with jittered vertices: edges darken where the passes disagree (a pooled edge)
function washPoly(c, pts, fill, a, passes = 3, jit = 5, seed = 1) {
  withSeed(seed, () => {
    for (let p = 0; p < passes; p++) {
      c.beginPath(); pts.forEach(([x, y], i) => { const yy = y + (i % 3 === 0 ? rnd(-jit, jit) : 0); i ? c.lineTo(x, yy) : c.moveTo(x, yy); });
      c.closePath(); c.globalAlpha = a / passes * 1.6; c.fillStyle = fill; c.fill();
    }
  });
  c.globalAlpha = 1;
}

// handwritten note, revealed left to right like writing, over a paper-coloured halo
function hand(c, txt, x, y, p, o = {}) {
  if (p <= 0) return;
  c.save(); c.font = `${o.w || 500} ${o.size || 30}px Caveat, cursive`; c.textAlign = o.align || 'left'; c.textBaseline = 'middle';
  const w = c.measureText(txt).width, x0 = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  c.beginPath(); c.rect(x0 - 8, y - (o.size || 30), (w + 16) * eo(p), (o.size || 30) * 2); c.clip();
  c.shadowColor = rgba(o.halo || PAPER, .95); c.shadowBlur = (o.size || 30) * .4; c.fillStyle = rgba(o.col || INK, o.a ?? .88);
  c.fillText(txt, x, y); c.shadowBlur = 0; c.fillText(txt, x, y);
  c.restore();
}
function leader(c, x0, y0, x1, y1, p, bend = 20, o = {}) {
  if (p <= 0) return;
  const pts = qcurve(x0, y0, x1, y1, bend, 18), m = Math.max(1, Math.round(18 * clamp(p)));
  c.save(); c.beginPath(); for (let i = 0; i <= m; i++) i ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1]);
  c.strokeStyle = rgba(o.col || INK, o.a ?? .7); c.lineWidth = o.lw || 1.5; c.lineCap = 'round'; c.stroke();
  if (p >= 1) { c.beginPath(); c.arc(x1, y1, (o.lw || 1.5) * 1.9, 0, 7); c.fillStyle = rgba(o.col || INK, o.a ?? .7); c.fill(); }
  c.restore();
}

// ---------------------------------------------------------------- generators (local coords, root at 0,0, y up = negative)
const GREENS = ['#5f8a4e', '#4f7a46', '#6f9658', '#41683d', '#7aa063'];
function tussock(sc, cols, n = 12, hmul = 1) {
  const S = [];
  for (let i = 0; i < n; i++) {
    const side = rnd(-1, 1), ang = -Math.PI / 2 + side * .7, len = rnd(28, 58) * sc * hmul;
    S.push(mk(polar(side * 6 * sc, 0, ang, len, side * len * .22, 6), rnd(2, 3.2) * sc, pick(cols), { prof: 'tip', nb: 0, a: rnd(.7, .92) }));
  }
  return S;
}
// elephant grass (Saccharum): tall arching blades, a few feathery plumes
function elephantGrass(sc) {
  const S = [], n = 14 + Math.floor(rnd(0, 8));
  for (let i = 0; i < n; i++) {
    const side = rnd(-1, 1), ang = -Math.PI / 2 + side * .55, len = rnd(110, 230) * sc;
    S.push(mk(polar(side * 10 * sc, 0, ang, len, side * len * rnd(.15, .35), 8), rnd(3, 5) * sc, pick(['#7d8a4e', '#8f9a58', '#6c7d45', '#a2a564', '#5f7340']), { prof: 'tip', nb: 0, a: rnd(.62, .88) }));
  }
  for (let i = 0; i < 3; i++) {
    const side = rnd(-.5, .5), len = rnd(170, 250) * sc, pts = polar(side * 8 * sc, 0, -Math.PI / 2 + side * .3, len, side * 24 * sc, 8);
    S.push(mk(pts, 1.8 * sc, '#8a7f55', { prof: 'even', nb: 0, a: .6 }));
    const [ex, ey] = pts[pts.length - 1];
    clump(S, ex + 4 * sc, ey + 14 * sc, 13 * sc, 10, ['#e6dab0', '#d8c896', '#efe4c0'], { dir: -Math.PI / 2 + .5, spread: .5, l0: 12 * sc, l1: 26 * sc, w0: 3 * sc, w1: 6 * sc, sx: .5, sy: 1.6, a0: .55, a1: .85 });
  }
  return S;
}
function farTree(sc, cols, tall = 1) {
  const S = [], Hh = rnd(60, 100) * sc * tall;
  S.push(mk(qcurve(0, 0, rnd(-3, 3), -Hh * .55, 2, 5), 2.4 * sc, '#5d6b5a', { prof: 'tip', nb: 0, a: .35 }));
  clump(S, 0, -Hh * .8, Hh * .44, 14, cols, { l0: 8 * sc, l1: 18 * sc, w0: 6 * sc, w1: 12 * sc, sx: 1.25, sy: .7 });
  return S;
}
function cloud(sc, col) {
  const S = [], w = rnd(260, 520) * sc;
  for (let i = 0; i < 5; i++) { const y = rnd(-14, 14) * sc, x = rnd(-w * .2, w * .2); S.push(mk(qcurve(x - w / 2, y, x + w / 2, y + rnd(-6, 6), rnd(-12, 12) * sc, 14), rnd(16, 30) * sc, col, { prof: 'leaf', nb: 7, a: rnd(.16, .26) })); }
  return S;
}

// --- Plate I: bhut jolokia. Woody stems, broad leaves, wrinkled hanging pods in gamosa red
function jolokia() {
  const S = [], P = [], notes = {};
  const stem = qcurve(200, 470, 188, 205, 10, 12);
  S.push(mk(stem, 9, '#6b5a3f', { prof: 'trunk', nb: 3 }));
  const forks = [[.25, -1], [.38, 1], [.52, -1], [.64, 1], [.78, -1], [.9, 1]];
  const tips = [];
  for (const [u, sd] of forks) {
    const i = Math.round(u * (stem.length - 1)), [x, y] = stem[i];
    const ang = -Math.PI / 2 + sd * rnd(.55, .95), len = rnd(70, 125);
    const br = polar(x, y, ang, len, sd * rnd(8, 18), 8);
    S.push(mk(br, rnd(3.6, 5), '#6f6142', { prof: 'tip', nb: 0, a: .85 }));
    tips.push([br, sd]);
  }
  const leaf = (x, y, ang, len, w) => {
    const pts = polar(x, y, ang, len, rnd(-.12, .12) * len, 9);
    const L = mk(pts, w, pick(GREENS), { prof: 'leaf', nb: 4, a: rnd(.78, .92) });
    S.push(L); S.push(mk(pts.slice(0, 8), 1.2, '#2f4b2a', { prof: 'tip', nb: 0, a: .45 }));
  };
  for (const [br, sd] of tips) {
    for (let k = 3; k < br.length; k += 2) {
      const [x, y] = br[k]; leaf(x, y, -Math.PI / 2 + sd * rnd(.3, 1.4), rnd(48, 78), rnd(24, 34));
      if (rnd() < .6) leaf(x, y, -Math.PI / 2 - sd * rnd(.2, 1), rnd(40, 64), rnd(20, 28));
    }
    const [ex, ey] = br[br.length - 1]; leaf(ex, ey, -Math.PI / 2 + sd * .4, rnd(56, 80), rnd(26, 34));
  }
  // pods: hang from branch nodes, wrinkled (3 overlapping ribbons + creases), green calyx
  const nodes = [[tips[0][0][4], -1], [tips[1][0][5], 1], [tips[2][0][3], -1], [tips[3][0][4], 1], [tips[4][0][3], -1]];
  nodes.forEach(([[x, y], sd], i) => {
    const len = rnd(48, 66), dx = sd * rnd(5, 12), pod = qcurve(x, y + 10, x + dx, y + 10 + len, sd * rnd(5, 12), 10);
    S.push(mk(polar(x, y, Math.PI / 2 + sd * .2, 14, 0, 4), 3, '#55703c', { prof: 'even', nb: 0, a: .9 }));
    const reds = i === 2 ? ['#d8673c', '#c9572f', '#e2804a'] : ['#c6473b', '#b23a2e', '#d65a45'];
    for (let r = 0; r < 3; r++) P.push(mk(pod.map(([px, py], j) => [px + rnd(-2.5, 2.5) * (j / 10), py]), rnd(21, 27), reds[r], { prof: 'tip', nb: 4, a: rnd(.62, .82), rough: .35 }));
    for (let r = 0; r < 3; r++) { const o = rnd(-4, 4), a = rnd(.15, .6); P.push(mk(pod.slice(Math.floor(a * 10)).map(([px, py], j) => [px + o + Math.sin(j * 1.7 + r) * 1.6, py]), 1.4, '#7f2a20', { prof: 'even', nb: 0, a: .5 })); }
    P.push(mk(pod.slice(1, 7).map(([px, py]) => [px - sd * 4, py]), 2.2, PAPER, { prof: 'tip', nb: 0, a: .55 }));
    S.push(mk(polar(x, y + 8, Math.PI / 2 - .7, 10, 2, 4), 5, '#5d7a43', { prof: 'leaf', nb: 0 }), mk(polar(x, y + 8, Math.PI / 2 + .7, 10, -2, 4), 5, '#5d7a43', { prof: 'leaf', nb: 0 }));
    if (i === 1) notes.pod = pod[6];
  });
  notes.title = ['bhut jolokia', 'ghost pepper', 'over 1,000,000 Scoville'];
  return { S: S.concat(P), notes };
}
// --- Plate II: bamboo. Three culms with nodes, branch sprays of lance leaves
function bamboo(cols = ['#7f9a5a', '#8aa461', '#6f8c50']) {
  const S = [], L = [], notes = {};
  const culms = [[212, 30, -8], [268, 70, 2], [322, 112, 8]];
  culms.forEach(([x, top, lean], ci) => {
    const pts = qcurve(x, 476, x + lean, top, lean * .6, 20), c = cols[ci % cols.length];
    S.push(mk(pts, 15 - ci * 1.5, c, { prof: 'even', nb: 5, a: .86, rough: .12 }));
    S.push(edgeOf(S[S.length - 1], 1, 2.2, '#3f5a32', .5));
    for (let k = 2; k < pts.length - 1; k += 3) {
      const [nx, ny] = pts[k];
      S.push(mk(qcurve(nx - 9, ny + 1, nx + 9, ny - 1, 1, 4), 3.4, '#46613a', { prof: 'even', nb: 0, a: .85 }));
      if (k >= 8) {
        for (const sd of [-1, 1]) {
          if (rnd() < .35) continue;
          const br = polar(nx, ny, -Math.PI / 2 + sd * rnd(.75, 1.05), rnd(18, 32), sd * 3, 5);
          S.push(mk(br, 1.8, '#566e3e', { prof: 'tip', nb: 0, a: .8 }));
          const [bx, by] = br[br.length - 1];
          for (let j = 0; j < 5; j++) { const a = rnd(-.35, .85); L.push(mk(polar(bx, by, sd > 0 ? a : Math.PI - a, rnd(40, 64), sd * rnd(4, 12), 7), rnd(8, 11), pick(GREENS), { prof: 'leaf', nb: 3, a: rnd(.72, .9), rough: .25 })); }
        }
      }
    }
    if (ci === 1) notes.node = pts[11];
  });
  notes.title = ['Assam builds', 'with it: walls,', 'fences, bridges'];
  return { S: S.concat(L), notes };
}
// --- Plate III: tea, two leaves and a bud. A botanical close-up with veins and serrated edges
function tea() {
  const S = [], notes = {};
  const stem = qcurve(150, 478, 214, 110, -26, 16);
  S.push(mk(stem, 6.5, '#7a6a45', { prof: 'trunk', nb: 0, a: .9 }));
  const bigLeaf = (base, ang, len, w, col, seedSide) => {
    const mid = polar(base[0], base[1], ang, len, seedSide * len * .12, 12);
    const body = mk(mid, w, col, { prof: 'leaf', nb: 6, a: .82, rough: .14 });
    S.push(body, mk(mid, w * .72, mixc(col, '#2f4b2a', .25), { prof: 'leaf', nb: 3, a: .35, rough: .2 }));
    S.push(mk(mid.slice(0, 11), 1.6, '#e8e3c2', { prof: 'tip', nb: 0, a: .55 }));          // pale midrib
    for (let k = 2; k < 11; k += 1.5) {                                                    // veins, both sides
      const i = Math.floor(k), [x, y] = mid[i], a = Math.atan2(mid[i + 1][1] - y, mid[i + 1][0] - x);
      for (const sd of [-1, 1]) S.push(mk(polar(x, y, a + sd * .95, body.ws[i] * .44, sd * 3, 4), 1.1, '#3a5a33', { prof: 'tip', nb: 0, a: .42 }));
    }
    for (const sd of [-1, 1]) {                                                            // serrated edge
      const e = edgeOf(body, sd, 1.3, '#2f4b2a', .55); S.push(e);
      for (let i = 2; i < 11; i++) { const [x, y] = e.pts[i]; S.push(mk(polar(x, y, Math.atan2(body.ny[i] * sd, body.nx[i] * sd) + .9 * sd, 4, 0, 2), 1.1, '#2f4b2a', { prof: 'tip', nb: 0, a: .5 })); }
    }
    return mid;
  };
  const m1 = bigLeaf(stem[7], Math.PI * 1.07, 150, 66, '#5f8a4e', 1);
  const m2 = bigLeaf(stem[11], -Math.PI * .12, 140, 58, '#78a05d', -1);
  const tip = stem[stem.length - 1];
  const bud = qcurve(tip[0], tip[1], tip[0] + 10, tip[1] - 74, 6, 10);
  S.push(mk(bud, 27, '#a9bd8a', { prof: 'leaf', nb: 4, a: .85 }), mk(bud, 15, '#93ab74', { prof: 'leaf', nb: 0, a: .45 }));
  for (let i = 0; i < 12; i++) { const j = 2 + Math.floor(rnd(0, 7)), [x, y] = bud[j]; S.push(mk(polar(x + rnd(-5, 5), y, rnd(-2.6, -.5), rnd(5, 9), 0, 2), .8, PAPER, { prof: 'tip', nb: 0, a: .8 })); }
  notes.bud = bud[5]; notes.leaf = m1[6];
  notes.title = ['two leaves and a bud', 'the plucking standard'];
  return { S, notes };
}

// ---------------------------------------------------------------- rhino, elephant, egret (shapes from the site's own drawings)
const RHINO_D = 'M11 55 C10 51 10 48 12 46 L17 16 L28 41 C31 37 34 35 39 35 C45 33 49 30 55 26 C63 22 73 22 83 24 C95 25 104 24 110 28 C115 31 118 36 118 44 C119 48 116 50 111 50 L111 72 L101 72 L100 54 C90 57 78 59 66 58 C60 58 55 57 52 56 L52 72 L42 72 L41 54 C35 55 27 56 21 56 C16 56 12 57 11 55 Z';
const ELEPH_D = 'M22 40 C24 26 32 14 42 14 C56 14 64 14 74 16 C96 18 112 20 122 28 C126 32 126 42 122 46 L120 80 L108 80 L107 52 C90 56 70 58 54 56 L52 80 L40 80 L39 52 C34 52 30 50 28 46 C26 44 24 42 22 40 Z M22 38 C16 46 14 58 16 68 C17 74 22 76 26 72 C24 64 24 54 28 46 C30 42 28 40 22 38 Z';
function rhinoStrokes() {
  const body = [], ink = [], far = [];
  // far legs first (behind), cooler and darker
  for (const x of [58, 90]) far.push(mk(qcurve(x, 52, x, 72, 0, 6), 8, '#55514d', { prof: 'even', nb: 3, a: .85 }));
  // body washes: broad horizontal strokes, clipped to the silhouette at draw time
  // a flat base wash first (the whole silhouette), so later strokes never show paper stripes
  for (let y = 12; y <= 76; y += 7) body.push(mk(qcurve(2, y, 124, y, 0, 6), 14, '#9d958a', { prof: 'even', nb: 0, a: .5, rib: .9, rough: .05 }));
  // then curved strokes that follow the body: back-parallel near the top, belly-parallel below
  for (let i = 0; i < 34; i++) {
    const y = rnd(16, 70), t = (y - 14) / 60, x0 = rnd(2, 40), x1 = x0 + rnd(40, 90);
    const col = mixc(pick(['#9a9186', '#8c857b', '#a39a8c', '#867e74', '#968a7c']), '#4f4b47', t * .65);
    body.push(mk(qcurve(x0, y + rnd(-2, 2), Math.min(124, x1), y + rnd(-3, 3), (t < .5 ? -1 : 1) * rnd(2, 7), 10), rnd(6, 12), col, { prof: 'leaf', nb: 5, a: rnd(.3, .5), rough: .35 }));
  }
  // wet-in-wet blooms: a few soft darker and warmer pools
  for (let i = 0; i < 10; i++) { const x = rnd(20, 110), y = rnd(30, 60); body.push(mk(polar(x, y, rnd(-.5, .5), rnd(10, 22), rnd(-3, 3), 5), rnd(6, 11), pick(['#6f675e', '#a08776', '#7a7369']), { prof: 'leaf', nb: 0, a: rnd(.12, .25) })); }
  // light on the back: a paler, warmer wash where the dawn catches it
  for (let i = 0; i < 3; i++) body.push(mk(qcurve(rnd(30, 40), rnd(30, 33), rnd(100, 112), rnd(28, 31), -4, 12), rnd(4, 6), '#d8c7a8', { prof: 'leaf', nb: 4, a: .35 }));
  // shadow passes: belly, under the plates, legs
  for (let i = 0; i < 7; i++) body.push(mk(qcurve(rnd(20, 40), rnd(50, 56), rnd(95, 112), rnd(51, 57), rnd(-2, 2), 10), rnd(5, 8), '#57524d', { prof: 'leaf', nb: 3, a: .4 }));
  for (const x of [47, 106]) body.push(mk(qcurve(x, 50, x - .5, 72, 0, 6), 9.5, '#605a54', { prof: 'even', nb: 3, a: .7 }));
  // a pink-brown flush in the skin folds
  for (const x of [53, 93]) body.push(mk(qcurve(x, 26, x + (x < 60 ? -2 : 2), 56, x < 60 ? -3 : 3, 8), 4.5, '#9c8174', { prof: 'leaf', nb: 2, a: .35 }));
  // armour folds: the plates at shoulder and haunch, and the neck fold
  ink.push(mk(qcurve(55, 26, 50, 56, -7, 12), 1.3, INK2, { prof: 'tip', nb: 0, a: .62 }));
  ink.push(mk(qcurve(57, 30, 55, 48, -4, 8), .9, INK2, { prof: 'tip', nb: 0, a: .35 }));
  ink.push(mk(qcurve(91, 26, 96, 56, 7, 12), 1.3, INK2, { prof: 'tip', nb: 0, a: .62 }));
  ink.push(mk(qcurve(89, 30, 92, 48, 4, 8), .9, INK2, { prof: 'tip', nb: 0, a: .35 }));
  ink.push(mk(qcurve(33, 37, 31, 54, -3, 8), 1.1, INK2, { prof: 'tip', nb: 0, a: .65 }));
  ink.push(mk(qcurve(70, 57, 88, 56, 1.5, 6), 1, INK2, { prof: 'tip', nb: 0, a: .5 }));
  // tubercles on the haunch and shoulder plates
  for (let i = 0; i < 26; i++) { const x = rnd() < .5 ? rnd(95, 112) : rnd(36, 50), y = rnd(32, 50); ink.push(mk(polar(x, y, rnd(0, 6), 1.2, 0, 2), 1.3, '#3e3935', { prof: 'leaf', nb: 0, a: .35 })); }
  // contour in ink: horn, brow, back, rump, belly
  const C = (pts, w, a) => ink.push(mk(pts, w, INK2, { prof: 'even', nb: 0, a, rough: .4 }));
  C(qcurve(12, 46, 17, 16, -1, 8), 1.4, .85); C(qcurve(17, 16, 28, 41, -2, 8), 1.3, .8);
  C(qcurve(39, 35, 55, 26, -2, 8), 1.4, .7); C(qcurve(55, 26, 83, 24, -3, 10), 1.6, .75); C(qcurve(83, 24, 110, 28, -1, 10), 1.5, .75);
  C(qcurve(110, 28, 118, 44, -4, 8), 1.6, .8); C(qcurve(52, 56, 100, 54, 3, 12), 1.3, .55); C(qcurve(11, 55, 21, 56, 1, 4), 1.2, .6);
  C(qcurve(39, 35, 45, 33, -3, 5), 1.2, .8);
  ink.push(mk(qcurve(115, 43, 117, 62, -4, 8), 2.2, INK2, { prof: 'tip', nb: 0, a: .85 }));            // tail
  ink.push(mk(polar(24.5, 45.5, 0, 1.2, 0, 2), 2.4, '#1d1915', { prof: 'leaf', nb: 0, a: .95 }));      // eye
  return { far, body, ink };
}
function egretStrokes() {               // cattle egret, facing left, local to the rhino's back
  const S = [];
  S.push(mk(qcurve(66, 21.5, 79, 21, -4.5, 8), 7.5, '#fbf7ee', { prof: 'leaf', nb: 0, a: .97, rough: .1 }));   // body
  S.push(mk(qcurve(67, 19.5, 64, 13.8, 1.5, 6), 3.4, '#fbf7ee', { prof: 'even', nb: 0, a: .97, rough: .1 }));  // neck
  S.push(mk(qcurve(66, 19, 76, 18.2, -2.5, 6), 4.6, '#e3b46a', { prof: 'leaf', nb: 0, a: .45 }));               // buff back plumes
  S.push(mk(qcurve(66.2, 14.6, 62.6, 13.2, -.6, 4), 3.4, '#e3b46a', { prof: 'leaf', nb: 0, a: .7 }));            // buff head
  S.push(mk(qcurve(62.4, 13.6, 59.4, 14.6, 0, 3), 1.1, '#e3a52c', { prof: 'tip', nb: 0, a: .95 }));              // bill
  S.push(mk(qcurve(79, 21.2, 66, 23.7, 3.2, 8), .7, INK2, { prof: 'tip', nb: 0, a: .55 }));                      // under-edge
  S.push(mk(polar(63.4, 13.6, 0, .45, 0, 2), 1, '#1d1915', { prof: 'leaf', nb: 0, a: .9 }));                     // eye
  S.push(mk(qcurve(71, 24.3, 70.5, 23.4, 0, 2), .8, '#4a4038', { prof: 'even', nb: 0, a: .8 }));                 // tucked legs
  return S;
}

// ---------------------------------------------------------------- canvas helpers
function fitCanvas(cv, cssW, cssH, dpr = DPR) {
  const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return cv.getContext('2d');
}
const offscreen = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

// ---------------------------------------------------------------- HERO: Kaziranga, first light
// World: x roughly -560..2160, ground bottom y=900, river bank y=560. The camera fits ~1600 units on desktop and
// zooms onto the rhino on a phone; the sky is painted in screen space so it always fills the plate.
const HOR = 560, BOT = 900, RX = 1010, RK = 2.8, RY = 790 - 72 * RK;
const rhinoX = x => RX + x * RK, rhinoY = y => RY + y * RK;
function buildHero() {
  return withSeed(11, () => {
    const G = [];
    const add = (o) => G.push(o);
    // sky: screen-space gradient + cloud streaks + a muga-gold sun
    add({ id: 'sky', t0: 0, t1: .9, sky: true });
    const clouds = [[-260, 250, .8, '#b9c8c6'], [1130, 120, 1.0, '#cfc29a'], [1560, 230, .7, '#b9c8c6'], [2080, 150, 1, '#cfc29a']].map(([x, y, s, c]) => ({ x, y, S: cloud(s, c) }));
    add({ id: 'clouds', t0: .3, t1: 1.3, groups: clouds });
    add({ id: 'sun', t0: .45, t1: 1.05, sun: [1300, 330, 64], sunLow: [1290, HOR - 92, 58] });
    // hills: two blue-grey ridges (Karbi Anglong across the river)
    const ridge = (k, base, amp1, amp2, off) => { const pts = []; for (let x = -620; x <= 2220; x += 14) pts.push([x, base - amp1 * fbm(x * .0042 + off) - amp2 * fbm(x * .013 + off * 3)]); pts.push([2220, HOR + 14], [-620, HOR + 14]); return pts; };
    add({ id: 'far-hills', t0: .5, t1: 1.5, wash: ridge(1, HOR - 40, 120, 34, 2), fill: '#a7b6b8', a: .5 });
    add({ id: 'near-hills', t0: .65, t1: 1.6, wash: ridge(2, HOR - 12, 64, 26, 9), fill: '#8a9e9c', a: .55 });
    // a distant tree line on the far bank
    const trees = [];
    for (let x = -600; x < 2200; x += rnd(12, 26)) trees.push({ x, y: HOR + rnd(2, 10), S: farTree(rnd(.38, .62), ['#7b937a', '#6c8670', '#8ba187', '#5f7a62'], rnd(.8, 1.3)) });
    add({ id: 'treeline', t0: .9, t1: 1.9, groups: trees, sweep: true });
    // the Brahmaputra: a silver band with dry horizontal strokes and paper glints
    const river = [];
    for (let y = HOR + 12; y < HOR + 42; y += 5) river.push(mk(qcurve(-620, y + rnd(-2, 2), 2220, y + rnd(-2, 2), rnd(-6, 6), 40), rnd(6, 10), pick(['#a9bcc0', '#b8c8c9', '#9db2b8']), { prof: 'even', nb: 6, a: .5 }));
    for (let i = 0; i < 26; i++) { const x = rnd(-600, 2100), y = rnd(HOR + 16, HOR + 38); river.push(mk(qcurve(x, y, x + rnd(40, 140), y + rnd(-1, 1), 0, 6), rnd(1.4, 2.6), '#f6f1e4', { prof: 'even', nb: 0, a: rnd(.5, .85) })); }
    add({ id: 'river', t0: 1.15, t1: 1.9, S: river, sweep: true });
    // floodplain grassland
    const ground = []; for (let x = -620; x <= 2220; x += 20) ground.push([x, HOR + 38 + 6 * fbm(x * .01)]); ground.push([2220, BOT + 60], [-620, BOT + 60]);
    add({ id: 'ground', t0: 1.1, t1: 1.9, wash: ground, grad: [['#d3cb98', 0], ['#b4b479', .35], ['#90a061', 1]], a: .62 });
    const mid = [];
    for (let i = 0; i < 150; i++) { const y = rnd(HOR + 48, 800), d = (y - HOR) / (BOT - HOR); mid.push({ x: rnd(-600, 2200), y, S: tussock(.35 + d * .6, d < .4 ? ['#a7a774', '#b7b07a', '#97a06a'] : ['#8f9a58', '#a2a564', '#7d8a4e', '#b8ab6a'], 10, .9) }); }
    mid.sort((a, b) => a.y - b.y);
    add({ id: 'midgrass', t0: 1.4, t1: 2.4, groups: mid, sweep: true });
    // an elephant in the middle distance, atmospheric (no ink)
    const eleph = [];
    for (let y = 12; y < 84; y += 8) eleph.push(mk(qcurve(8, y, 130, y, 0, 6), 13, '#98a1a2', { prof: 'even', nb: 0, a: .5, rough: .05 }));
    for (let i = 0; i < 16; i++) { const y = rnd(16, 76), x0 = rnd(8, 60); eleph.push(mk(qcurve(x0, y, x0 + rnd(40, 70), y + rnd(-3, 3), rnd(-5, 5), 8), rnd(6, 10), pick(['#8e989a', '#848f93', '#7c878b']), { prof: 'leaf', nb: 3, a: rnd(.25, .4) })); }
    add({ id: 'elephant-shadow', t0: 1.75, t1: 2.0, shadow: [480, 668, 46, 4] });
    add({ id: 'elephant', t0: 1.75, t1: 2.35, clipPath: ELEPH_D, at: [430, 668 - 80 * .82, .82], S: eleph });
    // the rhino: washes (clipped to the silhouette), then ink, then the egret
    const R = rhinoStrokes();
    add({ id: 'rhino-shadow', t0: 1.9, t1: 2.2, shadow: [rhinoX(66), 792, 150, 9] });
    add({ id: 'rhino-far', t0: 1.95, t1: 2.3, S: R.far, at: [RX, RY, RK] });
    add({ id: 'rhino', t0: 2.0, t1: 2.9, clipPath: RHINO_D, at: [RX, RY, RK], S: R.body });
    add({ id: 'rhino-ink', t0: 2.7, t1: 3.3, S: R.ink, at: [RX, RY, RK] });
    add({ id: 'egret', t0: 3.15, t1: 3.5, S: egretStrokes(), at: [RX, RY, RK] });
    // foreground: tall elephant grass, swaying once painted (kept clear of the rhino's body)
    const fg = [];
    for (let x = -560; x < 2180; x += rnd(46, 92)) {
      const inRhino = x > rhinoX(5) && x < rhinoX(122);
      fg.push({ x, y: BOT + rnd(-8, 14), S: inRhino ? tussock(1.3, ['#7d8a4e', '#8f9a58', '#6c7d45'], 14, 1.2) : elephantGrass(rnd(.75, 1.1)), ph: rnd(0, 6.28) });
    }
    add({ id: 'fg', t0: 2.4, t1: 3.4, groups: fg, sweep: true, sway: true });
    // notes
    add({ id: 'notes', t0: 3.4, t1: 4.3, notes: [
      { txt: 'Rhinoceros unicornis', x: rhinoX(-28), y: rhinoY(-6), to: [rhinoX(30), rhinoY(30)], bend: 26, size: 34 },
      { txt: 'cattle egret, along for the ride', x: rhinoX(118), y: rhinoY(-14), to: [rhinoX(80), rhinoY(16)], bend: -22, size: 28, wide: true },
      { txt: 'Brahmaputra', x: 210, y: HOR + 27, mono: true, wide: true },
      { txt: 'Kaziranga · first light', x: 1520, y: HOR + 27, mono: true, wide: true },
    ] });
    return G;
  });
}

function heroController() {
  const cv = document.getElementById('hero'); if (!cv) return null;
  const G = buildHero(), END = 4.3;
  let cam = null, cssW = 0, cssH = 0, ctx = null, bake = null, bakeUpTo = -1, t0 = null, painted = REDUCE, raf = 0, visible = true, swayers = null;
  const paths = {};
  const pathOf = d => paths[d] || (paths[d] = new Path2D(d));

  const heroEl = cv.parentElement, textEl = heroEl.querySelector('.hero__text');
  const narrow = () => cssW < 700;
  function camera() {
    const vis = narrow() ? clamp(cssW * 1.25, 460, 900) : Math.max(1600, cssW / 1.05);
    const s = cssW / vis;
    const cx = lerp(rhinoX(66) - 30, 800, ss(seg(vis, 600, 1500)));
    const ground = (BOT - HOR) * s, textBottom = textEl.offsetTop + textEl.offsetHeight;
    const hor = Math.max(cssH - ground, textBottom + (narrow() ? 120 : 64) * Math.max(s, .7));
    return { s, ox: cssW / 2 - cx * s, oy: hor - HOR * s, x0: cx - vis / 2, x1: cx + vis / 2, need: Math.ceil(hor + ground) };
  }
  const setWorld = c => c.setTransform(cam.s * DPR, 0, 0, cam.s * DPR, cam.ox * DPR, cam.oy * DPR);
  const setScreen = c => c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const inView = (x0, x1) => x1 > cam.x0 - 40 && x0 < cam.x1 + 40;

  // draws one group at progress p (0..1). 'sweep' groups reveal left to right across the visible window.
  function drawGroup(c, g, p, t) {
    if (p <= 0) return;
    if (g.sky) {
      setScreen(c); const hy = cam.oy + HOR * cam.s;
      const grd = c.createLinearGradient(0, 0, 0, hy);
      grd.addColorStop(0, rgba('#bfd0cb', .55 * p)); grd.addColorStop(.55, rgba('#e4dcc0', .5 * p)); grd.addColorStop(1, rgba('#efcf92', .75 * p));
      c.fillStyle = grd; c.fillRect(0, 0, cssW, hy + 2); return;
    }
    setWorld(c);
    if (g.sun) {
      const [x, y, r] = narrow() ? g.sunLow : g.sun, a = ss(p);
      withSeed(77, () => {
        c.beginPath(); c.arc(x, y, r * 1.9, 0, 7); c.fillStyle = rgba('#f0cf86', .22 * a); c.fill();
        c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = rgba('#eab95c', .78 * a); c.fill();
        for (let i = 0; i < 7; i++) { const yy = -r * .8 + i * r * .27, hw = Math.sqrt(Math.max(0, r * r - yy * yy)) - 4; drawS(c, mk(qcurve(x - hw, y + yy, x + hw, y + yy + rnd(-2, 2), 0, 8), 6, '#d6953e', { prof: 'even', nb: 3, a: .32 }), 1, null, a); }
      });
      return;
    }
    if (g.wash) {
      c.save();
      if (p < 1) { const sx = lerp(cam.x0 - 80, cam.x1 + 80, eio(p)); c.beginPath(); c.moveTo(-700, -200); for (let y = -200; y <= 1100; y += 40) c.lineTo(sx + 26 * Math.sin(y * .05), y); c.lineTo(-700, 1100); c.closePath(); c.clip(); }
      let fill = g.fill;
      if (g.grad) { const gr = c.createLinearGradient(0, HOR, 0, BOT); for (const [col, o] of g.grad) gr.addColorStop(o, col); fill = gr; }
      washPoly(c, g.wash, fill, g.a, 3, 5, 3);
      c.restore(); return;
    }
    if (g.shadow) { const [x, y, rx, ry] = g.shadow; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fillStyle = rgba('#4d5a3a', .28 * ss(p)); c.fill(); return; }
    if (g.notes) { drawNotes(c, g.notes, p); return; }
    if (g.groups) {
      const N = g.groups.length;
      g.groups.forEach((it, i) => {
        if (!inView(it.x - 160, it.x + 160)) return;
        const local = g.sweep ? clamp((lerp(cam.x0 - 200, cam.x1 + 200, p) - it.x) / 260) : clamp(p * 1.4 - i / N * .4);
        if (local <= 0) return;
        if (g.sway && painted && !REDUCE) {
          const sk = .045 * (Math.sin(1.15 * t + it.ph) + .4 * Math.sin(2.7 * t + 2 * it.ph));
          c.setTransform(cam.s * DPR, 0, -sk * cam.s * DPR, cam.s * DPR, (cam.ox + it.x * cam.s) * DPR, (cam.oy + it.y * cam.s) * DPR);
        } else c.setTransform(cam.s * DPR, 0, 0, cam.s * DPR, (cam.ox + it.x * cam.s) * DPR, (cam.oy + it.y * cam.s) * DPR);
        drawList(c, it.S, local);
      });
      return;
    }
    if (g.at) { const [x, y, k] = g.at; c.transform(k, 0, 0, k, x, y); }
    if (g.clipPath) {
      // reserve the animal's shape with an unpainted-paper fill first, so grass behind it never shows through
      c.save(); c.clip(pathOf(g.clipPath)); c.fillStyle = rgba(PAPER, .94 * ss(p * 3)); c.fill(pathOf(g.clipPath));
      drawList(c, g.S, p); c.restore();
    }
    else if (g.sweep) { const sx = lerp(cam.x0 - 100, cam.x1 + 100, eio(p)); for (const s of g.S) drawS(c, s, clamp((sx - s.pts[0][0]) / 600)); }
    else drawList(c, g.S, p);
  }
  function drawNotes(c, N, p) {
    N.forEach((n, i) => {
      const q = clamp(p * 1.6 - i * .2); if (q <= 0) return;
      const nl = n.bend < 0 ? n.x - 380 : n.x, nr = n.bend < 0 ? n.x : n.x + (n.mono ? 220 : 380);
      if (n.wide && (cam.x1 - cam.x0 < 1000 || !(nl > cam.x0 + 10 && nr < cam.x1 - 10))) return;
      setWorld(c);
      const k = 1 / Math.max(cam.s, .55);          // keep handwriting readable when the camera is zoomed out
      if (n.mono) {
        c.save(); c.font = `400 ${11 * k}px "IBM Plex Mono", monospace`; c.fillStyle = rgba(n.txt.startsWith('Brahma') ? '#5f7a82' : INK2, .7 * ss(q));
        c.letterSpacing = `${2.2 * k}px`; c.fillText(n.txt.toUpperCase(), n.x, n.y); c.restore(); return;
      }
      if (n.to) leader(c, Math.max(n.x, cam.x0 + 14 / cam.s) + (n.bend > 0 ? 70 : -40) * k * .6, n.y + 14 * k, n.to[0], n.to[1], seg(q, .35, 1), n.bend, { lw: 1.4 * k, a: .65 });
      const nx = n.bend < 0 ? n.x : Math.max(n.x, cam.x0 + 14 / cam.s);
      hand(c, n.txt, nx, n.y, seg(q, 0, .7), { size: n.size * k * .62 + 6, align: n.bend < 0 ? 'right' : 'left' });
    });
  }

  // finished groups are baked into one offscreen canvas, in z order; only the unfinished tail is drawn per frame
  function frame(now) {
    raf = 0;
    const t = REDUCE ? END : (now - t0) / 1000;
    if (!painted && t >= END) { painted = true; document.documentElement.classList.add('painted'); }
    const firstSway = G.findIndex(g => g.sway);
    const limit = painted ? firstSway : G.length;
    while (bakeUpTo + 1 < limit && t >= G[bakeUpTo + 1].t1) { bakeUpTo++; drawGroup(bake.getContext('2d'), G[bakeUpTo], 1, t); }
    setScreen(ctx); ctx.clearRect(0, 0, cssW, cssH);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bake, 0, 0);
    for (let i = bakeUpTo + 1; i < G.length; i++) { const g = G[i]; drawGroup(ctx, g, (t - g.t0) / (g.t1 - g.t0), t); }
    if (!REDUCE && visible && (!painted || firstSway >= 0)) raf = requestAnimationFrame(frame);
  }
  function resize(force) {
    const r = cv.getBoundingClientRect();
    if (!force && Math.abs(r.width - cssW) < 1 && Math.abs(r.height - cssH) < 80) return;
    cssW = r.width; cssH = r.height; cam = camera();
    if (cam.need > cssH + 1) { heroEl.style.height = cam.need + 'px'; cssH = cam.need; cam = camera(); }
    ctx = fitCanvas(cv, cssW, cssH);
    bake = offscreen(cv.width, cv.height); bakeUpTo = -1;
    if (painted) {                                  // re-bake everything static at the new size
      const firstSway = G.findIndex(g => g.sway);
      while (bakeUpTo + 1 < firstSway) { bakeUpTo++; drawGroup(bake.getContext('2d'), G[bakeUpTo], 1, 0); }
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  return {
    start() {
      resize(true);
      t0 = performance.now();
      if (REDUCE) { painted = true; document.documentElement.classList.add('painted'); }
      setTimeout(() => document.querySelector('.hero__text')?.classList.add('on'), REDUCE ? 0 : 1600);
      let to; addEventListener('resize', () => { clearTimeout(to); to = setTimeout(() => resize(false), 150); }, { passive: true });
      new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }).observe(cv);
    },
  };
}

// ---------------------------------------------------------------- PLATES: paint in as they scroll into view
const PLATES = { jolokia, bamboo, tea };
function plateController(cv) {
  const kind = cv.dataset.plate, spec = withSeed({ jolokia: 21, bamboo: 22, tea: 23 }[kind], PLATES[kind]);
  const LW = 360, LH = 480;
  let p = REDUCE ? 1 : 0, shown = -1, cssW = 0, cssH = 0, ctx = null;
  function layout() {
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    cssW = r.width; cssH = r.height; ctx = fitCanvas(cv, cssW, cssH); shown = -1; draw();
  }
  function draw() {
    if (!ctx || p === shown) return; shown = p;
    const k = Math.min(cssW / LW, cssH / LH), ox = (cssW - LW * k) / 2, oy = cssH - LH * k;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, cssW, cssH);
    ctx.setTransform(k * DPR, 0, 0, k * DPR, ox * DPR, oy * DPR);
    drawList(ctx, spec.S, ss(seg(p, 0, .82)));
    const q = seg(p, .78, 1), n = spec.notes;
    const fs = Math.max(25, Math.min(34, 15 / k));
    if (kind === 'jolokia') {
      hand(ctx, n.title[0], 18, 34, q, { size: fs + 4, w: 600 }); hand(ctx, n.title[1], 18, 34 + fs * 1.15, seg(q, .15, 1), { size: fs });
      hand(ctx, n.title[2], 18, 34 + fs * 2.3, seg(q, .3, 1), { size: fs - 3, col: '#9c3328' });
      leader(ctx, 70, 34 + fs * 2.7, n.pod[0] + 6, n.pod[1], seg(q, .4, 1), -26);
    } else if (kind === 'bamboo') {
      n.title.forEach((l, i) => hand(ctx, l, 14, 392 + i * fs * 1.1, seg(q, i * .15, 1), { size: fs }));
    } else {
      hand(ctx, n.title[0], LW - 10, 410, q, { size: fs + 4, w: 600, align: 'right' }); hand(ctx, n.title[1], LW - 10, 410 + fs * 1.15, seg(q, .2, 1), { size: fs - 2, align: 'right' });
    }
  }
  function onScroll() {
    if (p >= 1) return;
    const r = cv.getBoundingClientRect(), vh = innerHeight;
    const target = clamp((vh * .98 - r.top) / (vh * .62));
    if (target > p) { p = target; draw(); }
  }
  return { layout, onScroll, done: () => p >= 1 };
}

// ---------------------------------------------------------------- EVENING: dusk over the field station, then night
function eveningController() {
  const wrap = document.querySelector('.evening'), cv = document.getElementById('evening'); if (!cv) return null;
  let lastW = 0, lastH = 0;
  function paint() {
    const r = wrap.getBoundingClientRect(), W = r.width, H = r.height;
    if (Math.abs(W - lastW) < 1 && Math.abs(H - lastH) < 4) return; lastW = W; lastH = H;
    const dpr = 1, c = fitCanvas(cv, W, H, dpr);              // washes are soft: 1x is plenty and keeps memory low
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const last = wrap.querySelector('.last'), nightTop = last.offsetTop, night0 = nightTop + Math.min(120, H * .05), night1 = nightTop + Math.min(300, H * .12);
    const DUSK = ['#efcfa6', '#e6b896', '#d9a08c'], NIGHT = ['#24314f', '#2b3a5c', '#1f2b47'];
    const colAt = y => {
      if (y < night0) { const u = y / night0; return [mixc(mixc(DUSK[0], DUSK[1], u), DUSK[2], u * u), .07 + .3 * ss(seg(y, 0, night0 * .7)) + .08 * ss(seg(y, night0 * .7, night0))]; }
      const u = ss(seg(y, night0, night1));
      return [mixc(DUSK[2], NIGHT[0], u), lerp(.45, .9, u)];
    };
    withSeed(31, () => {
      // body of the wash: a vertical gradient, painted twice with ragged edges
      const g = c.createLinearGradient(0, 0, 0, H);
      for (let i = 0; i <= 20; i++) { const y = H * i / 20, [col, a] = colAt(y); g.addColorStop(i / 20, rgba(col, a * .75)); }
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // brushed rows on top, so it reads as paint
      for (let y = 0; y < H + 30; y += 15) {
        const [col, a] = colAt(y);
        for (let x = -60; x < W + 60; x += rnd(260, 420)) drawS(c, mk(qcurve(x, y + rnd(-4, 4), x + rnd(340, 560), y + rnd(-6, 6), rnd(-10, 10), 14), rnd(22, 34), mixc(col, pick(DUSK.concat(NIGHT)), y > night0 ? .25 : .1), { prof: 'leaf', nb: 6, a: a * .32 }));
      }
      // moon: unpainted paper, with a soft halo
      const mx = W * (W < 700 ? .78 : .8), my = nightTop + Math.min(170, H * .06) + 40, mr = W < 700 ? 30 : 44;
      const halo = c.createRadialGradient(mx, my, mr, mx, my, mr * 4.5); halo.addColorStop(0, rgba(PAPER, .2)); halo.addColorStop(1, rgba(PAPER, 0));
      c.fillStyle = halo; c.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
      const moon = []; for (let a = 0; a < 6.3; a += .2) moon.push([mx + Math.cos(a) * mr, my + Math.sin(a) * mr]);
      washPoly(c, moon, PAPER, .95, 3, 1.4, 5);
      c.beginPath(); c.arc(mx + mr * .25, my - mr * .1, mr * .3, 0, 7); c.fillStyle = rgba('#d9cfbb', .28); c.fill();
      c.beginPath(); c.arc(mx - mr * .35, my + mr * .3, mr * .16, 0, 7); c.fill();
      // stars
      for (let i = 0; i < Math.round(W / 9); i++) { const x = rnd(0, W), y = rnd(night1, H * .92); c.beginPath(); c.arc(x, y, rnd(.5, 1.5), 0, 7); c.fillStyle = rgba(PAPER, rnd(.25, .8)); c.fill(); }
      // a bamboo grove against the night, both edges
      for (const [x, sc, flip] of [[W * .02, W < 700 ? .55 : .85, 1], [W * .98, W < 700 ? .5 : .78, -1]]) {
        const b = bamboo(['#141b2b', '#182034', '#10172a']);
        c.save(); c.translate(x, H + 6); c.scale(sc * flip, sc); c.translate(-200, -480);
        drawList(c, b.S, 1, '#121a2b'); c.restore();
      }
    });
  }
  return { paint };
}

// ---------------------------------------------------------------- boot
function boot() {
  const hero = heroController();
  const plates = [...document.querySelectorAll('canvas[data-plate]')].map(plateController);
  const evening = eveningController();
  hero && hero.start();
  plates.forEach(pl => { pl.layout(); pl.onScroll(); });
  evening && evening.paint();
  let ticking = false;
  addEventListener('scroll', () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; plates.forEach(pl => pl.onScroll()); }); }, { passive: true });
  let to; addEventListener('resize', () => { clearTimeout(to); to = setTimeout(() => { plates.forEach(pl => pl.layout()); evening && evening.paint(); }, 150); }, { passive: true });
  if ('ResizeObserver' in window && evening) new ResizeObserver(() => evening.paint()).observe(document.querySelector('.evening'));
}
// paint once the handwriting face is ready, so the notes don't flash in a fallback font
const ready = document.fonts && document.fonts.load ? Promise.all(['500 30px Caveat', '600 30px Caveat', '400 12px "IBM Plex Mono"'].map(f => document.fonts.load(f))).catch(() => {}) : Promise.resolve();
Promise.race([ready, new Promise(r => setTimeout(r, 1200))]).then(boot);
})();
