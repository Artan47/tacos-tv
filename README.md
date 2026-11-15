# Écrans TV – The Tacos Factory

Une page par TV : `tv1/` … `tv4/`. La page d'accueil montre les 4 écrans en direct.
Chaque Fire Stick (Fully Kiosk) ouvre le lien de sa TV. Les TV vérifient `version.json`
chaque minute et se rechargent toutes seules quand il change.

## Ce que chaque TV affiche : `version.json`

Une liste de contenus par TV, joués l'un après l'autre en boucle :

```json
{
  "version": "202611151600",
  "tv1": [
    { "type": "video", "src": "media/tv1.mp4", "secours": "media/tv1.png" }
  ],
  "tv2": [
    { "type": "canva", "src": "https://www.canva.com/design/XXXX/YYYY/view?embed", "duree": 30, "secours": "media/tv2.png" },
    { "type": "image", "src": "media/promo-etudiant.jpg", "duree": 10 },
    { "type": "video", "src": "media/tv2.mp4", "secours": "media/tv2.png" }
  ]
}
```

| Champ | Rôle |
| --- | --- |
| `type` | `video` (mp4), `image` (png/jpg/webp) ou `canva` (lien « Smart embed » Canva) |
| `src` | fichier dans `media/`, ou lien Canva |
| `duree` | secondes à l'écran pour une image ou un design Canva (15 s et 30 s par défaut). Une vidéo joue jusqu'au bout. |
| `secours` | image affichée pendant le chargement et si le contenu ne marche pas |
| `hauteur` | pour `canva` : hauteur du design en px. Mettre `2000` pour un design 1080×2000 dont les 80 px du bas sont vides : la barre Canva (zoom, logo) tombe dans cette bande, coupée à l'écran. |

Un seul contenu dans la liste : la vidéo tourne en boucle, l'image reste affichée, le design
Canva est rechargé toutes les 10 minutes.

**Après chaque changement, modifier `version`** (par exemple la date et l'heure) : c'est ce qui
déclenche la mise à jour des TV.

## Deux façons de mettre à jour depuis Canva

1. **Lien Canva (automatique)** : dans Canva, *Partager → Intégrer → Lien Smart embed*, coller
   le lien dans `src` avec `"type": "canva"` (et `"hauteur": 2000` pour un design 1080×2000). Ensuite chaque modification faite dans Canva
   arrive sur la TV toute seule (10 min maximum pour un design seul, à chaque passage dans une
   liste). Il faut Internet en continu : si Canva ne répond pas, l'image `secours` s'affiche.
2. **Fichier exporté (le plus fiable)** : exporter le design depuis Canva en MP4 ou PNG
   1080×1920 (ou demander à Claude de le faire), le mettre dans `media/`, changer `version`.
   Le fichier est gardé sur le Fire Stick : la TV continue même sans Internet.

Formats conseillés : 1080×1920 (portrait), MP4 H.264, sans son. Éviter les vidéos 4K sur Fire Stick.

## Paramètres du lien (à ajouter à la fin du lien dans Fully Kiosk)

| Paramètre | Effet |
| --- | --- |
| `?rot=270` / `?rot=0` | menu à l'envers / TV déjà réglée en portrait (par défaut : rotation automatique de 90°) |
| `?video=0` | remplace les vidéos par leur image de secours (Fire Stick trop lent) |
| `?canva=0` | remplace les designs Canva par leur image de secours |
| `?debug=1` | affiche à l'écran ce que fait le lecteur (diagnostic) |
| `?sw=0` | désactive le cache local du Fire Stick |

Plusieurs paramètres : `?rot=270&debug=1`.

## Fonctionnement

- `player.js` : lecteur (liste, rotation, transitions, image de secours, relance si la vidéo se
  fige, rechargement chaque nuit vers 4 h).
- `sw.js` : cache local. Les médias sont téléchargés une fois et rejoués depuis le Fire Stick ;
  si Internet coupe, la TV continue avec la dernière version.
- Publication : chaque push sur `main` met le site en ligne (GitHub Pages, `.github/workflows/pages.yml`).
