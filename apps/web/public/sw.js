/**
 * NetNet's service worker, at /app/sw.js: it handles `push` and `notificationclick` only. It has
 * no `fetch` handler and caches nothing, so no financial data is ever stored offline
 * (architecture §5.2, §7.10). Safari 18.4+ shows the same payload with no worker at all
 * (Declarative Web Push).
 */

/** The payload's marker: what says this push is NetNet's reminder (and nothing else is shown). */
var WEB_PUSH_MAGIC = 8030;

self.addEventListener('push', function (event) {
  var notification;
  try {
    var data = event.data ? event.data.json() : null;
    if (!data || data.web_push !== WEB_PUSH_MAGIC || !data.notification) return;
    notification = data.notification;
  } catch {
    return;
  }
  if (
    typeof notification.title !== 'string' ||
    typeof notification.body !== 'string' ||
    typeof notification.navigate !== 'string'
  ) {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      data: { navigate: notification.navigate },
      icon: 'icons/icon-192.png',
    }),
  );
});

/** Where a tap goes: the reminder's link, when it stays on our origin, else the web app. */
function targetUrl(navigate) {
  if (typeof navigate !== 'string' || navigate === '') return self.registration.scope;
  try {
    var url = new URL(navigate, self.registration.scope);
    return url.origin === self.location.origin ? url.href : self.registration.scope;
  } catch {
    return self.registration.scope;
  }
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var navigate =
    event.notification && event.notification.data ? event.notification.data.navigate : undefined;
  var url = targetUrl(navigate);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
      var open = windows.find(function (client) {
        return client.url === url;
      });
      if (open) return open.focus();
      return self.clients.openWindow(url);
    }),
  );
});
