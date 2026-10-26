self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("orbit-offline-v1")
    .then((cache) => cache.addAll(["/offline"]))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== "orbit-offline-v1").map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  // Pages hold private data, so only the static offline notice is ever cached.
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline")
    .then((page) => page || Response.error())));
});

// Shows pushes sent by the Worker (lib/push.ts) and opens their link when tapped.
// Pushes are declarative (iOS 18.4+ shows them without this file);
// Android Chrome and older iOS show them here.
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const shown = data.notification ?? { title: data.title || "우주", body: data.body, tag: data.tag, navigate: data.url };
  // shownBySystem: this file shows it as a system notification (Android, desktop), so open windows skip their own banner.
  const message = { title: shown.title, body: shown.body, url: shown.navigate || "/", shownBySystem: !event.notification };
  event.waitUntil(Promise.all([
    // iOS shows no banner while the home screen app is open, so tell open windows to show their own.
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => windows.forEach((client) => client.postMessage({ type: "push", message }))),
    // Home screen icon badge (unread count); the inbox page clears it.
    self.navigator.setAppBadge ? self.navigator.setAppBadge(data.app_badge || undefined).catch(() => {}) : null,
    // iOS already proposes the declarative notification; showing another would double it.
    event.notification ? null : self.registration.showNotification(message.title, {
      body: message.body,
      tag: shown.tag,
      icon: "/icon.png",
      data: { url: message.url },
    }),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/"));
});
