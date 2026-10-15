/// <reference lib="webworker" />
// Service worker do KaRo: cache do app (funciona sem internet) + recebe arquivos do menu "Compartilhar" do celular.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | PrecacheEntry)[] }

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
// abrir o app sem internet; a função da IA nunca vai para o cache
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

// mesmos nomes que o App.tsx lê (sem "export": um service worker clássico não pode ter exports)
const SHARED_CACHE = 'karo-shared'
const SHARED_KEY = '/shared-file'

/**
 * O celular manda o arquivo compartilhado por POST em /share-target.
 * Guardamos o arquivo no cache e abrimos o app em /?shared=1, que o lê dali.
 */
async function receiveShare(request: Request) {
  try {
    const file = (await request.formData()).get('file')
    if (file instanceof File) {
      const cache = await caches.open(SHARED_CACHE)
      await cache.put(
        SHARED_KEY,
        new Response(file, { headers: { 'content-type': file.type || 'application/octet-stream', 'x-filename': encodeURIComponent(file.name) } }),
      )
    }
  } catch {
    // se algo falhar, o app abre mesmo assim, só sem o arquivo
  }
  return Response.redirect(new URL('/?shared=1', self.location.origin).href, 303)
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname === '/share-target') event.respondWith(receiveShare(event.request))
})
