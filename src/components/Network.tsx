import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import ArcDiagram from './ArcDiagram';
import {
  adjacency, bookIndexOfVerse, chapterHref, chapterOf, findVerse, refLabel, reverseRefs, verseOf,
  type Book, type Link, type Refs,
} from '../lib/shared';

type GraphData = { books: Book[]; k: number[]; r: Refs; m: [number, number, number][] };
type Neighbour = { i: number; w: number; span: number; dir?: Link['dir']; shared?: number; direct?: boolean };

const CX = 340, CY = 320, R = 240;               // radial graph geometry (viewBox 680×640)
const MAX_NODES = 18;
const DIR: Record<Link['dir'], string> = { out: 'navodi', in: 'navodi ga', both: 'obostrano' };
const fmt = (x: number) => x.toLocaleString('hr-HR');

function useGraph(base: string) {
  const [g, setG] = useState<null | (GraphData & { vb: Int16Array; rev: number[][]; nRefs: number })>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`${base}data/graph.json`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: GraphData) => {
        const nRefs = d.r.reduce((s: number, l) => s + (l ? l.length / 3 : 0), 0);
        setG({ ...d, vb: bookIndexOfVerse(d.books), rev: reverseRefs(d.r), nRefs });
      })
      .catch((e) => setErr(String(e)));
  }, [base]);
  return { g, err };
}

export default function Network({ base }: { base: string }) {
  const { g, err } = useGraph(base);
  const [center, setCenter] = useState(-1);
  const [mode, setMode] = useState<'direct' | 'similar'>('direct');
  const [minV, setMinV] = useState(5);
  const [hover, setHover] = useState(-1);
  const [hoverChord, setHoverChord] = useState('');
  const [texts, setTexts] = useState<Record<number, string[]>>({});
  const loading = useRef(new Set<number>());
  const adjCache = useRef(new Map<string, Map<number, Link>>());

  const adj = (i: number, v: number) => {
    const key = `${i}:${v}`;
    let m = adjCache.current.get(key);
    if (!m) {
      if (adjCache.current.size > 4000) adjCache.current.clear();
      m = adjacency(g!.r, g!.rev, i, v);
      adjCache.current.set(key, m);
    }
    return m;
  };

  // initial verse: ?v=slug.ch.v, else the last verse read, else Iv 3,16
  useEffect(() => {
    if (!g) return;
    const fromParam = new URLSearchParams(location.search).get('v');
    let last = null;
    try { last = localStorage.getItem('biblija:last'); } catch {}
    for (const s of [fromParam, last, 'iv.3.16']) {
      if (!s) continue;
      const [slug, ch, v] = s.split('.');
      const b = g.books.findIndex((x) => x.slug === slug);
      if (b < 0) continue;
      const i = findVerse(g.books, g.k, b, +ch, +v || 1);
      if (i >= 0) { setCenter(i); break; }
    }
  }, [g]);

  // the header's search and selects steer the graph on this page
  useEffect(() => {
    if (!g) return;
    const onGoto = (e: Event) => {
      const { b, ch, v } = (e as CustomEvent).detail;
      const i = findVerse(g.books, g.k, b, ch, v || 1);
      if (i >= 0) go(i);
    };
    window.addEventListener('biblija:goto', onGoto);
    return () => window.removeEventListener('biblija:goto', onGoto);
  }, [g]);

  const go = (i: number) => {
    setCenter(i); setHover(-1); setHoverChord('');
  };

  // keep the URL and the header's picker in step with the centre verse
  useEffect(() => {
    if (!g || center < 0) return;
    const b = g.vb[center], ch = chapterOf(g.k, center), v = verseOf(g.k, center);
    history.replaceState(null, '', `?v=${g.books[b].slug}.${ch}.${v}`);
    window.dispatchEvent(new CustomEvent('biblija:at', { detail: { b, ch, v } }));
  }, [g, center]);

  const nb: Neighbour[] = useMemo(() => {
    if (!g || center < 0) return [];
    const A = adj(center, minV);
    if (mode === 'direct') {
      return [...A.values()].sort((a, b) => b.v - a.v).slice(0, MAX_NODES).map((l) => ({ i: l.i, w: l.v, span: l.span, dir: l.dir }));
    }
    const score = new Map<number, number>();
    A.forEach((_, j) => adj(j, minV).forEach((__, m) => { if (m !== center) score.set(m, (score.get(m) || 0) + 1); }));
    const list: Neighbour[] = [];
    score.forEach((s, m) => {
      if (s < 2) return;
      list.push({ i: m, w: s / (A.size + adj(m, minV).size - s), shared: s, span: 0, direct: A.has(m) });
    });
    return list.sort((a, b) => b.w - a.w || b.shared! - a.shared!).slice(0, MAX_NODES);
  }, [g, center, mode, minV]);

  // fetch the text shards of every book on screen
  useEffect(() => {
    if (!g || center < 0) return;
    const need = new Set([g.vb[center], ...nb.map((x) => g.vb[x.i])]);
    need.forEach((b) => {
      if (texts[b] || loading.current.has(b)) return;
      loading.current.add(b);
      fetch(`${base}data/text/${b}.json`).then((r) => r.json()).then((t: string[]) => {
        loading.current.delete(b);
        setTexts((prev) => ({ ...prev, [b]: t }));
      }).catch(() => loading.current.delete(b));
    });
  }, [g, center, nb]);

  if (err) return <p class="loading">Podatke nije moguće učitati ({err}).</p>;
  if (!g || center < 0) return <p class="loading">Učitavam mrežu unakrsnih referenci…</p>;

  const { books, vb, k } = g;
  const n = k.length;
  const ref =(i: number, span = 0) => refLabel(books, vb, k, i, span);
  const text = (i: number) => texts[vb[i]]?.[i - books[vb[i]].s] ?? '…';
  const color = (i: number) => (books[vb[i]].t ? 'var(--nt)' : 'var(--ot)');
  const cb = vb[center];
  const isDirect = mode === 'direct';

  const chordEnds = hoverChord ? hoverChord.split('-').map(Number) : [];
  const anyHover = hover !== -1 || chordEnds.length > 0;

  // ----- radial graph -----
  const ordered = [...nb].sort((a, b) => a.i - b.i);
  const maxW = nb.reduce((m, x) => Math.max(m, x.w), 0) || 1;
  const pos = new Map<number, [number, number, number]>();
  ordered.forEach((x, j) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * j) / Math.max(ordered.length, 1);
    pos.set(x.i, [CX + R * Math.cos(ang), CY + R * Math.sin(ang), ang]);
  });
  const chords: { key: string; a: number; b: number; d: string; v: number }[] = [];
  for (let a = 0; a < ordered.length; a++) {
    const A = adj(ordered[a].i, minV);
    for (let b = a + 1; b < ordered.length; b++) {
      const e = A.get(ordered[b].i);
      if (!e) continue;
      const p = pos.get(ordered[a].i)!, q = pos.get(ordered[b].i)!;
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const qx = mx + (CX - mx) * 0.55, qy = my + (CY - my) * 0.55;
      chords.push({ key: `${ordered[a].i}-${ordered[b].i}`, a: ordered[a].i, b: ordered[b].i, v: e.v,
        d: `M${p[0].toFixed(1)} ${p[1].toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${q[0].toFixed(1)} ${q[1].toFixed(1)}` });
    }
  }

  // ----- active link readout -----
  let link: null | { a: number; b: number; bSpan: number; meta: string } = null;
  if (chordEnds.length === 2) {
    const e = adj(chordEnds[0], minV).get(chordEnds[1]);
    link = { a: chordEnds[0], b: chordEnds[1], bSpan: 0, meta: `${e ? e.v + ' glasova · ' : ''}veza između dva susjeda` };
  } else if (hover !== -1) {
    const x = nb.find((y) => y.i === hover);
    if (x) link = { a: center, b: x.i, bSpan: x.span,
      meta: isDirect ? `${x.w} glasova · ${DIR[x.dir!]}` : `${x.shared} zajedničkih referenci · sličnost ${x.w.toFixed(2)}` };
  }

  const neighbourIds = nb.map((x) => x.i);
  const enter = (i: number) => () => setHover(i);
  const leave = () => setHover(-1);

  return (
    <>
      <section class="net-hero">
        <div>
          <p class="overline">Unakrsne reference</p>
          <h1>Kako se Pismo poziva samo na sebe</h1>
          <p>Svaki luk je jedna unakrsna referenca, od Postanka do Otkrivenja; boja kazuje koliko su povezani retci udaljeni. Ispod je graf odabranog retka: izravne veze ili stihovi srodni po zajedničkim referencama.</p>
        </div>
        <dl class="stats">
          <dt>knjiga</dt><dd>66</dd>
          <dt>redaka</dt><dd>{fmt(n)}</dd>
          <dt>veza</dt><dd>{fmt(g.nRefs)}</dd>
        </dl>
      </section>

      <ArcDiagram books={books} k={k} r={g.r} vb={vb} center={center} neighbours={neighbourIds}
        hover={hover} onHover={setHover} onPick={go} />

      <section class="net-grid">
        <div class="panel graph-panel">
          <div class="panel-head">
            <h2>Graf retka {ref(center)}</h2>
            <div class="seg small" role="group" aria-label="Vrsta veze">
              <button type="button" aria-pressed={isDirect} onClick={() => { setMode('direct'); setHover(-1); }}>Izravne reference</button>
              <button type="button" aria-pressed={!isDirect} onClick={() => { setMode('similar'); setHover(-1); }}>Srodni stihovi</button>
            </div>
          </div>
          <svg class="chart" viewBox="0 0 680 640" role="img" aria-label={`Graf veza za ${ref(center)}: ${nb.length} stihova`}>
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" stroke-dasharray="2 6" />
            {chords.map((c) => {
              const hot = hoverChord === c.key, touches = hover === c.a || hover === c.b;
              const o = hot ? 1 : chordEnds.length ? 0.05 : hover === -1 ? 0.35 : touches ? 0.8 : 0.06;
              return <path d={c.d} fill="none" stroke={hot ? '#fff' : 'var(--cross)'} opacity={o} stroke-width={Math.min(1 + c.v / 40, 3) + (hot ? 1.5 : 0)} pointer-events="none" />;
            })}
            {ordered.map((x) => {
              const [px, py] = pos.get(x.i)!, t = x.w / maxW, hot = hover === x.i;
              const o = !anyHover ? 0.35 + 0.55 * t : hot ? 1 : chordEnds.includes(x.i) ? 0.3 : 0.07;
              return (
                <>
                  <line x1={CX} y1={CY} x2={px} y2={py} stroke={color(x.i)} opacity={o} stroke-width={1 + 4 * t + (hot ? 1.5 : 0)} pointer-events="none" />
                  <line class="hit" x1={CX} y1={CY} x2={px} y2={py} stroke-width="12" style="cursor:pointer" onMouseEnter={enter(x.i)} onMouseLeave={leave} onClick={() => go(x.i)} />
                </>
              );
            })}
            {chords.map((c) => (
              <path class="hit" d={c.d} stroke-width="10" style="cursor:crosshair" onMouseEnter={() => setHoverChord(c.key)} onMouseLeave={() => setHoverChord('')} />
            ))}
            {ordered.map((x) => {
              const [px, py, ang] = pos.get(x.i)!, t = x.w / maxW, cos = Math.cos(ang);
              const hot = hover === x.i || chordEnds.includes(x.i), dim = anyHover && !hot;
              return (
                <g style="cursor:pointer" onMouseEnter={enter(x.i)} onMouseLeave={leave} onClick={() => go(x.i)}>
                  <title>{`${ref(x.i, x.span)} — ${text(x.i)}`}</title>
                  <circle cx={px} cy={py} r="22" fill="transparent" />
                  <circle cx={px} cy={py} r={6 + 9 * t + (hot ? 2 : 0)} fill={color(x.i)} stroke={hot ? '#fff' : 'var(--card)'} stroke-width="2" />
                  <text x={CX + (R + 22) * cos} y={CY + (R + 22) * Math.sin(ang)} fill={dim ? '#6e6a62' : 'var(--ink)'} font-size="14" font-weight="500"
                    text-anchor={Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end'} dominant-baseline="middle">{ref(x.i, x.span)}</text>
                </g>
              );
            })}
            <circle cx={CX} cy={CY} r="32" fill="var(--bg)" stroke={color(center)} stroke-width="3" />
            <text x={CX} y={CY} fill="var(--ink)" font-size="13" font-weight="600" text-anchor="middle" dominant-baseline="middle">{ref(center)}</text>
            {nb.length === 0 && <text x={CX} y="400" fill="var(--muted)" font-size="14" text-anchor="middle">Nema veza iznad odabranog praga – smanjite broj glasova.</text>}
          </svg>

          <div class={`readout${link ? ' on' : ''}`} aria-live="polite">
            {link ? (
              <>
                <div class="readout-top">
                  <strong style={{ color: color(link.a) }}>{ref(link.a)}</strong>
                  <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true"><path d="M2 5h24" stroke="var(--cross)" stroke-width="1.6" stroke-linecap="round" /><circle cx="2" cy="5" r="2.5" fill={color(link.a)} /><circle cx="26" cy="5" r="2.5" fill={color(link.b)} /></svg>
                  <strong style={{ color: color(link.b) }}>{ref(link.b, link.bSpan)}</strong>
                  <span>· {link.meta}</span>
                </div>
                <div class="readout-texts"><p>{text(link.a)}</p><p>{text(link.b)}</p></div>
              </>
            ) : <p class="hint">Prijeđite mišem preko linije ili čvora da aktivirate pojedinu vezu.</p>}
          </div>

          <div class="slider">
            <label for="mv"><span>Najmanje glasova za vezu</span><strong>{minV}</strong></label>
            <input id="mv" type="range" min="3" max="60" step="1" value={minV} onInput={(e) => setMinV(+(e.target as HTMLInputElement).value)} />
            <p>{isDirect
              ? 'Stihovi koji navode ovaj redak ili ih on navodi. Debljina linije = broj glasova.'
              : 'Stihovi s najviše zajedničkih referenci (korelacija po susjedstvu), i kad nisu izravno povezani.'}</p>
          </div>
        </div>

        <aside class="side">
          <article class="panel verse-card">
            <div class="top">
              <p class="ref" style={{ color: color(center) }}>{books[cb].n} {chapterOf(k, center)},{verseOf(k, center)}</p>
              <div style="display:flex;gap:6px">
                <button class="round-btn" type="button" aria-label="Prethodni redak" onClick={() => center > 0 && go(center - 1)}>
                  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <button class="round-btn" type="button" aria-label="Sljedeći redak" onClick={() => center < n - 1 && go(center + 1)}>
                  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                </button>
              </div>
            </div>
            <p class="text">{text(center)}</p>
            <div class="foot">
              <span>{adj(center, 3).size} veza u bazi</span>
              <a class="btn-light" href={chapterHref(base, books[cb], chapterOf(k, center), verseOf(k, center))}>Čitaj u kontekstu</a>
            </div>
          </article>

          <h3>{isDirect ? 'Izravno povezani stihovi' : 'Srodni stihovi · Jaccardova sličnost'} · {nb.length}</h3>
          <ul class="link-list">
            {nb.map((x) => (
              <li>
                <button type="button" class={hover === x.i ? 'on' : ''} onClick={() => go(x.i)} onMouseEnter={enter(x.i)} onMouseLeave={leave}>
                  <span class="row">
                    <strong style={{ color: color(x.i) }}>{ref(x.i, x.span)}</strong>
                    <span>{isDirect ? `${x.w} glasova · ${DIR[x.dir!]}` : `${x.shared} zajedničkih${x.direct ? ' · izravna veza' : ''}`}</span>
                  </span>
                  <span class="snip clamp2">{text(x.i)}</span>
                  <span class="meter"><i style={{ width: `${Math.round((x.w / maxW) * 100)}%`, background: color(x.i) }} /></span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </>
  );
}
