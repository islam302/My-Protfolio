/* Shared behaviour for every page: mobile nav toggle and scroll reveals. */

const toggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('site-nav');

if (toggle && nav) {
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
    setOpen(false);
    // Return focus to the toggle if it was inside the menu that just closed.
    if (nav.contains(document.activeElement)) toggle.focus();
  });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  matchMedia('(min-width: 861px)').addEventListener('change', () => setOpen(false));
}

const revealables = document.querySelectorAll('[data-reveal]');
if (revealables.length) {
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    revealables.forEach((el) => io.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add('is-in'));
  }
}
