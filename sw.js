const VERSION = 'lite-v6';
// Regla de mantenimiento: subir VERSION en cada despliegue.
const PRECACHE = [
  './', 'index.html', 'navegador.html', 'styles.css', 'manifest.webmanifest',
  'src/main.js', 'src/camera.js', 'src/detect.js', 'src/cvready.js', 'src/config.js',
  'src/process.js', 'src/enhance.js', 'src/naming.js', 'src/settings.js', 'src/drive.js',
  'src/queue.js', 'src/importar.js', 'src/esquinas.js', 'src/detectia.js', 'src/carga.js',
  'vendor/opencv.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  if (/\/vendor\/(ort|modelos)\//.test(e.request.url)){ // motor IA: cache al primer uso
    e.respondWith(caches.open(VERSION).then(cache =>
      cache.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
        if (resp.ok) cache.put(e.request, resp.clone());
        return resp;
      }))));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
