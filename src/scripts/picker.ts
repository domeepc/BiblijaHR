// Header picker: three boxes — Knjiga, Glava, Redak — each with its own dropdown.
// Picking a book opens the chapters, picking a chapter opens the verses; a verse (or
// "Cijela glava") navigates. Clicking outside after picking a chapter goes to that chapter;
// Escape cancels. On the network page the picker steers the graph instead of navigating.
import { fold } from '../lib/shared';

type B = { n: string; a: string; slug: string; t: 0 | 1; chs: number[]; vc: number[] };
type Key = 'book' | 'ch' | 'v';
type Pos = { b: number | null; ch: number | null; v: number | null };

export function initPicker() {
  const root = document.querySelector<HTMLElement>('.picker');
  if (!root) return;
  const books: B[] = JSON.parse(document.getElementById('books-json')!.textContent!);
  const base = document.documentElement.dataset.base!;
  const onNet = document.body.dataset.page === 'net';

  const el = (k: Key) => ({
    btn: document.getElementById(`pick-${k}-btn`) as HTMLButtonElement,
    panel: document.getElementById(`pick-${k}-panel`) as HTMLElement,
  });
  const box = { book: el('book'), ch: el('ch'), v: el('v') };
  const filter = box.book.panel.querySelector<HTMLInputElement>('.pick-filter')!;
  const bookList = box.book.panel.querySelector<HTMLUListElement>('.pick-list')!;
  const preview = box.v.panel.querySelector<HTMLElement>('[data-preview]')!;

  const hashVerse = () => +(location.hash.match(/^#v(\d+)$/)?.[1] ?? 0) || null;
  let cur: Pos = {
    b: root.dataset.b ? +root.dataset.b : null,
    ch: root.dataset.ch ? +root.dataset.ch : null,
    v: root.dataset.b ? hashVerse() : null,
  };
  let draft: Pos = { ...cur };
  let open: Key | null = null;
  let bookOpts: number[] = [];
  let active = -1;
  const texts = new Map<number, string[] | 'loading'>();

  // ---------- display ----------
  function show() {
    const set = (k: Key, text: string) => { box[k].btn.querySelector('[data-value]')!.textContent = text; };
    set('book', draft.b != null ? books[draft.b].n : 'Odaberi');
    set('ch', draft.ch != null ? String(draft.ch) : '—');
    set('v', draft.v != null ? String(draft.v) : '—');
    box.ch.btn.disabled = draft.b == null;
    box.v.btn.disabled = draft.ch == null;
  }

  function place(panel: HTMLElement) {
    panel.style.left = '0px';
    const r = panel.getBoundingClientRect();
    let shift = 0;
    if (r.right > window.innerWidth - 12) shift = window.innerWidth - 12 - r.right;
    if (r.left + shift < 12) shift = 12 - r.left;
    panel.style.left = `${shift}px`;
  }

  function openPanel(k: Key) {
    if (open && open !== k) hide(open);
    open = k;
    const { btn, panel } = box[k];
    if (k === 'book') renderBooks('');
    if (k === 'ch') renderChapters();
    if (k === 'v') renderVerses();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    place(panel);
    if (k === 'book') { filter.value = ''; filter.focus(); }
    else (panel.querySelector<HTMLElement>('[aria-current="true"]') ?? panel.querySelector<HTMLElement>('.pick-grid button'))?.focus();
  }

  function hide(k: Key) {
    box[k].panel.hidden = true;
    box[k].btn.setAttribute('aria-expanded', 'false');
    if (open === k) open = null;
  }

  /** Close whatever is open. commit: go where the draft points; otherwise fall back to the current place. */
  function dismiss(commit: boolean) {
    if (!open) return;
    const k = open;
    hide(k);
    const changed = draft.b !== cur.b || draft.ch !== cur.ch;
    if (commit && changed && draft.b != null) {
      go(draft.b, draft.ch ?? books[draft.b].chs[0], 0);
    } else {
      draft = { ...cur };
      show();
    }
    if (!commit) box[k].btn.focus();
  }

  // ---------- navigation ----------
  function go(b: number, ch: number, v: number) {
    if (open) hide(open);
    if (onNet) {
      window.dispatchEvent(new CustomEvent('biblija:goto', { detail: { b, ch, v } }));
      cur = { b, ch, v: v || 1 };
      draft = { ...cur };
      show();
      return;
    }
    const path = `${base}${books[b].slug}/${ch}/`;
    if (location.pathname === path) {          // same chapter: just move within the page
      if (v) location.hash = `v${v}`;
      else { history.pushState(null, '', path); window.scrollTo({ top: 0 }); }
      cur = { b, ch, v: v || null };
      draft = { ...cur };
      show();
      return;
    }
    location.href = path + (v ? `#v${v}` : '');
  }

  // ---------- book list ----------
  function renderBooks(q: string) {
    const key = fold(q);
    bookOpts = books.map((_, i) => i).filter((i) => {
      if (!key) return true;
      const b = books[i];
      return fold(b.a).startsWith(key) || fold(b.n).startsWith(key) || b.n.split(/\s+/).some((w) => fold(w).startsWith(key));
    });
    active = key && bookOpts.length ? 0 : bookOpts.indexOf(draft.b ?? -1);
    bookList.replaceChildren();
    let lastT = -1;
    bookOpts.forEach((i, j) => {
      const b = books[i];
      if (b.t !== lastT) {
        lastT = b.t;
        const h = document.createElement('li');
        h.className = 'pick-head'; h.setAttribute('role', 'presentation');
        h.textContent = b.t ? 'Novi zavjet' : 'Stari zavjet';
        bookList.append(h);
      }
      const li = document.createElement('li');
      li.id = `pick-book-${j}`;
      li.className = 'opt';
      li.setAttribute('role', 'option');
      const dot = document.createElement('span'); dot.className = `opt-dot ${b.t ? 'nt' : 'ot'}`;
      const name = document.createElement('span'); name.className = 'opt-main'; name.textContent = b.n;
      const sub = document.createElement('span'); sub.className = 'opt-sub'; sub.textContent = `${b.chs.length} gl.`;
      li.append(dot, name, sub);
      li.addEventListener('mousemove', () => { if (active !== j) { active = j; markBook(); } });
      li.addEventListener('click', () => pickBook(i));
      bookList.append(li);
    });
    if (!bookOpts.length) {
      const li = document.createElement('li');
      li.className = 'pick-empty'; li.setAttribute('role', 'presentation'); li.textContent = 'Nema takve knjige.';
      bookList.append(li);
    }
    markBook();
  }

  function markBook() {
    bookList.querySelectorAll('[role="option"]').forEach((li, j) => {
      li.setAttribute('aria-selected', String(j === active));
      li.toggleAttribute('data-current', bookOpts[j] === cur.b);
    });
    const li = active >= 0 ? document.getElementById(`pick-book-${active}`) : null;
    if (li) { filter.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
    else filter.removeAttribute('aria-activedescendant');
  }

  function pickBook(i: number) {
    draft = { b: i, ch: null, v: null };
    show();
    if (books[i].chs.length === 1) { draft.ch = books[i].chs[0]; show(); openPanel('v'); }
    else openPanel('ch');
  }

  filter.addEventListener('input', () => renderBooks(filter.value));
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, bookOpts.length - 1); markBook(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); markBook(); }
    else if (e.key === 'Enter' && bookOpts[active] != null) { e.preventDefault(); pickBook(bookOpts[active]); }
  });

  // ---------- number grids ----------
  function grid(k: 'ch' | 'v', title: string, nums: number[], current: number | null, pick: (n: number) => void, hover?: (n: number) => void) {
    const panel = box[k].panel;
    panel.querySelector('[data-title]')!.textContent = title;
    const g = panel.querySelector<HTMLElement>('[data-grid]')!;
    g.replaceChildren();
    for (const n of nums) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(n);
      b.setAttribute('aria-label', `${k === 'ch' ? 'Glava' : 'Redak'} ${n}`);
      if (n === current) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => pick(n));
      if (hover) { b.addEventListener('mouseenter', () => hover(n)); b.addEventListener('focus', () => hover(n)); }
      g.append(b);
    }
  }

  function renderChapters() {
    const B = books[draft.b!];
    grid('ch', `${B.n} · odaberite glavu`, B.chs, draft.b === cur.b ? cur.ch : null, (ch) => {
      draft = { b: draft.b, ch, v: null };
      show();
      openPanel('v');
    });
  }

  function loadText(b: number) {
    if (texts.has(b)) return;
    texts.set(b, 'loading');
    fetch(`${base}data/text/${b}.json`).then((r) => r.json())
      .then((t: string[]) => texts.set(b, t))
      .catch(() => texts.delete(b));
  }

  function renderVerses() {
    const b = draft.b!, B = books[b], ci = B.chs.indexOf(draft.ch!);
    const offset = B.vc.slice(0, ci).reduce((s, x) => s + x, 0);
    loadText(b);
    preview.textContent = 'Prijeđite mišem preko broja da vidite redak.';
    const nums = Array.from({ length: B.vc[ci] }, (_, j) => j + 1);
    const same = draft.b === cur.b && draft.ch === cur.ch;
    grid('v', `${B.n} ${draft.ch} · odaberite redak`, nums, same ? cur.v : null,
      (v) => go(b, draft.ch!, v),
      (v) => {
        const t = texts.get(b);
        preview.textContent = Array.isArray(t) ? `${v} ${t[offset + v - 1]}` : '…';
      });
  }

  box.v.panel.querySelector('[data-whole]')!.addEventListener('click', () => go(draft.b!, draft.ch!, 0));

  // ---------- wiring ----------
  (['book', 'ch', 'v'] as Key[]).forEach((k) => {
    box[k].btn.addEventListener('click', () => (open === k ? dismiss(false) : openPanel(k)));
  });
  document.addEventListener('pointerdown', (e) => {
    if (open && !root.contains(e.target as Node)) dismiss(true);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); dismiss(false); }
  });
  window.addEventListener('resize', () => { if (open) place(box[open].panel); });
  window.addEventListener('hashchange', () => {
    if (onNet || cur.b == null) return;
    cur = { ...cur, v: hashVerse() };
    draft = { ...cur };
    show();
  });
  // the network island reports the verse it shows
  window.addEventListener('biblija:at', (e) => {
    const { b, ch, v } = (e as CustomEvent).detail;
    cur = { b, ch, v };
    if (!open) { draft = { ...cur }; show(); }
  });
  show();
}
