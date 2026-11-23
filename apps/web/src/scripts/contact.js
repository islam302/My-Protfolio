/*
 * Project brief form on /contact/. The brief is turned into a WhatsApp message
 * (wa.me) or an email (mailto:) and handed to the visitor's own app. Without JS
 * the form falls back to its mailto: action.
 *
 * Optional: when the site is built with PUBLIC_API_URL the form carries
 * data-api="<url>" and the brief is also POSTed to <url>/v1/inquiries. That
 * request is fire-and-forget (keepalive, never awaited) so window.open() still
 * runs inside the user gesture, and an API failure never blocks the hand-off.
 */
const form = document.getElementById('brief-form');

if (form) {
  const phone = form.dataset.whatsapp;
  const email = form.dataset.email;
  const status = form.querySelector('.pg-form__status');
  const waBtn = form.querySelector('[data-via="whatsapp"]');
  const api = form.dataset.api;
  const honeypot = form.elements.website; // only rendered when data-api is set
  const fields = [...form.querySelectorAll('input, select, textarea')].filter((el) => el !== honeypot);

  form.noValidate = true; // we show our own messages
  waBtn.hidden = false;

  // Pre-select the project type from /contact/?type=mobile (links on /services/).
  const preset = new URLSearchParams(location.search).get('type');
  const typeSel = form.elements.type;
  if (preset && [...typeSel.options].some((o) => o.value === preset)) typeSel.value = preset;

  // `required`/`minlength` count raw characters, but the API (packages/validation) trims first and
  // counts code points. Check the trimmed value the same way, so a padded "   " name or a
  // "short" + spaces message is caught here instead of being handed off and then rejected (QA-02).
  const trimmedLength = (el) => [...el.value.trim()].length;
  const trimIssue = (el) => {
    if (el.tagName === 'SELECT') return '';
    const n = trimmedLength(el);
    if (el.required && n === 0) return 'missing';
    if (el.minLength > 0 && n > 0 && n < el.minLength) return 'short';
    return '';
  };

  const messageFor = (el, issue) => {
    const v = el.validity;
    const label = form.querySelector(`label[for="${el.id}"]`)?.firstChild?.textContent.trim().toLowerCase() || 'this field';
    if (v.valueMissing || issue === 'missing') return el.tagName === 'SELECT' ? 'Please choose a project type.' : `Please add ${label === 'your name' ? 'your name' : 'a few words about the project'}.`;
    if (v.tooShort || issue === 'short') return `A little more detail helps: at least ${el.minLength} characters (you have ${trimmedLength(el)}).`;
    if (v.tooLong) return `Please keep it under ${el.maxLength} characters.`;
    return el.validationMessage;
  };

  const showError = (el) => {
    const err = document.getElementById(`${el.id}-err`);
    const issue = trimIssue(el);
    el.setCustomValidity(issue ? messageFor(el, issue) : '');
    const ok = el.checkValidity();
    el.setAttribute('aria-invalid', String(!ok));
    if (err) { err.hidden = ok; err.textContent = ok ? '' : messageFor(el, issue); }
    return ok;
  };

  fields.forEach((el) => {
    el.addEventListener('blur', () => { if (el.value) showError(el); });
    el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') showError(el); });
  });

  const optionText = (sel) => (sel.value ? sel.options[sel.selectedIndex].text : '');

  const compose = () => {
    const f = form.elements;
    const lines = [
      'Hi Islam, I’d like to discuss a project.',
      '',
      `Name: ${f.name.value.trim()}`,
      `Project type: ${optionText(f.type)}`,
    ];
    if (f.budget.value) lines.push(`Budget: ${optionText(f.budget)}`);
    if (f.timeline.value) lines.push(`Timeline: ${optionText(f.timeline)}`);
    lines.push('', f.message.value.trim());
    return lines.join('\n');
  };

  // Fire-and-forget copy of the brief for the inquiry API. Values only travel as
  // JSON; nothing from the response is rendered. Identical re-submits (e.g. after
  // a blocked pop-up) are not stored twice.
  let lastSent = '';
  const store = (channel) => {
    if (!api) return;
    const f = form.elements;
    const body = JSON.stringify({
      name: f.name.value.trim(),
      type: f.type.value,
      budget: f.budget.value,
      timeline: f.timeline.value,
      message: f.message.value.trim(),
      channel,
      website: honeypot ? honeypot.value : '',
    });
    if (body === lastSent) return;
    lastSent = body;
    const forget = (err) => {
      if (lastSent === body) lastSent = '';
      console.warn('Brief not stored (the WhatsApp/email hand-off is unaffected):', err);
    };
    try {
      fetch(`${api}/v1/inquiries`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body,
      })
        .then((r) => { if (!r.ok) forget(r.status); })
        .catch(forget);
    } catch (err) {
      forget(err); // e.g. fetch unavailable: never block the hand-off
    }
  };

  // Safari < 15.4 has no SubmitEvent.submitter: remember which button was used.
  let clickedVia = '';
  form.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-via]');
    if (b) clickedVia = b.dataset.via;
  });

  const setStatus = (text, href, linkText) => {
    status.textContent = text;
    if (href) {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = linkText;
      if (href.startsWith('http')) { a.target = '_blank'; a.rel = 'noopener'; }
      status.append(' ', a);
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const via = e.submitter?.dataset.via || clickedVia || 'whatsapp';
    clickedVia = '';
    const invalid = fields.filter((el) => !showError(el));
    if (invalid.length) {
      setStatus(`Please check ${invalid.length === 1 ? 'one field' : `${invalid.length} fields`} above.`);
      invalid[0].focus();
      return;
    }

    const text = compose();
    store(via === 'email' ? 'email' : 'whatsapp'); // not awaited: keeps the user gesture for window.open
    if (via === 'email') {
      const subject = `Project brief: ${optionText(form.elements.type)}`;
      const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      location.href = url;
      setStatus('Opening your email app with the brief filled in. Nothing happened?', url, 'Try this link');
    } else {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      // No 'noopener' feature here: with it window.open() always returns null,
      // and we need the return value to detect a blocked tab.
      const win = window.open(url, '_blank');
      if (win) win.opener = null;
      setStatus(
        win === null ? 'Your browser blocked the new tab.' : 'Opening WhatsApp with your brief. Just press send.',
        url,
        win === null ? 'Open WhatsApp' : 'Didn’t open? Use this link',
      );
    }
  });
}
