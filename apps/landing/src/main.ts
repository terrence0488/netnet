/**
 * The landing page's one script: `landing_view`, once per page load (architecture §7.7). It sends
 * no cookie and stores nothing in the browser (N9); the server works out the visitor hash from
 * the request itself (§6.4). Everything else on the page works without it.
 */
fetch('/api/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'landing_view', props: {} }),
  credentials: 'omit',
  keepalive: true,
}).catch(() => undefined);
