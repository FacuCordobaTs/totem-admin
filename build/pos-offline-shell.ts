import { createHash } from "node:crypto"
import type { Plugin } from "vite"

// Cache only the built app shell. API responses and credentials never enter Cache Storage.
export function posOfflineShell(): Plugin {
  return {
    name: "crow-pos-offline-shell",
    apply: "build",
    generateBundle(_options, bundle) {
      const assets = [...new Set(["index.html", "logo.png", ...Object.keys(bundle).filter((name) => !name.endsWith(".map"))])]
      const version = createHash("sha256").update(assets.join("\n")).digest("hex").slice(0, 16)
      this.emitFile({ type: "asset", fileName: "pos-sw.js", source: `
const CACHE = "crow-pos-shell-${version}";
const ASSETS = ${JSON.stringify(assets)}.map((path) => new URL(path, self.registration.scope).href);
const SHELL = new URL("index.html", self.registration.scope).href;
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })))));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("crow-pos-shell-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (event.request.method !== "GET" || url.origin !== scope.origin) return;
  const relative = url.pathname.slice(scope.pathname.length);
  if (event.request.mode === "navigate" && (relative === "pos" || relative.startsWith("pos/"))) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      try {
        const response = await fetch(event.request, { signal: AbortSignal.timeout(2500) });
        if (response.ok) return response;
      } catch { /* Fall back to the complete, versioned shell. */ }
      return (await cache.match(SHELL)) || Response.error();
    }));
  } else if (ASSETS.includes(url.href)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(event.request)) || fetch(event.request)));
  }
});
` })
    },
  }
}
