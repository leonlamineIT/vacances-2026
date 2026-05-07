// Service Worker — Vacances Sud France 2026
// Stratégie : cache-first pour app shell + photos, network-first pour API Supabase

const CACHE_VERSION = 'vacances-v1';
const APP_SHELL = [
  './',
  './index.html',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// Installation : pré-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Pre-cache partial:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activation : nettoyer anciennes caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;

  // Realtime WebSocket Supabase : ne pas intercepter
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/realtime/')) return;

  // Photos Supabase Storage : cache-first
  if (url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/object/public/vacation-photos/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // API Supabase (REST) : network-first avec fallback cache
  if (url.hostname.endsWith('.supabase.co') && url.pathname.includes('/rest/v1/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // App shell + CDN scripts : cache-first
  if (APP_SHELL.some((u) => event.request.url === u || event.request.url.startsWith(u))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Par défaut : network avec fallback cache
  event.respondWith(networkFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}
