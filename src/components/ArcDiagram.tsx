// Every cross reference as its own arc, coloured by distance, over a bar per chapter
// (after Chris Harrison's "Bible Cross-References"). Drawn on canvas: ~68 000 arcs.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { refLabel, type Book, type Refs } from '../lib/shared';

const W = 1200, H = 560, BASE = 424, X0 = 16, XW = 1168, BAR = 92, RY = 0.66;
const MIN_VOTES = 3;
const BINS = 36;

type Props = {
  books: Book[]; k: number[]; r: Refs; vb: Int16Array;
  center: number; neighbours: number[]; hover: number;
  onHover: (i: number) => void; onPick: (i: number) => void;
  theme?: 'dark' | 'paper'; poster?: string; variant?: 'explorer' | 'atlas';
};

const hue = (t: number) => 285 - 265 * Math.sqrt(t); // short: violet → long: orange-red

export default function ArcDiagram({ books, k, r, vb, center, neighbours, hover, onHover, onPick, theme = 'dark', poster, variant = 'explorer' }: Props) {
  const n = k.length;
  const xAt = (i: number) => X0 + ((i + 0.5) / n) * XW;
  const wrap = useRef<HTMLDivElement>(null);
  const baseCv = useRef<HTMLCanvasElement>(null);
  const topCv = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverCh, setHoverCh] = useState(-1);
  const [baseReady, setBaseReady] = useState(false);

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
    const dpr = Math.min(window.devicePixelRatio || 1, 2), s = width / W;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(H * s * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    return { ctx, s };
  }

  // base layer: all arcs + chapter bars + book labels
  useEffect(() => {
    if (!width) return;
    setBaseReady(false);
    const { ctx, s } = setup(baseCv.current!);
    const { chapters, arcs, maxC } = data;
    ctx.fillStyle = theme === 'paper' ? '#f6f2e8' : '#05060a';
    ctx.fillRect(0, 0, W, H);
    const density = theme === 'paper' ? Math.min(1, 7500 / (arcs.length / 2)) : 1;

    const bins: [number[], number[]][] = Array.from({ length: BINS }, () => [[], []]);
    for (let j = 0; j < arcs.length; j += 2) {
      const t = (arcs[j + 1] - arcs[j]) / n;
      const testament = books[vb[arcs[j]]].t;
      bins[Math.min(BINS - 1, Math.floor(Math.sqrt(t) * BINS))][testament].push(arcs[j], arcs[j + 1]);
    }
    // Render in small batches so the poster stays visible and pointer/scroll input
    // remains responsive while the full 125k-arc map is drawn.
    ctx.lineWidth = 0.7 / s;
    const orderedBins = bins.flatMap((pair, bi) => [
      { bi, testament: 0, list: pair[0] },
      { bi, testament: 1, list: pair[1] },
    ]).reverse();
    let binIndex = 0, offset = 0, frame = 0;
    const drawBatch = () => {
      let remaining = 2800;
      while (binIndex < orderedBins.length && remaining > 0) {
        const { bi, testament, list } = orderedBins[binIndex];
        if (offset >= list.length / 2) { binIndex++; offset = 0; continue; }
        const take = Math.min(remaining, list.length / 2 - offset);
        const t = ((bi + 0.5) / BINS) ** 2;
        const alpha = (0.018 + 0.03 * (bi / BINS)) * density;
        ctx.strokeStyle = theme === 'paper'
          ? (testament === 0 ? `rgba(189, 72, 24, ${alpha})` : `rgba(39, 88, 140, ${alpha})`)
          : `hsla(${hue(t)}, 75%, 60%, ${alpha})`;
        ctx.beginPath();
        for (let j = 0; j < take; j++) {
          const pair = (offset + j) * 2;
          arc(ctx, list[pair], list[pair + 1]);
        }
        ctx.stroke();
        offset += take;
        remaining -= take;
      }
      if (binIndex < orderedBins.length) frame = requestAnimationFrame(drawBatch);
      else setBaseReady(true);
    };
    frame = requestAnimationFrame(drawBatch);

    chapters.forEach((c) => {
      const x = X0 + (c.s / n) * XW, w = (c.c / n) * XW;
      ctx.fillStyle = theme === 'paper' ? (c.b < 39 ? '#c98a67' : '#7899bc') : (c.b % 2 ? '#8a8a8a' : '#d8d8d8');
      ctx.fillRect(x, BASE + 4, Math.max(w - 0.25, 0.25), (c.c / maxC) * BAR);
    });
    ctx.fillStyle = theme === 'paper' ? '#5b574f' : '#8f8a80';
    ctx.font = '10px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    books.forEach((B) => {
      const w = (B.c / n) * XW;
      if (w * s >= 18) ctx.fillText(B.a, X0 + ((B.s + B.c / 2) / n) * XW, BASE + BAR + 26);
    });
    return () => cancelAnimationFrame(frame);
  }, [width, data, theme]);

  // top layer: hovered chapter, the centre verse and its neighbours
  useEffect(() => {
    if (!width) return;
    const { ctx, s } = setup(topCv.current!);
    ctx.clearRect(0, 0, W, H);
    const { chapters, vch, arcs, maxC } = data;
    if (hoverCh >= 0) {
      ctx.strokeStyle = theme === 'paper' ? 'rgba(31, 39, 44, 0.34)' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 0.8 / s;
      ctx.beginPath();
      for (let j = 0; j < arcs.length; j += 2) {
        if (vch[arcs[j]] === hoverCh || vch[arcs[j + 1]] === hoverCh) arc(ctx, arcs[j], arcs[j + 1]);
      }
      ctx.stroke();
      const c = chapters[hoverCh];
      ctx.fillStyle = theme === 'paper' ? '#b65a2d' : '#ffffff';
      ctx.fillRect(X0 + (c.s / n) * XW, BASE + 4, Math.max((c.c / n) * XW, 1.5), (c.c / maxC) * BAR);
    }
    neighbours.forEach((i) => {
      const hot = hover === i;
      ctx.strokeStyle = hot ? (theme === 'paper' ? '#191916' : '#ffffff') : (theme === 'paper' ? 'rgba(25,25,22,0.75)' : 'rgba(255,255,255,0.85)');
      ctx.lineWidth = (hot ? 2.6 : 1.4) / s;
      ctx.globalAlpha = hover === -1 || hot ? 1 : 0.25;
      ctx.beginPath();
      arc(ctx, Math.min(center, i), Math.max(center, i));
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme === 'paper' ? '#191916' : '#ffffff';
    ctx.fillRect(xAt(center) - 1 / s, BASE - 10, 2 / s, 14 + BAR);
  }, [width, data, center, neighbours, hover, hoverCh, theme]);

  const verseAt = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * W;
    return Math.min(n - 1, Math.max(0, Math.floor(((lx - X0) / XW) * n)));
  };

  const hc = hoverCh >= 0 ? data.chapters[hoverCh] : null;
  const fmt = (x: number) => x.toLocaleString('hr-HR');
  const selectedRef = refLabel(books, vb, k, center);
  const onMapKey = (event: KeyboardEvent) => {
    let next = center;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(n - 1, center + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, center - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = n - 1;
    else return;
    event.preventDefault();
    onPick(next);
  };

  return (
    <section class={`panel arc-panel arc-panel-${variant} arc-theme-${theme}`} aria-labelledby="arc-h">
      <div class="panel-head">
        <div>
          <h2 id="arc-h" class={variant === 'atlas' ? 'sr-only' : ''}>{variant === 'atlas' ? 'Mreža svih biblijskih knjiga' : 'Od Postanka do Otkrivenja'}</h2>
          <p aria-live="polite" class={hc ? 'on' : ''}>
            {hc
              ? `${books[hc.b].n} ${hc.ch} · ${fmt(data.perChapter[hoverCh])} veza · klik za središte grafa`
              : `${fmt(data.arcs.length / 2)} unakrsnih referenci, svaka je jedan luk. Trake su glave, visina = broj redaka.`}
          </p>
        </div>
        <div class="legend">
          <span><i class="l old-key" />Stari zavjet</span>
          <span><i class="l new-key" />Novi zavjet</span>
          <span><i class="l center-key" style={{ background: theme === 'paper' ? '#191916' : '#fff' }} />{`${books[vb[center]].a} ${Math.floor(k[center] / 1000)},${k[center] % 1000}`}</span>
        </div>
      </div>
      <div class="arc-canvas" ref={wrap} data-ready={baseReady}
        role="slider" tabIndex={0} aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={n - 1} aria-valuenow={center} aria-valuetext={selectedRef}
        aria-label="Odabrani redak na karti svih unakrsnih referenci"
        onMouseMove={(e) => { const c = data.vch[verseAt(e)]; if (c !== hoverCh) setHoverCh(c); }}
        onMouseLeave={() => { setHoverCh(-1); onHover(-1); }}
        onClick={(e) => onPick(verseAt(e))}
        onKeyDown={onMapKey}>
        {poster && <img class="arc-poster" src={poster} alt="" aria-hidden="true" width="1200" height="560" loading={variant === 'atlas' ? 'lazy' : 'eager'} />}
        <canvas ref={baseCv} aria-hidden="true" />
        <canvas ref={topCv} aria-hidden="true" />
      </div>
    </section>
  );
}
