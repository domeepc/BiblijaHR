// Reading preferences (theme, size, font), the "Aa" panel, and the "Čitanje" link back to the last chapter.

export function initPrefs() {
  const html = document.documentElement;
  const base = html.dataset.base!;

  const last = localStorage.getItem('biblija:last');
  if (last) {
    const [slug, ch, v] = last.split('.');
    document.querySelectorAll<HTMLAnchorElement>('[data-read-link]').forEach((a) => {
      a.href = `${base}${slug}/${ch}/` + (+v ? `#v${v}` : '');
    });
  }

  const prefs = (() => { try { return JSON.parse(localStorage.getItem('biblija:prefs') || '{}'); } catch { return {}; } })();
  const save = () => { try { localStorage.setItem('biblija:prefs', JSON.stringify(prefs)); } catch {} };
  const sizeOut = document.querySelector<HTMLOutputElement>('[data-size-out]');
  function sync() {
    document.querySelectorAll<HTMLElement>('[data-theme-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themePick === html.dataset.theme)));
    document.querySelectorAll<HTMLElement>('[data-font-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fontPick === html.dataset.font)));
    if (sizeOut) sizeOut.textContent = `${prefs.size || 20} px`;
  }
  document.querySelectorAll<HTMLElement>('[data-theme-pick]').forEach((b) => b.addEventListener('click', () => {
    html.dataset.theme = prefs.theme = b.dataset.themePick; save(); sync();
  }));
  document.querySelectorAll<HTMLElement>('[data-font-pick]').forEach((b) => b.addEventListener('click', () => {
    html.dataset.font = prefs.font = b.dataset.fontPick; save(); sync();
  }));
  document.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.addEventListener('click', () => {
    prefs.size = Math.min(30, Math.max(14, (prefs.size || 20) + +b.dataset.size!));
    html.style.setProperty('--reader-size', prefs.size + 'px'); save(); sync();
  }));
  sync();

  // keep the appearance panel under its "Aa" button (the CSS position is only the no-JS fallback)
  const panel = document.getElementById('appearance');
  const aa = document.querySelector<HTMLElement>('[popovertarget="appearance"]');
  if (panel && aa) {
    const place = () => {
      const r = aa.getBoundingClientRect(), w = panel.offsetWidth;
      panel.style.right = 'auto';
      panel.style.left = `${Math.min(Math.max(r.right - w, 12), window.innerWidth - w - 12)}px`;
      panel.style.top = `${r.bottom + 8}px`;
    };
    panel.addEventListener('toggle', (e) => { if ((e as ToggleEvent).newState === 'open') place(); });
    const again = () => { if (panel.matches(':popover-open')) place(); };
    window.addEventListener('resize', again);
    window.addEventListener('scroll', again, { passive: true });
  }
}
