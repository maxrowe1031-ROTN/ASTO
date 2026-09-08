// api.js (browser) — the review page's one fetch, and its one notice.
//
// Every screen talks to the server through `api`; nothing else under ui/
// calls fetch. `notify` is the inline notice that replaced alert(): this page
// polls itself, and a modal would block the very run it is reporting on.

/** `error.body` keeps the server's refusal (e.g. the unapplied-edits list); `error.status` its code. */
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? `HTTP ${response.status}`);
    error.body = body;
    error.status = response.status;
    throw error;
  }
  return body;
}

export function notify(message, kind = 'error') {
  let el = document.getElementById('notice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notice';
    document.body.appendChild(el);
  }
  el.className = `notice notice-${kind}`;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    el.hidden = true;
  }, 6000);
}
