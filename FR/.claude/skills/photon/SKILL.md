---
name: photon-geocoding
description: >
  Use this skill whenever the task involves Photon (komoot) geocoding, address search,
  address autocomplete / search-as-you-type, reverse geocoding, or turning a Photon GeoJSON
  result into address fields — typically inside the address-input PCF field control of this
  project. Trigger on: Photon, photon.komoot.io, geocoding, géocodage, autocomplete adresse,
  saisie d'adresse, address lookup, reverse geocoding, /api?q=, /reverse, /structured,
  osm_tag, layer filter, countrycode, location bias, GeoJSON FeatureCollection, OpenStreetMap address.
  For generic PCF questions (manifest, lifecycle, build, deploy) use the `pcf` skill instead;
  use both when wiring Photon into the control.
---

# Photon – Géocodage OpenStreetMap pour le PCF d'adresse

Photon est un géocodeur open source (komoot, Apache 2.0) basé sur OpenStreetMap,
conçu pour la **recherche au fil de la frappe**. Il est tolérant aux fautes de frappe,
multilingue et renvoie du **GeoJSON**.

Lisez le fichier de référence adapté à la tâche **avant** d'écrire du code.

| Tâche | Fichier |
|---|---|
| Endpoints, paramètres, filtres (layer, osm_tag, countrycode, bbox, bias), erreurs HTTP | `references/01-api.md` |
| Format de la réponse GeoJSON, propriétés, construction d'un libellé d'adresse FR | `references/02-response.md` |
| Intégration dans le PCF : client TypeScript, debounce, annulation, cache, propriétés de sortie Canvas | `references/03-pcf-integration.md` |

**Règle** : une tâche simple utilise un fichier, une tâche transverse en utilise plusieurs.

## Règles non négociables (vérifiées sur l'instance publique, 2026-11)

1. **URL de base configurable.** Ne jamais coder `https://photon.komoot.io` en dur. C'est une
   instance de **démo**, sans garantie de disponibilité, et elle limite puis bannit les usages
   intensifs. Exposez une propriété d'entrée `PhotonBaseUrl` pour pouvoir passer à une instance
   auto-hébergée ou à un fournisseur compatible.
2. **Coordonnées en `[lon, lat]`.** `geometry.coordinates[0]` est la **longitude**. C'est
   l'inversion la plus fréquente.
3. **`lang` n'accepte que `default`, `de`, `en`, `fr`.** Toute autre valeur renvoie
   **HTTP 400** sur l'instance publique. Ne transmettez jamais la langue de l'utilisateur
   sans la filtrer : repliez sur `fr`.
4. **`q` vide renvoie HTTP 400.** N'appelez pas l'API sous un seuil de caractères (choix du projet) :
   **8 caractères minimum si la saisie commence par un chiffre** (adresse avec numéro, ex. « 10 rue de rivoli »),
   **3 caractères minimum sinon** (ex. « Lyon », « rue du port »). Voir `03-pcf-integration.md`.
5. **Debounce de 500 ms (choix du projet), et annulation de la requête précédente** (`AbortController`).
   Une requête par frappe est exactement l'usage qui fait bannir un client.
6. **`limit` est plafonné à 50** sur l'instance publique. Utilisez 5 à 10 pour une liste
   de suggestions.
7. **Pour une saisie d'adresse**, filtrez les couches avec `layer=house&layer=street`
   (paramètre **répété**, pas de virgule) et `countrycode=FR` si le périmètre est la France.
8. Les propriétés de réponse sont **toutes optionnelles** : une rue n'a pas de `housenumber`,
   une ville n'a pas de `city` (son nom est dans `name`), etc. Traitez chaque champ comme
   possiblement `undefined`.
9. **CORS** : la réponse contient `Access-Control-Allow-Origin: *`, donc `fetch` direct depuis
   le PCF fonctionne. Une instance auto-hébergée doit renvoyer le même en-tête.
10. **Composant premium** : appeler Photon depuis le navigateur rend le PCF *premium*.
    Déclarez `<external-service-usage>` dans le manifest (voir `03-pcf-integration.md`).
11. Photon renvoie des **suggestions, pas des adresses certifiées**. Données ODbL : affichez
    « © OpenStreetMap contributors » dans la liste de suggestions.

## Sources

- Dépôt : https://github.com/komoot/photon (docs API : `docs/api-v1.md`)
- Wiki OSM : https://wiki.openstreetmap.org/wiki/Photon
- Spécification OpenAPI (v0.4.4, partielle) : https://gist.github.com/KiwiKilian/1f9d35544a7e9312bb74bd75a889df9c
- Filtres côté client Rust : https://docs.rs/crate/photon-geocoding/1.1.1/source/src/data/filter.rs
