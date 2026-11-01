import { useEffect, useMemo, useState } from 'preact/hooks';
import ArcDiagram from './ArcDiagram';
import {
  adjacency, bookIndexOfVerse, chapterOf, findVerse, refLabel, reverseRefs, verseOf,
  type Book, type Refs,
} from '../lib/shared';

type GraphData = { books: Book[]; k: number[]; r: Refs };
const Arrow = () => <svg class="atlas-arrow" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 15 15 5M6 5h9v9" /></svg>;

export default function NetworkOverview({ base, poster }: { base: string; poster: string }) {
  const [graph, setGraph] = useState<null | (GraphData & { vb: Int16Array; rev: number[][] })>(null);
  const [error, setError] = useState('');
  const [center, setCenter] = useState(-1);
  const [verseText, setVerseText] = useState('');
  const [texts, setTexts] = useState<Record<number, string[]>>({});

  useEffect(() => {
    fetch(`${base}data/graph.json`)
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then((data: GraphData) => {
        const next = { ...data, vb: bookIndexOfVerse(data.books), rev: reverseRefs(data.r) };
        setGraph(next);
        const fromUrl = new URLSearchParams(location.search).get('v');
        let last = null;
        try { last = localStorage.getItem('biblija:last'); } catch {}
        for (const target of [fromUrl, last, 'iv.3.16']) {
          if (!target) continue;
          const [slug, chapter, verse] = target.split('.');
          const book = next.books.findIndex((item) => item.slug === slug);
          const found = book < 0 ? -1 : findVerse(next.books, next.k, book, +chapter, +verse || 1);
          if (found >= 0) { setCenter(found); break; }
        }
      })
      .catch((cause) => setError(String(cause)));
  }, [base]);

  useEffect(() => {
    if (!graph || center < 0) return;
    let active = true;
    const b = graph.vb[center];
    if (texts[b]) { setVerseText(texts[b][center - graph.books[b].s] || ''); return; }
    fetch(`${base}data/text/${b}.json`)
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then((items: string[]) => {
        if (!active) return;
        setTexts((current) => ({ ...current, [b]: items }));
        setVerseText(items[center - graph.books[b].s] || '');
      })
      .catch(() => { if (active) setVerseText(''); });
    return () => { active = false; };
  }, [base, graph, center]);

  useEffect(() => {
    if (!graph) return;
    const onGoto = (event: Event) => {
      const { b, ch, v } = (event as CustomEvent).detail;
      const next = findVerse(graph.books, graph.k, b, ch, v || 1);
      if (next >= 0) setCenter(next);
    };
    window.addEventListener('biblija:goto', onGoto);
    return () => window.removeEventListener('biblija:goto', onGoto);
  }, [graph]);

  const refs = useMemo(() => {
    if (!graph || center < 0) return [];
    return [...adjacency(graph.r, graph.rev, center, 3).values()].sort((a, b) => b.v - a.v);
  }, [graph, center]);

  if (!graph || center < 0) {
    return (
      <section class="atlas-network" id="whole-network" aria-labelledby="network-title">
        <div class="atlas-network-heading">
          <div><p class="section-label">66 knjiga · unakrsne reference</p><h2 id="network-title">Sve povezuje jedna priča.</h2></div>
          <p>Svaki luk prikazuje unakrsnu referencu; narančasta označava Stari zavjet, plava Novi. Odaberite mjesto na karti za detalje.</p>
        </div>
        {error ? (
          <div class="atlas-network-loading">
            <img src={poster} alt="Lučni prikaz unakrsnih referenci kroz svih 66 knjiga Biblije" width="1200" height="560" />
            <p>Mrežu nije moguće učitati. {error}</p>
          </div>
        ) : (
          <div class="atlas-network-loading">
            <img src={poster} alt="Lučni prikaz unakrsnih referenci kroz svih 66 knjiga Biblije" width="1200" height="560" loading="lazy" />
            <p aria-live="polite">Učitavam interaktivnu mrežu…</p>
          </div>
        )}
      </section>
    );
  }

  const bookIndex = graph.vb[center];
  const book = graph.books[bookIndex];
  const chapter = chapterOf(graph.k, center);
  const verse = verseOf(graph.k, center);
  const reference = refLabel(graph.books, graph.vb, graph.k, center);
  const neighbours = refs.slice(0, 18).map((item) => item.i);
  const readHref = `${base}${book.slug}/${chapter}/#v${verse}`;

  return (
    <section class="atlas-network" id="whole-network" aria-labelledby="network-title">
      <div class="atlas-network-heading">
        <div><p class="section-label">66 knjiga · unakrsne reference</p><h2 id="network-title">Sve povezuje jedna priča.</h2></div>
        <p>Svaki luk prikazuje unakrsnu referencu; narančasta označava Stari zavjet, plava Novi. Odaberite mjesto na karti za detalje.</p>
      </div>
      <ArcDiagram
        books={graph.books} k={graph.k} r={graph.r} vb={graph.vb}
        center={center} neighbours={neighbours} hover={-1} onHover={() => {}}
        onPick={setCenter} theme="paper" poster={poster} variant="atlas"
      />
      <div class="atlas-network-selection" aria-live="polite">
        <div><span class="selection-ref">{reference}</span><span class="selection-count">{refs.length.toLocaleString('hr-HR')} veza</span><p>{verseText || 'Odabrani redak'}</p></div>
        <div class="selection-actions">
          <a class="text-link" href={readHref}>Čitaj u kontekstu <Arrow /></a>
          <a class="atlas-primary" href={`${base}mreza/?v=${book.slug}.${chapter}.${verse}`}>Otvori detaljnu mrežu <Arrow /></a>
        </div>
      </div>
    </section>
  );
}
