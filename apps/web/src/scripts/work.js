/* /work/ — category filter. Progressive enhancement: without JS the filter
   chips are #filter-<cat> anchors handled by CSS :target (see work.js page). */

const nav = document.querySelector('[data-work-filter]');
const grid = document.querySelector('.work-grid');

if (nav && grid) {
  const items = [...grid.children];
  const buttons = [...nav.querySelectorAll('a[data-filter]')];
  const status = document.getElementById('work-status');
  const valid = new Set(buttons.map((b) => b.dataset.filter));

  const apply = (cat, updateUrl) => {
    if (!valid.has(cat)) cat = 'all';
    let shown = 0;
    for (const li of items) {
      const on = cat === 'all' || li.dataset.cat === cat;
      li.hidden = !on;
      if (on) { shown++; li.classList.add('is-in'); }
    }
    for (const b of buttons) {
      if (b.dataset.filter === cat) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    }
    if (status) status.textContent = `Showing ${shown} project${shown === 1 ? '' : 's'}`;
    if (updateUrl) history.replaceState(null, '', cat === 'all' ? location.pathname : `#filter-${cat}`);
  };

  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-filter]');
    if (!a) return;
    e.preventDefault();
    apply(a.dataset.filter, true);
  });

  const m = location.hash.match(/^#filter-([\w-]+)$/);
  if (m) apply(m[1], false);
}

/* Arrived from the home-page project reel (its last case leads here): a deliberate
   pull upward past the top of /work/ goes back to the reel. Only for visitors who
   came from "/", so a direct visit to /work/ scrolls like any other page. */
const fromHome = (() => {
  try {
    const r = new URL(document.referrer);
    return r.origin === location.origin && r.pathname === '/';
  } catch {
    return false;
  }
})();

if (fromHome) {
  const PULL = 240; // px of upward wheel travel while already at the top
  const SETTLE = 350; // ignore momentum that has only just reached the top
  let atTopSince = scrollY <= 0 ? performance.now() : 0;
  let pull = 0;
  let lastWheel = 0;
  let gone = false;
  const back = () => {
    if (gone) return;
    gone = true;
    if (history.length > 1) history.back();
    else location.assign('/');
  };

  // A pull-down at the top would otherwise trigger the browser's pull-to-refresh.
  document.documentElement.style.overscrollBehaviorY = 'contain';

  addEventListener('scroll', () => {
    if (scrollY <= 0) atTopSince ||= performance.now();
    else { atTopSince = 0; pull = 0; }
  }, { passive: true });

  addEventListener('wheel', (e) => {
    if (scrollY > 0 || e.deltaY >= 0) { pull = 0; return; }
    const now = performance.now();
    if (!atTopSince || now - atTopSince < SETTLE) return;
    if (now - lastWheel > 400) pull = 0; // a new gesture starts counting from zero
    lastWheel = now;
    pull += -e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    if (pull >= PULL) back();
  }, { passive: true });

  let touchY = null;
  addEventListener('touchstart', (e) => { touchY = scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
  addEventListener('touchend', (e) => {
    if (touchY === null || scrollY > 0) return;
    if (e.changedTouches[0].clientY - touchY >= 120) back();
    touchY = null;
  }, { passive: true });
}
