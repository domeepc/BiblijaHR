// Every cross reference as its own arc, coloured by distance, over a bar per chapter
// (after Chris Harrison's "Bible Cross-References"). Drawn on canvas: ~68 000 arcs.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Book, Refs } from '../lib/shared';

const W = 1200, H = 560, BASE = 424, X0 = 16, XW = 1168, BAR = 92, RY = 0.66;
const MIN_VOTES = 5;
const BINS = 36;

type Props = {
  books: Book[]; k: number[]; r: Refs; vb: Int16Array;
  center: number; neighbours: number[]; hover: number;
  onHover: (i: number) => void; onPick: (i: number) => void;
};

const hue = (t: number) => 285 - 265 * Math.sqrt(t); // short: violet → long: orange-red

export default function ArcDiagram({ books, k, r, vb, center, neighbours, hover, onHover, onPick }: Props) {
  const n = k.length;
  const xAt = (i: number) => X0 + ((i + 0.5) / n) * XW;
  const wrap = useRef<HTMLDivElement>(null);
  const baseCv = useRef<HTMLCanvasElement>(null);
  const topCv = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverCh, setHoverCh] = useState(-1);

  // chapters and arcs, computed once
  const data = useMemo(() => {
    const chapters: { b: number; ch: number; s: number; c: number }[] = [];
    books.forEach((B, b) => {
      let s = B.s;
      B.chs.forEach((ch, j) => { chapters.push({ b, ch, s, c: B.vc[j] }); s += B.vc[j]; });
    });
    const vch = new Int16Array(n);
    chapters.forEach((c, j) => vch.fill(j, c.s, c.s + c.c));

    const best = new Map<number, number>();
    r.forEach((list, i) => {
      if (!list) return;
      for (let j = 0; j < list.length; j += 3) {
        const a = Math.min(i, list[j]), b = Math.max(i, list[j]);
        if (a === b) continue;
        const key = a * n + b;
        if ((best.get(key) ?? 0) < list[j + 2]) best.set(key, list[j + 2]);
      }
    });
    const pairs: number[] = [];
    best.forEach((v, key) => { if (v >= MIN_VOTES) pairs.push(Math.floor(key / n), key % n); });
    const arcs = Int32Array.from(pairs);
    const perChapter = new Int32Array(chapters.length);
    for (let j = 0; j < arcs.length; j += 2) {
      perChapter[vch[arcs[j]]]++;
      if (vch[arcs[j + 1]] !== vch[arcs[j]]) perChapter[vch[arcs[j + 1]]]++;
    }
    const maxC = Math.max(...chapters.map((c) => c.c));
    return { chapters, vch, arcs, perChapter, maxC };
  }, [books, k, r]);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(wrap.current!);
    return () => ro.disconnect();
  }, []);

  const arc = (ctx: CanvasRenderingContext2D, a: number, b: number) => {
    const x1 = xAt(a), x2 = xAt(b), rx = (x2 - x1) / 2;
    ctx.moveTo(x1, BASE);
    ctx.ellipse(x1 + rx, BASE, rx, rx * RY, 0, Math.PI, 2 * Math.PI);
  };

  function setup(cv: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1, s = width / W;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(H * s * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    return { ctx, s };
  }

  // base layer: all arcs + chapter bars + book labels
  useEffect(() => {
    if (!width) return;
    const { ctx, s } = setup(baseCv.current!);
    const { chapters, arcs, maxC } = data;
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, W, H);

    const bins: number[][] = Array.from({ length: BINS }, () => []);
    for (let j = 0; j < arcs.length; j += 2) {
      const t = (arcs[j + 1] - arcs[j]) / n;
      bins[Math.min(BINS - 1, Math.floor(Math.sqrt(t) * BINS))].push(arcs[j], arcs[j + 1]);
    }
    // Long arcs first, short ones on top. Plain alpha blending (not 'lighter'): the dense
    // New Testament region would otherwise burn out to white.
    ctx.lineWidth = 0.7 / s;
    for (let bi = BINS - 1; bi >= 0; bi--) {
      const list = bins[bi], t = ((bi + 0.5) / BINS) ** 2;
      ctx.strokeStyle = `hsla(${hue(t)}, 75%, 60%, ${0.018 + 0.03 * (bi / BINS)})`;
      ctx.beginPath();
      for (let j = 0; j < list.length; j += 2) arc(ctx, list[j], list[j + 1]);
      ctx.stroke();
    }

    chapters.forEach((c) => {
      const x = X0 + (c.s / n) * XW, w = (c.c / n) * XW;
      ctx.fillStyle = c.b % 2 ? '#8a8a8a' : '#d8d8d8';
      ctx.fillRect(x, BASE + 4, Math.max(w - 0.25, 0.25), (c.c / maxC) * BAR);
    });
    ctx.fillStyle = '#8f8a80';
    ctx.font = '10px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    books.forEach((B) => {
      const w = (B.c / n) * XW;
      if (w * s >= 18) ctx.fillText(B.a, X0 + ((B.s + B.c / 2) / n) * XW, BASE + BAR + 26);
    });
  }, [width, data]);

  // top layer: hovered chapter, the centre verse and its neighbours
  useEffect(() => {
    if (!width) return;
    const { ctx, s } = setup(topCv.current!);
    ctx.clearRect(0, 0, W, H);
    const { chapters, vch, arcs, maxC } = data;
    if (hoverCh >= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 0.8 / s;
      ctx.beginPath();
      for (let j = 0; j < arcs.length; j += 2) {
        if (vch[arcs[j]] === hoverCh || vch[arcs[j + 1]] === hoverCh) arc(ctx, arcs[j], arcs[j + 1]);
      }
      ctx.stroke();
      const c = chapters[hoverCh];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X0 + (c.s / n) * XW, BASE + 4, Math.max((c.c / n) * XW, 1.5), (c.c / maxC) * BAR);
    }
    neighbours.forEach((i) => {
      const hot = hover === i;
      ctx.strokeStyle = hot ? '#ffffff' : 'rgba(255,255,255,0.85)';
      ctx.lineWidth = (hot ? 2.6 : 1.4) / s;
      ctx.globalAlpha = hover === -1 || hot ? 1 : 0.25;
      ctx.beginPath();
      arc(ctx, Math.min(center, i), Math.max(center, i));
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(xAt(center) - 1 / s, BASE - 10, 2 / s, 14 + BAR);
  }, [width, data, center, neighbours, hover, hoverCh]);

  const verseAt = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * W;
    return Math.min(n - 1, Math.max(0, Math.floor(((lx - X0) / XW) * n)));
  };

  const hc = hoverCh >= 0 ? data.chapters[hoverCh] : null;
  const fmt = (x: number) => x.toLocaleString('hr-HR');

  return (
    <section class="panel arc-panel" aria-labelledby="arc-h">
      <div class="panel-head">
        <div>
          <h2 id="arc-h">Od Postanka do Otkrivenja</h2>
          <p aria-live="polite" class={hc ? 'on' : ''}>
            {hc
              ? `${books[hc.b].n} ${hc.ch} · ${fmt(data.perChapter[hoverCh])} veza · klik za središte grafa`
              : `${fmt(data.arcs.length / 2)} unakrsnih referenci, svaka je jedan luk. Trake su glave, visina = broj redaka.`}
          </p>
        </div>
        <div class="legend">
          <span><i class="l grad" />kratke → duge veze</span>
          <span><i class="l" style="background:#fff" />{`${books[vb[center]].a} ${Math.floor(k[center] / 1000)},${k[center] % 1000}`}</span>
        </div>
      </div>
      <div class="arc-canvas" ref={wrap}
        onMouseMove={(e) => { const c = data.vch[verseAt(e)]; if (c !== hoverCh) setHoverCh(c); }}
        onMouseLeave={() => { setHoverCh(-1); onHover(-1); }}
        onClick={(e) => onPick(data.chapters[data.vch[verseAt(e)]].s)}>
        <canvas ref={baseCv} aria-hidden="true" />
        <canvas ref={topCv} role="img" aria-label={`Lučni dijagram: ${fmt(data.arcs.length / 2)} unakrsnih referenci kroz cijelu Bibliju`} />
      </div>
    </section>
  );
}
