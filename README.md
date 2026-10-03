# Détecteur IA

Site web qui **détecte les textes générés par IA** et peut **les humaniser**, dans une interface inspirée de Grammarly.
Tout tourne dans le navigateur : aucun serveur, aucune clé API, et le texte ne quitte jamais l'appareil.

## Fonctionnalités

- **Analyse en direct** pendant la frappe, avec un score global (% IA) et un verdict.
- **Surlignage des phrases** suspectes dans l'éditeur (rouge = très probable, orange = suspect). Les expressions typiques sont soulignées en vagues, et une infobulle au survol explique pourquoi.
- **Panneau latéral** : jauge, signaux détectés (expressions stéréotypées, uniformité des phrases, connecteurs, voix personnelle, énumérations, ponctuation) et liste des phrases à revoir (un clic sélectionne la phrase dans le texte).
- **Langue détectée automatiquement** : français et anglais pris en charge entièrement. Pour les autres langues, l'analyse se limite aux signaux de style.
- **Humanisation** avec 4 tons (décontracté, neutre, professionnel, académique) et 3 intensités.
- **Vue avant / après** avec les différences mot à mot, le score avant → après, un texte modifiable, un bouton « Autre version », la copie, et le remplacement dans l'éditeur (annulable avec Ctrl+Z).

## Utilisation en local

Ouvrir `index.html` dans un navigateur. Aucune installation n'est nécessaire.

## Mise en ligne sur GitHub Pages

1. Fusionner cette branche dans `main`.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, puis choisir `main` et `/ (root)`.
3. Le site sera disponible sur `https://<utilisateur>.github.io/<dépôt>/`.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Page et interface |
| `css/style.css` | Styles (clair/sombre, responsive) |
| `js/lexicon.js` | Lexiques FR/EN : marqueurs IA, connecteurs, réécritures |
| `js/detector.js` | Détection de langue, découpage en phrases, scoring |
| `js/humanizer.js` | Réécriture par règles et choix de la meilleure variante |
| `js/diff.js` | Différences mot à mot |
| `js/app.js` | Logique de l'interface |

Pour enrichir la détection ou l'humanisation, il suffit d'ajouter des expressions dans `js/lexicon.js`.

## Limites

La détection est **heuristique** : elle repose sur des indices statistiques et stylistiques, pas sur un modèle de langage. Le score est donc une estimation et **ne constitue pas une preuve**. Les textes courts (moins de 50 mots) sont peu fiables. Un texte humanisé obtient un meilleur score ici, mais rien ne garantit le même résultat avec d'autres détecteurs. Il faut toujours relire le texte réécrit.
