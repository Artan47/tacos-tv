# Écrans TV menu

Une page par TV : `tv1/` … `tv4/`. Vidéos et images dans `media/`.
Les TV vérifient `version.json` chaque minute et se rechargent toutes seules.

Ce dossier est un simple site statique : il peut être copié tel quel sur
n'importe quel hébergement (site du restaurant, sous-dossier `/tv/`, etc.).

## Mode 1 : Canva (mise à jour automatique depuis Canva)

1. Dans Canva : **Partager → Intégrer (Embed) → Lien Smart embed**, copier le lien
   (il finit par `/view?embed`).
2. Le coller dans `version.json`, dans `canva.tv1` (ou tv2, tv3, tv4), puis changer `version`.
3. Ensuite, chaque modification faite dans Canva apparaît sur la TV en 10 minutes
   maximum, sans rien republier ici.

Si Canva ne répond pas (panne, internet coupé), la TV affiche la vidéo locale
de `media/` à la place, puis revient sur Canva dès que possible.
`?source=local` à la fin de l'URL force la vidéo locale.

## Mode 2 : sans Canva (fichiers locaux)

Laisser le lien Canva vide (`""`), remplacer le fichier dans `media/`
(`tvN.mp4` et `tvN.png`, 1080×1920), puis changer `version` dans `version.json`.
