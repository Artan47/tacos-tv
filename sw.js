/* Cache local des écrans TV.
   - Médias (media/…) : servis depuis le cache une fois téléchargés, avec gestion
     des requêtes partielles (Range) dont les vidéos ont besoin.
   - Pages, script, version.json : réseau d'abord, cache si Internet est coupé.
   Pour désactiver sur une TV : ajouter ?sw=0 au lien. */
var MEDIA = 'tv-media-v1';
var SHELL = 'tv-shell-v1';
var inflight = {};

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var u = new URL(req.url);
  if (u.origin !== self.location.origin) return;                 // Canva, polices… : pas touché
  var scope = new URL(self.registration.scope).pathname;
  if (u.pathname.indexOf(scope + 'media/') === 0) { e.respondWith(media(e, req)); return; }
  if (req.mode === 'navigate' || /\.(js|json|html)$/.test(u.pathname) || /\/$/.test(u.pathname)) {
    e.respondWith(networkFirst(req));
  }
});

// La page envoie la liste de ses médias : on les télécharge à l'avance
// et on supprime les fichiers d'anciennes versions.
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type !== 'warm' || !d.urls) return;
  e.waitUntil(caches.open(MEDIA).then(function (c) {
    return c.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        var v = new URL(k.url).searchParams.get('v');
        if (d.version && v && v !== d.version) return c.delete(k);
      }));
    }).then(function () {
      return Promise.all(d.urls.map(function (url) { return store(c, url).catch(function () {}); }));
    });
  }));
});

function store(c, url) {
  if (inflight[url]) return inflight[url];
  inflight[url] = c.match(url).then(function (hit) {
    if (hit) return;
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (res.status === 200) return c.put(url, res);
    });
  }).then(function () { delete inflight[url]; }, function (err) { delete inflight[url]; throw err; });
  return inflight[url];
}

function media(e, req) {
  return caches.open(MEDIA).then(function (c) {
    return c.match(req.url).then(function (hit) {
      if (hit) return ranged(req, hit);
      e.waitUntil(store(c, req.url).catch(function () {}));     // mis en cache pour la prochaine fois
      return fetch(req);
    });
  }).catch(function () { return fetch(req); });
}

function ranged(req, res) {
  var range = req.headers.get('range');
  if (!range) return res;
  var m = /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return res;
  return res.blob().then(function (blob) {
    var size = blob.size, start, end;
    if (m[1] === '' && m[2] !== '') { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
    else { start = parseInt(m[1] || '0', 10); end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1; }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    }
    var part = blob.slice(start, end + 1);
    return new Response(part, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
        'Content-Length': String(part.size),
        'Accept-Ranges': 'bytes'
      }
    });
  });
}

function networkFirst(req) {
  var u = new URL(req.url);
  var key = u.origin + u.pathname;                                // sans ?t=… ni ?rot=…
  return caches.open(SHELL).then(function (c) {
    return timeout(fetch(req), 8000).then(function (res) {
      if (res && res.ok) c.put(key, res.clone()).catch(function () {});
      return res;
    }).catch(function () {
      return c.match(key).then(function (hit) { return hit || Response.error(); });
    });
  });
}

function timeout(p, ms) {
  return new Promise(function (ok, ko) {
    var t = setTimeout(function () { ko(new Error('timeout')); }, ms);
    p.then(function (r) { clearTimeout(t); ok(r); }, function (err) { clearTimeout(t); ko(err); });
  });
}
