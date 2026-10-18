import {defineConfig} from 'vite';
import {createHash} from 'node:crypto';
function offlineApp() {
  return {
    name: 'portfolio-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const version = createHash('sha256').update(Object.values(bundle).map(file => file.type === 'chunk' ? file.code : file.source).join('')).digest('hex').slice(0, 16);
      const assets = ['index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', ...Object.keys(bundle).filter(name => name !== 'index.html' && !name.endsWith('.map'))];
      this.emitFile({type:'asset', fileName:'sw.js', source:`
const ROOT = new URL('./', self.location.href);
const PREFIX = 'portfolio-desk:' + ROOT.pathname + ':';
const CACHE = PREFIX + '${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new URL(path, ROOT).href))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if(event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  if(event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match(new URL('index.html', ROOT).href))));
  } else {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
  }
});
`});
    }
  };
}
export default defineConfig({base:'./', plugins:[offlineApp()]});
