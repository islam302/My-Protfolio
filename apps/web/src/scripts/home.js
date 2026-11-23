/* =====================================================================
   Home page motion: hero entrance, the "dive" into the laptop (video
   hero-dive.mp4 + frame glide), the project reel on the laptop screen,
   and wheel / touch / keyboard input.

   The project facts come from <script id="cases-data"> (generated from
   src/data/projects.js); the screens themselves are server-rendered.
   ===================================================================== */

const $ = (id) => document.getElementById(id);
const CASES = JSON.parse($('cases-data').textContent);
const N = CASES.length;

/* ---------- helpers ---------- */
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dur = (ms) => (REDUCED ? 0 : ms);
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const EASE_IN = 'cubic-bezier(.5,0,.75,0)';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
const ignore = () => {};
const isMobile = () => innerWidth <= 820;
const pad2 = (n) => String(n).padStart(2, '0');

/* Frame geometry, in frame units (the 1440×810 canvas in home.css). */
const FRAME_W = 1440;
const FRAME_H = 810;
const LAPTOP_TOP = 108.35;     // top of the laptop lid
const LAPTOP_BOTTOM = 798.3;   // bottom of the laptop base
const LAPTOP_TOP_MOBILE = 124.5;
const BADGE_W = 582;

const root = document.documentElement;
const body = document.body;
const stage = $('stage');
const frame = $('frame');
const plate = $('plate');
const cut = $('cut');
const caseplate = $('caseplate');
const trans = $('trans');
const screen = $('screen');
const flash = $('flash');
const badge = $('badge');
const mbadge = $('mbadge');
const wm = $('wm');
const mwm = $('mwm');
const script = $('script');
const mscript = $('mscript');
const ticket = $('ticket');
const desc = $('desc');
const hint = $('hint');
const hello = $('hello');
const prevBtn = $('prev');
const nextBtn = $('next');
const logo = $('logo');
const workTag = $('tWork');
const tags = [...document.querySelectorAll('.home-ui nav .tag')];
const ui = document.querySelector('.home-ui');
const screens = [...screen.querySelectorAll('.cs')];
const badges = [badge, mbadge.querySelector('.badge')]; // the swinging elements
const caseOnly = [desc, prevBtn, nextBtn, logo];          // invisible + inert in hero mode

let mode = 'hero';
let busy = false;
let cur = 0;
let transReady = false;
let sway = [];

/* ---------- screens: lazy screenshots ---------- */
function loadShots(i) {
  screens[(i + N) % N].querySelectorAll('img[data-src]').forEach((img) => {
    if (img.dataset.srcset) img.srcset = img.dataset.srcset; // set before src: one request, right size
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
    img.removeAttribute('data-srcset');
  });
}

/** Show screen n as the active one: restarts its CSS motion via .on. */
function activateScreen(n) {
  screens.forEach((s, i) => {
    s.classList.toggle('on', i === n);
    s.setAttribute('aria-hidden', String(i !== n));
  });
  loadShots(n);
}

/* ---------- frame fitting ----------
   pose(mode) returns the scale s and offset (x, y) that place the 1440×810
   frame in the viewport.
   Desktop hero: "cover" the viewport, pinned to the top.
   Desktop case: keep cover if the whole laptop (LAPTOP_TOP..LAPTOP_BOTTOM)
     still fits between the tags (66u) and the bottom (28u); otherwise scale
     down until it does.
   Mobile: the photo sits at the bottom; in case mode the laptop fills the
     space left under the ticket + description and above prev/next.
   Mobile dive (the clip plays): the clip is framed for a wide screen (the
     laptop flies out to the right, up into the top fade), so the frame first
     widens to show ~1100 of its 1440 units, centred where the laptop will land,
     then settles into the case pose. */
function pose(m) {
  const W = innerWidth;
  const H = innerHeight;
  if (!isMobile()) {
    const cover = Math.max(W / FRAME_W, H / FRAME_H);
    const u = Math.min(W / FRAME_W, H / 900); // = --n in CSS
    if (m === 'hero') return { s: cover, x: (W - FRAME_W * cover) / 2, y: 0 };
    const top = 66 * u;
    const fit = (H - top - 28 * u) / (LAPTOP_BOTTOM - LAPTOP_TOP);
    let s;
    let y;
    if (fit >= cover) {
      s = cover;
      y = Math.min(0, Math.max(H - FRAME_H * s, top - LAPTOP_TOP * s));
    } else {
      s = fit;
      y = top - LAPTOP_TOP * fit;
    }
    return { s, x: (W - FRAME_W * s) / 2, y };
  }
  if (m === 'hero') {
    const s = Math.min(W / 650, (0.62 * H) / FRAME_H);
    return { s, x: W / 2 - 760 * s, y: H - 790 * s };
  }
  if (m === 'dive') {
    const c = pose('case');
    const s = Math.min(W / 1100, c.s);
    const ly = (LAPTOP_TOP_MOBILE + LAPTOP_BOTTOM) / 2; // keep the laptop's centre where the case pose puts it
    return { s, x: W / 2 - (FRAME_W / 2) * s, y: c.y + ly * (c.s - s) };
  }
  const navH = 0.022 * H + 42 + 22;
  const uiBottom = 62 + ticket.offsetHeight + 18 + Math.max(60, desc.offsetHeight) + 14;
  const s = Math.min((W - 28) / 905, Math.max(0.2, (H - navH - uiBottom) / (LAPTOP_BOTTOM - LAPTOP_TOP_MOBILE)));
  return { s, x: W / 2 - 720 * s, y: H - navH - LAPTOP_BOTTOM * s };
}

/** Desktop hero: keep wordmark, badge and script inside the visible part of the frame. */
function fitHero(p) {
  if (isMobile()) return;
  const H = innerHeight;
  const visLeft = Math.max(0, -p.x / p.s);
  const visRight = Math.min(FRAME_W, (innerWidth - p.x) / p.s);
  const visBottom = Math.min(FRAME_H, (H - p.y) / p.s);
  const pad = 18 / p.s;
  wm.style.left = `${visLeft + 0.6 * pad}px`;
  wm.style.width = `${visRight - visLeft - 1.2 * pad}px`;
  badge.style.left = `${Math.min(986, visRight - pad - 417)}px`;
  badge.style.top = `${Math.min(-165, visBottom - 56 / p.s - 935)}px`;
  script.style.left = `${visLeft + pad + 70}px`;
}

function place(m) {
  const p = pose(m);
  frame.style.transform = `translate(${p.x}px,${p.y}px) scale(${p.s})`;
  // The dive uses the case masks too: the hero's deep top fade would swallow the rising laptop.
  frame.classList.toggle('m-case', m === 'case' || m === 'dive');
  stage.classList.toggle('m-case', m === 'case');
  frame.classList.toggle('d-fade', !isMobile());
  frame.classList.toggle('m-fade', isMobile());
  fitHero(m === 'hero' ? p : pose('hero'));
  if (isMobile()) {
    root.style.setProperty('--mbs', mbadge.offsetWidth / BADGE_W || 0.25);
    root.style.setProperty('--th', `${ticket.offsetHeight}px`);
  }
}

let resizeRaf;
addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    frame.classList.remove('glide');
    fitTitle();
    place(mode);
  });
});

/* ---------- case UI (ticket + description) ---------- */
const tTitle = $('tTitle');
const ticketRows = [...ticket.querySelectorAll('.rows div')];

/** Shrink the ticket title until it fits on one line. */
function fitTitle() {
  tTitle.style.fontSize = '';
  const avail = tTitle.clientWidth;
  if (!avail || tTitle.scrollWidth <= avail) return;
  const fs = parseFloat(getComputedStyle(tTitle).fontSize);
  tTitle.style.fontSize = `${((fs * avail) / tTitle.scrollWidth) * 0.98}px`;
}

function fillCase(i) {
  const c = CASES[i];
  tTitle.textContent = c.title;
  ticketRows.forEach((el, k) => { el.textContent = c.rows[k]; });
  $('dKey').textContent = c.key;
  $('dText').textContent = c.text;
  $('dNum').textContent = `${pad2(i + 1)} / ${pad2(N)}`;
  $('dLink').href = c.href;
  prevBtn.classList.toggle('dim', i === 0);
  fitTitle();
  if (isMobile()) root.style.setProperty('--th', `${ticket.offsetHeight}px`);
}

const descParts = () => [...desc.children];
let caseAnims = [];

function caseIn(first) {
  caseAnims.forEach((a) => a.cancel());
  caseAnims = [
    ticket.animate(
      [
        { opacity: 0, transform: 'translateY(-60px) rotate(-6deg)' },
        { opacity: 1, transform: 'translateY(6px) rotate(1.2deg)', offset: 0.7 },
        { opacity: 1, transform: 'none' },
      ],
      { duration: dur(800), delay: first ? dur(150) : 0, easing: EASE, fill: 'both' },
    ),
    ...descParts().map((el, k) =>
      el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], {
        duration: dur(600), delay: dur((first ? 250 : 80) + k * 70), easing: EASE, fill: 'both',
      })),
  ];
}

function caseOut() {
  caseAnims.forEach((a) => {
    try { a.commitStyles(); } catch { /* element not rendered */ }
    a.cancel();
  });
  caseAnims = [
    ticket.animate([{}, { opacity: 0, transform: 'translateY(-40px) rotate(4deg)' }], { duration: dur(380), easing: EASE_IN, fill: 'forwards' }),
    ...descParts().map((el, k) =>
      el.animate([{}, { opacity: 0, transform: 'translateY(-10px)' }], { duration: dur(300), delay: dur(k * 40), easing: EASE_IN, fill: 'forwards' })),
  ];
  return Promise.all(caseAnims.map((a) => a.finished)).catch(ignore);
}

/* ---------- hero out / in ---------- */
let heroAnims = [];

function stopSway() {
  sway.forEach((a) => a.cancel());
  sway = [];
}

/** Idle lanyard swing. */
function startSway() {
  stopSway();
  if (REDUCED) return;
  sway = badges.map((b) =>
    b.animate([{ transform: 'rotate(-1.1deg)' }, { transform: 'rotate(1.1deg)' }], {
      duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out',
    }));
}

function heroOut() {
  heroAnims.forEach((a) => a.cancel());
  stopSway();
  const o = { duration: dur(380), easing: EASE_IN, fill: 'forwards' };
  heroAnims = [
    ...[wm, mwm].map((el) => el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-40px)' }], o)),
    ...[script, mscript].map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], o)),
    ...[badge, mbadge].map((el) => el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-110%) rotate(-6deg)' }], o)),
  ];
}

function heroIn() {
  const old = heroAnims;
  const o = { duration: dur(700), easing: EASE, fill: 'both' };
  heroAnims = [
    ...[wm, mwm].map((el) => el.animate([{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }], o)),
    ...[script, mscript].map((el) =>
      el.animate([{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }], { ...o, delay: dur(250) })),
    ...[badge, mbadge].map((el) =>
      el.animate(
        [
          { opacity: 0, transform: 'translateY(-110%) rotate(6deg)' },
          { opacity: 1, transform: 'translateY(0) rotate(-2deg)', offset: 0.7 },
          { opacity: 1, transform: 'rotate(0)' },
        ],
        { duration: dur(1100), easing: EASE, fill: 'both' },
      )),
  ];
  old.forEach((a) => a.cancel());
  // Once settled (and still in hero), drop the fill animations and start swaying.
  const mine = heroAnims.slice();
  Promise.all(mine.map((a) => a.finished)).then(() => {
    if (mode !== 'hero') return;
    mine.forEach((a) => a.cancel());
    heroAnims = heroAnims.filter((a) => !mine.includes(a));
    startSway();
  }).catch(ignore);
}

/* ---------- first entrance (once) ---------- */
let entered = false;

function entrance() {
  if (entered) return;
  entered = true;
  loadDiveClip();
  const pres = [...document.querySelectorAll('.pre')];
  if (REDUCED) {
    pres.forEach((el) => el.classList.remove('pre'));
    return;
  }
  // When an entrance animation ends, the element keeps its final state via CSS.
  const settle = (a, el) => a.finished.then(() => { el.classList.remove('pre'); a.cancel(); }).catch(ignore);

  tags.forEach((el, i) => settle(el.animate(
    [{ opacity: 0, transform: 'translateY(-40px) rotate(-4deg)' }, { opacity: 1, transform: 'none' }],
    { duration: 700, delay: 120 + i * 80, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'both' },
  ), el));
  [wm, mwm].forEach((el) => settle(el.animate(
    [{ opacity: 0, transform: 'translateY(60px)', clipPath: 'inset(100% 0 0 0)' }, { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0)' }],
    { duration: 1100, delay: 260, easing: EASE, fill: 'both' },
  ), el));
  [script, mscript].forEach((el) => settle(el.animate(
    [{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }],
    { duration: 900, delay: 1050, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' },
  ), el));
  const drops = [badge, mbadge].map((el) => {
    const a = el.animate(
      [
        { opacity: 0, transform: 'translateY(-120%) rotate(8deg)' },
        { opacity: 1, transform: 'translateY(0) rotate(-3deg)', offset: 0.6 },
        { opacity: 1, transform: 'rotate(1.6deg)', offset: 0.8 },
        { opacity: 1, transform: 'rotate(0)' },
      ],
      { duration: 1500, delay: 700, easing: EASE, fill: 'both' },
    );
    settle(a, el);
    return a;
  });
  drops[0].finished.then(() => { if (mode === 'hero' && !busy) startSway(); }).catch(ignore);
  settle(hint.animate([{ opacity: 0 }, { opacity: 0.85 }], { duration: 600, delay: 1800, easing: EASE, fill: 'both' }), hint);
  settle(hello.animate([{ opacity: 0, transform: 'translateY(20px) rotate(3deg)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 1800, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'both' }), hello);
}

/** Pull the dive clip in as a blob after first paint: single-keyframe clips stall on streamed seeks. */
/** Resolves when the dive clip can play (or fails); null until the download starts. */
let clipLoad = null;
function loadDiveClip() {
  const url = trans.dataset.src;
  if (clipLoad || REDUCED || !url) return;
  clipLoad = new Promise((resolve) => {
    trans.addEventListener('loadeddata', () => { transReady = true; resolve(); }, { once: true });
    trans.addEventListener('error', () => resolve(), { once: true });
  });
  // Low priority: it must not compete with the hero photo and fonts.
  fetch(url, { priority: 'low' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
    .then((b) => { trans.src = URL.createObjectURL(b); })
    .catch(() => { trans.src = url; });
}

/* iOS Safari (notably in Low Power Mode) only lets a <video> start inside a user
   gesture; the dive starts the clip a few hundred ms after the swipe, outside it.
   Unlock it on the first real gesture: play invisibly (opacity 0), then pause at 0.
   Afterwards play() is allowed at any time. */
let clipUnlocked = false;
function unlockClip() {
  if (clipUnlocked || !trans.src || mode !== 'hero' || busy) return;
  clipUnlocked = true;
  const p = trans.play();
  if (!p) return;
  p.then(() => {
    if (mode === 'hero' && !busy) { trans.pause(); trans.currentTime = 0; }
  }).catch(() => { clipUnlocked = false; });
}
['touchend', 'pointerup', 'keydown'].forEach((type) => addEventListener(type, unlockClip, { capture: true, passive: true }));

/* ---------- hero → laptop dive ---------- */
/* Speed curves for the dive clip: rate = max(min, base + amp·sin(π·progress)).
   Desktop: 1.8× at the ends, up to 4.2× mid-flight (approved timing).
   Phones: 1.1×–2.1×. Phone decoders cannot present a 24 fps clip at 4× (frames
   were dropped exactly while the laptop leaves his hand), so the dive runs ~3 s. */
const CURVE_DESKTOP = { min: 1.2, base: 1.8, amp: 2.4, timeout: 6000 };
const CURVE_PHONE = { min: 1.0, base: 1.1, amp: 1.0, timeout: 9000 };

/** Resolve once frame 0 is decoded after `currentTime = 0` (or after 400 ms at most). */
function frameZero() {
  return new Promise((resolve) => {
    if (!trans.seeking && trans.readyState >= 2 && trans.currentTime === 0) { resolve(); return; }
    const t = setTimeout(resolve, 400);
    trans.addEventListener('seeked', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

/**
 * Play the dive clip along a speed curve.
 * @param {{ min: number, base: number, amp: number, timeout: number }} [curve]
 * @param {(progress: number) => void} [onProgress]
 */
function playEased(curve = CURVE_DESKTOP, onProgress) {
  return new Promise((resolve) => {
    let done = false;
    let timer = 0;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // The clip is usually paused just before its end, so 'ended' never fires:
      // drop the listener so each dive does not leave one behind on <video>.
      trans.removeEventListener('ended', finish);
      resolve();
    };
    trans.addEventListener('ended', finish, { once: true });
    timer = setTimeout(finish, curve.timeout); // never hang on a stalled clip
    const tick = () => {
      if (done) return;
      const p = trans.currentTime / (trans.duration || 5.04);
      trans.playbackRate = Math.max(curve.min, curve.base + curve.amp * Math.sin(Math.PI * Math.min(p * 1.08, 1)));
      onProgress?.(p);
      if (p >= 0.995) { finish(); return; }
      requestAnimationFrame(tick);
    };
    trans.playbackRate = curve.base;
    trans.play()?.catch(finish);
    requestAnimationFrame(tick);
  });
}

/** Fade an element to opacity 1 and leave it there as an inline style. */
async function fadeIn(el, duration, easing) {
  el.getAnimations().forEach((a) => a.cancel());
  await el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing, fill: 'forwards' }).finished.catch(ignore);
  el.getAnimations().forEach((a) => a.cancel());
  el.style.opacity = 1;
}

async function toCase() {
  if (busy || mode !== 'hero') return;
  busy = true;
  body.classList.add('busy');
  // On a slow connection the clip may still be downloading: keep the hero on screen
  // and wait for it a little rather than skipping the dive animation.
  if (!REDUCED && !transReady && clipLoad) await Promise.race([clipLoad, wait(3000)]);
  cur = 0;
  fillCase(0);
  heroOut();
  await wait(dur(330));

  if (REDUCED || !transReady) {
    // No clip (yet): glide the frame and cross-fade to the laptop plate.
    root.style.setProperty('--glide', '1.1s');
    if (!REDUCED) frame.classList.add('glide');
    place('case');
    await fadeIn(caseplate, dur(500), EASE);
    plate.style.visibility = 'hidden';
    cut.style.opacity = 0;
  } else {
    trans.pause(); // the gesture unlock may have left it playing (invisibly)
    trans.currentTime = 0;
    // Phones: show the clip from its very first frame (the look down and the release
    // of the laptop are in the first second) instead of fading in while it already plays.
    if (isMobile()) await frameZero();
    trans.style.opacity = 1;
    trans.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    nextFrame().then(nextFrame).then(() => { plate.style.visibility = 'hidden'; });
    cut.getAnimations().forEach((a) => a.cancel());
    cut.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' })
      .finished.then(() => { cut.style.opacity = 0; }).catch(ignore);
    frame.classList.add('glide');
    if (isMobile()) {
      // Widen to the whole stage while the laptop flies, then settle into the case pose
      // once the laptop is centred in the clip (about half-way).
      root.style.setProperty('--glide', '.9s');
      place('dive');
      let settled = false;
      const settleCase = () => {
        if (settled) return;
        settled = true;
        root.style.setProperty('--glide', '1.3s');
        place('case');
      };
      await wait(180); // frame 0 fades in before the clip moves
      await playEased(CURVE_PHONE, (p) => { if (p >= 0.5) settleCase(); });
      settleCase(); // a clip that ended early (or never played) must still land in the case pose
    } else {
      root.style.setProperty('--glide', '1.6s');
      place('case');
      await playEased();
    }
    trans.pause();
    await fadeIn(caseplate, 220, 'ease-out');
    trans.style.opacity = 0;
  }
  arriveCase();
}

function arriveCase() {
  mode = 'case';
  body.classList.add('is-case');
  caseOnly.forEach((el) => { el.inert = false; });
  plate.style.visibility = 'hidden';
  cut.getAnimations().forEach((a) => a.cancel());
  cut.style.opacity = 0;
  screen.getAnimations().forEach((a) => a.cancel());
  screen.style.opacity = 1;
  flash.animate([{ opacity: 0 }, { opacity: 0.55 }, { opacity: 0 }], { duration: dur(600), easing: 'ease-out' });
  cur = 0;
  fillCase(0);
  screens.forEach((s) => { s.getAnimations().forEach((a) => a.cancel()); s.style.opacity = 0; });
  const s = screens[0];
  s.style.opacity = 1;
  s.animate([{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'scale(1)' }], { duration: dur(700), easing: EASE });
  activateScreen(0);
  caseIn(true);
  loadShots(1);
  setTimeout(() => {
    busy = false;
    body.classList.remove('busy');
    frame.classList.remove('glide');
  }, dur(700));
}

/* ---------- switching cases ---------- */
async function swapTo(n) {
  if (busy || mode !== 'case') return;
  n = (n + N) % N;
  if (n === cur) return;
  busy = true;
  const old = screens[cur];
  await Promise.all([
    caseOut(),
    old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(350), easing: EASE, fill: 'forwards' }).finished.catch(ignore),
  ]);
  old.getAnimations().forEach((a) => a.cancel());
  old.style.opacity = 0;
  flash.animate([{ opacity: 0 }, { opacity: 0.35 }, { opacity: 0 }], { duration: dur(420), easing: 'ease-out' });
  cur = n;
  fillCase(n);
  const s = screens[n];
  s.style.opacity = 1;
  s.animate([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'scale(1)' }], { duration: dur(500), easing: EASE });
  activateScreen(n);
  caseIn(false);
  if (n < N - 1) loadShots(n + 1);
  else prefetchWork();
  loadShots(n - 1);
  setTimeout(() => { busy = false; }, dur(520));
}

/* The reel does not loop: moving forward from the last case leaves the
   full-screen showcase for /work/, a normal scrolling page. */
const WORK_URL = $('tWork').getAttribute('href') || '/work/';
const atLast = () => cur === N - 1;
let leaving = false;

/** Fade the showcase out (same easing family as toHero) and navigate to /work/. */
async function toWork() {
  if (busy || leaving || mode !== 'case') return;
  busy = true;
  leaving = true;
  body.classList.add('busy');
  caseOut();
  const fade = [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(8px)' }];
  const opts = { duration: dur(450), easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' };
  await Promise.all([stage, ui].map((el) => el.animate(fade, opts).finished.catch(ignore)));
  location.assign(WORK_URL);
}

/* Returning with the Back button may restore this page from the back/forward
   cache, still faded out: bring the showcase back where the visitor left it. */
addEventListener('pageshow', (e) => {
  if (!e.persisted || !leaving) return;
  leaving = false;
  [stage, ui].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
  caseIn(false);
  busy = false;
  body.classList.remove('busy');
});

/** Warm the cache for /work/ once the last case is on screen. */
let workPrefetched = false;
function prefetchWork() {
  if (workPrefetched) return;
  workPrefetched = true;
  const l = document.createElement('link');
  l.rel = 'prefetch';
  l.href = WORK_URL;
  document.head.append(l);
}

const next = () => (mode === 'case' && atLast() ? toWork() : swapTo(cur + 1));
const prev = () => {
  if (mode !== 'case' || busy) return;
  if (cur === 0) toHero();
  else swapTo(cur - 1);
};

/* ---------- back to hero ---------- */
async function toHero() {
  if (busy || mode !== 'case') return;
  busy = true;
  body.classList.add('busy');
  caseOut();
  await screen.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(300), easing: EASE, fill: 'forwards' }).finished.catch(ignore);
  screen.getAnimations().forEach((a) => a.cancel());
  screen.style.opacity = 0;
  screens.forEach((s) => { s.style.opacity = 0; s.classList.remove('on'); s.setAttribute('aria-hidden', 'true'); });
  body.classList.remove('is-case');
  caseOnly.forEach((el) => { el.inert = true; });
  mode = 'hero';

  root.style.setProperty('--glide', '.9s');
  frame.classList.add('glide');
  place('hero');
  plate.style.visibility = 'visible';
  cut.getAnimations().forEach((a) => a.cancel());
  cut.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur(700), delay: dur(150), easing: EASE, fill: 'both' })
    .finished.then(() => { cut.style.opacity = 1; cut.getAnimations().forEach((a) => a.cancel()); }).catch(ignore);
  caseplate.getAnimations().forEach((a) => a.cancel());
  caseplate.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(12px)' }], { duration: dur(800), easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' })
    .finished.then(() => { caseplate.style.opacity = 0; caseplate.getAnimations().forEach((a) => a.cancel()); }).catch(ignore);
  plate.animate([{ transform: 'scale(1.12)', filter: 'blur(8px)' }, { transform: 'scale(1)', filter: 'blur(0)' }], { duration: dur(900), easing: EASE });
  setTimeout(heroIn, dur(250));
  setTimeout(() => {
    busy = false;
    body.classList.remove('busy');
    frame.classList.remove('glide');
  }, dur(1000));
}

/* ---------- input ---------- */
// The accessible index (.home-index) scrolls and takes keys normally.
const inIndex = (e) => e.target instanceof Element && e.target.closest('.home-index');

let wheelLock = 0;
addEventListener('wheel', (e) => {
  if (inIndex(e)) return;
  e.preventDefault();
  const now = Date.now();
  if (now < wheelLock || Math.abs(e.deltaY) < 18) return;
  wheelLock = now + 900;
  if (mode === 'hero') { if (e.deltaY > 0) toCase(); } else (e.deltaY > 0 ? next : prev)();
}, { passive: false });

let touchX = 0;
let touchY = 0;
addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
addEventListener('touchmove', (e) => { if (e.cancelable && !inIndex(e)) e.preventDefault(); }, { passive: false });
addEventListener('touchend', (e) => {
  if (inIndex(e)) return;
  const t = e.changedTouches[0];
  const dx = touchX - t.clientX;
  const dy = touchY - t.clientY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
  if (mode === 'hero') { if (dy >= 40 && Math.abs(dy) > Math.abs(dx)) toCase(); return; }
  if (Math.abs(dx) > Math.abs(dy)) (dx > 0 ? next : prev)();
  else (dy > 0 ? next : prev)();
});

addEventListener('keydown', (e) => {
  const k = e.key;
  if (inIndex(e) || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest?.('button,a') && (k === ' ' || k === 'Enter')) return;
  const fwd = ['ArrowDown', 'PageDown', ' ', 'Spacebar'];
  const back = ['ArrowUp', 'PageUp'];
  if (mode === 'hero') {
    if (fwd.includes(k)) { e.preventDefault(); toCase(); }
    return;
  }
  if (fwd.includes(k) || k === 'ArrowRight') { e.preventDefault(); next(); }
  else if (back.includes(k) || k === 'ArrowLeft') { e.preventDefault(); prev(); }
  else if (k === 'Escape') toHero();
});

// "work" is a real link to /work/; on the hero it dives into the reel instead.
workTag.addEventListener('click', (e) => {
  if (mode !== 'hero' || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  toCase();
});
logo.addEventListener('click', toHero);
nextBtn.addEventListener('click', next);
prevBtn.addEventListener('click', prev);
$('screenHit').addEventListener('click', next);

/* Lanyard reacts to the pointer (not when moving between the card's own links). */
badges.forEach((b) => b.querySelector('.hit').addEventListener('pointerenter', (e) => {
  if (mode !== 'hero' || REDUCED || busy || e.relatedTarget?.closest?.('.card')) return;
  b.animate(
    [{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(-2deg)' }, { transform: 'rotate(0)' }],
    { duration: 1400, easing: 'ease-out', composite: 'add' },
  );
}));

/* ---------- boot ---------- */
caseOnly.forEach((el) => { el.inert = true; });
place('hero');
fillCase(0);
loadDiveClip(); // start the 1 MB clip download now (low priority) so it is ready before the first swipe
const plateReady = plate.complete && plate.naturalWidth
  ? Promise.resolve()
  : new Promise((r) => { plate.addEventListener('load', r, { once: true }); plate.addEventListener('error', r, { once: true }); });
Promise.race([Promise.all([plateReady, document.fonts?.ready]), wait(2500)]).then(() => requestAnimationFrame(entrance));
setTimeout(entrance, 4000);
