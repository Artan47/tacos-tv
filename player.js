/* Lecteur d'écran TV : vidéo en boucle, image de secours, rotation portrait,
   et rechargement automatique quand version.json change. */
(function () {
  var TV = document.body.getAttribute('data-tv');           // "tv1" .. "tv4"
  var params = new URLSearchParams(location.search);
  var stage = document.getElementById('stage');
  var img = document.getElementById('img');
  var vid = document.getElementById('vid');
  var current = null;

  // Rotation : ?rot=0 | 90 | 270 (sinon auto : 90° si l'écran est en paysage)
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    var rot = params.get('rot');
    if (rot === null) rot = (w > h) ? '90' : '0';
    rot = parseInt(rot, 10) || 0;
    var sideways = (rot === 90 || rot === 270);
    var bw = sideways ? h : w, bh = sideways ? w : h;       // taille de la zone portrait
    var s = Math.min(bw / 1080, bh / 1920);
    stage.style.transform = 'translate(-50%,-50%) rotate(' + rot + 'deg) scale(' + s + ')';
  }
  window.addEventListener('resize', layout);
  layout();

  function load(v) {
    current = v;
    var q = '?v=' + encodeURIComponent(v);
    img.src = '../media/' + TV + '.png' + q;
    if (params.get('video') === '0') { vid.style.display = 'none'; return; }
    vid.src = '../media/' + TV + '.mp4' + q;
    vid.load();
    var p = vid.play(); if (p && p.catch) p.catch(function () {});
  }

  vid.addEventListener('playing', function () { vid.style.opacity = 1; });
  vid.addEventListener('error', function () { vid.style.opacity = 0; setTimeout(function(){ load(current); }, 30000); });

  // Si la vidéo se fige plus de 20 s, on la relance.
  var lastT = -1, stuck = 0;
  setInterval(function () {
    if (!vid.src || vid.style.display === 'none') return;
    if (vid.currentTime === lastT) { stuck += 5; if (stuck >= 20) { stuck = 0; load(current); } }
    else { stuck = 0; lastT = vid.currentTime; }
    if (vid.paused) { var p = vid.play(); if (p && p.catch) p.catch(function(){}); }
  }, 5000);

  // Vérifie version.json toutes les 60 s ; recharge la page si elle a changé.
  function check() {
    fetch('../version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var v = String(j.version);
        if (current === null) load(v);
        else if (v !== current) { params.set('r', v); location.replace(location.pathname + '?' + params.toString()); }
      })
      .catch(function () { if (current === null) load('0'); });
  }
  check();
  setInterval(check, 60000);

  // Rechargement complet de sécurité chaque nuit (vers 4 h).
  setInterval(function () { var d = new Date(); if (d.getHours() === 4 && d.getMinutes() === 0) location.reload(); }, 60000);
})();
