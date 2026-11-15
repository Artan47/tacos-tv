/* Lecteur d'écran TV — The Tacos Factory
   - Une liste de contenus par TV (version.json) : vidéos, images, designs Canva.
   - Rotation portrait automatique (le Fire Stick sort en paysage).
   - Image de secours toujours dessous : jamais d'écran noir.
   - Vérifie version.json chaque minute et se recharge quand il change.
   - Cache local des médias (sw.js) : moins de données, continue sans Internet.
   Paramètres d'URL : ?rot=0|90|180|270  ?video=0  ?canva=0  ?sw=0  ?preview=1 */
(function () {
  'use strict';

  var TV = document.body.getAttribute('data-tv');            // "tv1" .. "tv4"
  var params = new URLSearchParams(location.search);
  var stage = document.getElementById('stage');
  var bg = document.getElementById('bg');
  var PREVIEW = params.get('preview') === '1';

  var IMAGE_SECONDS = 15;           // durée par défaut d'une image dans une liste
  var CANVA_SECONDS = 30;           // durée par défaut d'un design Canva dans une liste
  var CANVA_REFRESH = 10 * 60000;   // Canva seul à l'écran : rechargé toutes les 10 min
  var RETRY_ALL_FAILED = 30000;     // tout a échoué : on réessaie dans 30 s

  var version = null;     // version publiée (version.json)
  var items = [];         // liste de contenus de cette TV
  var idx = -1;           // contenu affiché
  var shown = null;       // { item, el }
  var pending = null;     // contenu suivant en préparation
  var endTimer = null, nextTimer = null, fails = 0;

  // ---------------------------------------------------------------- rotation
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    var rot = params.get('rot');
    if (rot === null) rot = (w > h) ? '90' : '0';
    rot = parseInt(rot, 10) || 0;
    var sideways = (rot === 90 || rot === 270);
    var bw = sideways ? h : w, bh = sideways ? w : h;        // zone portrait disponible
    var s = Math.min(bw / 1080, bh / 1920);
    stage.style.transform = 'translate(-50%,-50%) rotate(' + rot + 'deg) scale(' + s + ')';
  }
  window.addEventListener('resize', layout);
  layout();
  setInterval(layout, 5000);                // au cas où le navigateur change de taille sans prévenir

  // ----------------------------------------------------------------- outils
  function mediaUrl(src) {
    if (/^https?:\/\//i.test(src)) return src;
    return '../' + String(src).replace(/^(\.\.\/|\.\/|\/)+/, '') +
           (version ? '?v=' + encodeURIComponent(version) : '');
  }
  // Accepte le lien « Smart embed » Canva, un lien de partage, ou le code <iframe> collé tel quel.
  function canvaEmbed(u) {
    var m = String(u || '').match(/https:\/\/[^"'\s<>]*canva\.com\/design\/[^"'\s<>]+/);
    if (!m) return null;
    return m[0].replace(/&amp;/g, '&').split('?')[0].replace(/\/(edit|view|watch)$/, '') + '/view?embed';
  }
  function typeOf(it) {
    if (it.type) return String(it.type).toLowerCase();
    if (/canva\.com/i.test(it.src)) return 'canva';
    if (/\.(mp4|webm|m4v|mov)(\?|$)/i.test(it.src)) return 'video';
    return 'image';
  }
  // ?debug=1 : journal à l'écran (diagnostic sur la TV).
  var logBox = null;
  function dbg(msg) {
    if (params.get('debug') !== '1') return;
    if (!logBox) {
      logBox = document.createElement('pre');
      logBox.style.cssText = 'position:fixed;left:0;top:0;z-index:9;margin:0;padding:8px;max-width:100%;' +
        'font:12px/1.35 monospace;color:#0f0;background:rgba(0,0,0,.75);white-space:pre-wrap;pointer-events:none';
      document.body.appendChild(logBox);
    }
    var d = new Date(), line = d.toTimeString().slice(0, 8) + ' ' + msg;
    try { console.log('[tv] ' + line); } catch (e) {}
    logBox.textContent = (line + '\n' + logBox.textContent).split('\n').slice(0, 14).join('\n');
  }
  function short(it) { return it.type + ' ' + String(it.src).replace(/^.*\/(media|design)\//, '$1/').slice(0, 36); }
  function once(fn) { var done = false; return function () { if (!done) { done = true; fn.apply(this, arguments); } }; }
  function play(v) { try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  function clearTimers() { clearTimeout(endTimer); clearTimeout(nextTimer); endTimer = nextTimer = null; }

  // Liste de la TV, à partir de version.json. Sans liste : la vidéo + l'image d'origine.
  function buildItems(cfg) {
    var raw = (cfg && (cfg[TV] || (cfg.ecrans && cfg.ecrans[TV]))) || null;
    if (!raw || !raw.length) raw = [{ type: 'video', src: 'media/' + TV + '.mp4', secours: 'media/' + TV + '.png' }];
    var out = [];
    raw.forEach(function (r) {
      if (typeof r === 'string') r = { src: r };
      if (!r || !r.src) return;
      var it = { type: typeOf(r), src: r.src, secours: r.secours || null, duree: +r.duree || 0, hauteur: +r.hauteur || 0 };
      if (it.type === 'canva') {
        it.src = canvaEmbed(r.src);
        if (!it.src || params.get('canva') === '0') { if (!it.secours) return; it = { type: 'image', src: it.secours, secours: it.secours, duree: it.duree }; }
      }
      if (it.type === 'video' && params.get('video') === '0') {
        if (!it.secours) return;
        it = { type: 'image', src: it.secours, secours: it.secours, duree: it.duree };
      }
      out.push(it);
    });
    if (!out.length) out.push({ type: 'image', src: 'media/' + TV + '.png', secours: null, duree: 0 });
    return out;
  }

  // ------------------------------------------------------------- préparation
  // Crée l'élément caché, appelle ready(el) quand il peut s'afficher, sinon fail().
  function prepare(item, ready, fail) {
    var el, limit, ok = once(function () { clearTimeout(limit); dbg('prêt   ' + short(item)); ready(el); }),
        ko = once(function (why) {
          clearTimeout(limit);
          dbg('ÉCHEC  ' + short(item) + ' (' + (why && why.type ? why.type : why || 'erreur') + ')');
          if (el && el.parentNode) el.parentNode.removeChild(el);
          fail();
        });
    dbg('charge ' + short(item));

    if (item.type === 'video') {
      el = document.createElement('video');
      el.muted = true; el.setAttribute('muted', '');
      el.setAttribute('playsinline', ''); el.setAttribute('preload', 'auto');
      el.loop = (items.length === 1);
      el.addEventListener('canplay', ok);
      el.addEventListener('error', ko);
      el.src = mediaUrl(item.src);
      limit = setTimeout(function () { ko('délai dépassé'); }, 90000);
    } else if (item.type === 'canva') {
      el = document.createElement('iframe');
      el.setAttribute('allow', 'autoplay; fullscreen');
      el.setAttribute('scrolling', 'no');
      el.setAttribute('title', 'Design Canva');
      // Canva cale le design sur la hauteur du cadre et pose sa barre (zoom, logo,
      // plein écran) en bas. Un design de 1080×2000 (bande vide de 80 px en bas) dans un
      // cadre de 1080×2000 : l'écran (1920 px) coupe la bande et la barre avec.
      el.style.top = '0px';
      el.style.height = (item.hauteur || 1920) + 'px';
      limit = setTimeout(function () { ko('délai dépassé'); }, 45000);
      // Vérifie d'abord que Canva répond (sinon une page d'erreur couvrirait l'écran).
      fetch(item.src, { mode: 'no-cors', cache: 'no-store' }).then(function () {
        el.onload = function () { setTimeout(ok, 4000); };      // laisse Canva dessiner
        el.src = item.src + '&t=' + Date.now();
      }, function () { ko('Canva injoignable'); });
    } else {
      el = document.createElement('img');
      el.alt = '';
      el.onload = ok; el.onerror = ko;
      el.src = mediaUrl(item.src);
      limit = setTimeout(function () { ko('délai dépassé'); }, 45000);
    }
    el.className = 'layer';
    stage.appendChild(el);
    return el;
  }

  // ---------------------------------------------------------------- affichage
  function setBg(item) {
    var src = (item && item.secours) || (item && item.type === 'image' ? item.src : null) || ('media/' + TV + '.png');
    var u = mediaUrl(src);
    if (bg.getAttribute('src') !== u) bg.src = u;
  }

  function show(i, el) {
    var item = items[i], old = shown;
    idx = i; fails = 0;
    shown = { item: item, el: el };
    dbg('affiche ' + (i + 1) + '/' + items.length + ' ' + short(item));
    setBg(item);
    el.style.opacity = 1;
    if (item.type === 'video') { el.currentTime = 0; play(el); }
    if (old && old.el !== el) setTimeout(function () { drop(old.el); }, 800);
    schedule(item, el);
  }

  function drop(el) {
    if (!el || !el.parentNode) return;
    if (el.tagName === 'VIDEO') { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {} }
    el.parentNode.removeChild(el);
  }

  // Quand passer au suivant, et quand commencer à le préparer.
  function schedule(item, el) {
    clearTimers();
    var single = items.length === 1;
    if (single) {
      if (item.type === 'canva') endTimer = setTimeout(function () { go(idx); }, CANVA_REFRESH);
      return;                                   // vidéo seule : boucle ; image seule : reste
    }
    if (item.type === 'video') {
      el.addEventListener('ended', function () { if (shown && shown.el === el) go(next()); });
      if (item.duree) endTimer = setTimeout(function () { go(next()); }, item.duree * 1000);
      return;                                   // la vidéo suivante se prépare à la fin (un seul décodeur à la fois)
    }
    var secs = item.duree || (item.type === 'canva' ? CANVA_SECONDS : IMAGE_SECONDS);
    var nextItem = items[next()];
    var lead = nextItem.type === 'canva' ? 12 : nextItem.type === 'video' ? 4 : 2;
    nextTimer = setTimeout(function () { preload(next()); }, Math.max(0, secs - lead) * 1000);
    endTimer = setTimeout(function () { go(next()); }, secs * 1000);
  }

  function next() { return (idx + 1) % items.length; }

  function preload(i) {
    if (pending && pending.i === i) return;
    if (pending && pending.el) drop(pending.el);
    var p = { i: i, el: null, ready: false, failed: false, cb: null };
    pending = p;
    p.el = prepare(items[i], function () { p.ready = true; if (p.cb) p.cb(); },
                             function () { p.failed = true; if (p.cb) p.cb(); });
  }

  // Affiche le contenu i (le prépare si besoin). En cas d'échec, passe au suivant.
  function go(i) {
    clearTimers();
    if (!pending || pending.i !== i || (shown && pending.el === shown.el)) preload(i);
    var p = pending;
    setBg(items[i]);                            // l'image de secours du suivant couvre l'attente
    function settle() {
      if (pending !== p) return;
      pending = null;
      if (p.ready) { show(i, p.el); return; }
      fails++;
      if (fails >= items.length) {              // tout a échoué : image de secours, on réessaie plus tard
        dbg('tout a échoué : image de secours, nouvel essai dans 30 s');
        fails = 0;
        if (shown) { drop(shown.el); shown = null; }
        setBg(items[i]);
        endTimer = setTimeout(function () { go(i); }, RETRY_ALL_FAILED);
      } else {
        go((i + 1) % items.length);
      }
    }
    if (p.ready || p.failed) settle(); else p.cb = settle;
  }

  // Vidéo figée plus de 20 s, ou mise en pause : on relance.
  var lastT = -1, stuck = 0;
  setInterval(function () {
    if (!shown || shown.item.type !== 'video') { stuck = 0; return; }
    var v = shown.el;
    if (v.paused && !v.ended) play(v);
    if (v.currentTime === lastT) {
      stuck += 5;
      if (stuck >= 20) { stuck = 0; lastT = -1; dbg('vidéo figée : relance'); go(items.length === 1 ? idx : next()); }
    } else { stuck = 0; lastT = v.currentTime; }
  }, 5000);

  // ------------------------------------------------------------ cache local
  var useSW = !PREVIEW && params.get('sw') !== '0' && 'serviceWorker' in navigator;
  if ('serviceWorker' in navigator && !useSW && !PREVIEW) {
    navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
  }
  if (useSW) navigator.serviceWorker.register('../sw.js').catch(function () {});
  function warmCache() {
    if (!useSW || !navigator.serviceWorker) return;
    navigator.serviceWorker.ready.then(function (reg) {
      var urls = [];
      items.forEach(function (it) {
        if (it.type !== 'canva') urls.push(new URL(mediaUrl(it.src), location.href).href);
        if (it.secours) urls.push(new URL(mediaUrl(it.secours), location.href).href);
      });
      if (reg.active) reg.active.postMessage({ type: 'warm', version: version, urls: urls });
    }).catch(function () {});
  }

  // ------------------------------------------------- version et mises à jour
  function start(cfg, v) {
    version = v;
    items = buildItems(cfg);
    dbg('version ' + v + ' · ' + TV + ' · ' + items.length + ' contenu(s)');
    setBg(items[0]);
    go(0);
    warmCache();
  }
  function check() {
    fetch('../version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var v = String(j.version);
        if (version === null) start(j, v);
        else if (v !== version) { params.set('r', v); location.replace(location.pathname + '?' + params.toString()); }
      })
      .catch(function () { if (version === null) start(null, '0'); });
  }
  check();
  setInterval(check, 60000);

  // Rechargement complet de sécurité chaque nuit (vers 4 h).
  setInterval(function () { var d = new Date(); if (d.getHours() === 4 && d.getMinutes() === 0) location.reload(); }, 60000);
})();
