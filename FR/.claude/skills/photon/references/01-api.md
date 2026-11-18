# Photon – Référence API

Base publique (démo) : `https://photon.komoot.io`. Une instance auto-hébergée écoute
par défaut sur `http://localhost:2322`. Toutes les requêtes sont en `GET` et toutes
les réponses sont en JSON.

## Endpoints

| Endpoint | Rôle |
|---|---|
| `/api` | Recherche libre (forward), saisie au fil de la frappe |
| `/structured` | Recherche par champs d'adresse séparés |
| `/reverse` | Géocodage inverse : coordonnées vers adresse |
| `/status` | Santé et date des données (**renvoie 503 sur l'instance publique**, à ne pas utiliser comme health-check) |
| `/update`, `/metrics` | Optionnels, administration d'une instance auto-hébergée |

> Note : `/api` et `/api/` répondent tous les deux.

## `/api` : recherche libre

| Paramètre | Format | Défaut | Notes |
|---|---|---|---|
| `q` | string | **requis** | Obligatoire sauf si un filtre `include` est fourni, sinon **HTTP 400** |
| `limit` | int | serveur | Plafonné à **50** sur l'instance publique |
| `lang` | `default` \| `de` \| `en` \| `fr` | `Accept-Language`, puis serveur | Autre valeur : **HTTP 400** |
| `lat`, `lon` | float | none | Point de **biais** : favorise les résultats proches, sans filtrer |
| `zoom` | int | 12 | Rayon d'influence du biais, comme un zoom de carte |
| `location_bias_scale` | float 0.0–1.0 | 0.4 | 0 ignore presque la notoriété du lieu, 1 lui donne autant de poids qu'à la distance |
| `bbox` | `minLon,minLat,maxLon,maxLat` | none | **Filtre strict** sur une emprise |
| `countrycode` | ISO 3166-1 alpha-2 | none | **Répétable** : `countrycode=FR&countrycode=BE` |
| `layer` | voir plus bas | none | **Répétable** |
| `osm_tag` | voir plus bas | none | **Répétable**, marqué *deprecated* |
| `include` / `exclude` | catégories | none | Dépend de l'installation (`osm.<key>.<value>`) |
| `dedupe` | `0` \| `1` | `1` | Fusionne les doublons (même nom, code postal et `osm_value`) |

Exemple de saisie d'adresse en France :

```
GET /api?q=8 bd du port amiens&limit=5&lang=fr&countrycode=FR&layer=house&layer=street
```

## `/structured` : recherche par champs

Paramètres d'adresse : `countrycode`, `state`, `county`, `city`, `postcode`,
`district`, `street`, `housenumber`. Tous les paramètres de `/api` sont aussi
acceptés, sauf `q`.

```
GET /structured?housenumber=10&street=rue de rivoli&city=paris&countrycode=FR&lang=fr&limit=1
```

C'est utile pour **valider ou normaliser** une adresse déjà saisie en champs séparés,
par exemple pour un enregistrement existant, sans passer par l'autocomplétion.

## `/reverse` : géocodage inverse

| Paramètre | Format | Notes |
|---|---|---|
| `lat`, `lon` | float | **requis** |
| `radius` | float, km, 0–5000 | Rayon de recherche |
| `limit`, `lang`, `layer`, `osm_tag` | | Comme pour `/api` |
| `distance_sort` | bool, défaut `true` | Tri par distance |

```
GET /reverse?lat=48.8566&lon=2.3522&limit=1&lang=fr&layer=house&radius=0.05
```

Cas d'usage dans le PCF : bouton « Ma position » (`navigator.geolocation` ou
`context.device.getCurrentPosition()`), qui préremplit l'adresse la plus proche.

## Filtre `layer`

Valeurs : `house`, `street`, `locality`, `district`, `city`, `county`, `state`,
`country`, `other`. Le paramètre est répété : `layer=house&layer=street`.
Il **ne s'écrit pas** `layer=house,street`.

| Besoin | Couches |
|---|---|
| Adresse postale complète | `house` (+ `street` pour proposer la rue sans numéro) |
| Ville / commune | `city` (+ `locality`, `district` si besoin) |
| Région / pays | `state`, `country` |

## Filtre `osm_tag` (déprécié, mais encore fonctionnel)

| Syntaxe | Effet |
|---|---|
| `key:value` | Inclut les objets avec ce tag (`osm_tag=place:city`) |
| `key` | Inclut les objets avec cette clé (`osm_tag=place`) |
| `:value` | Inclut les objets avec cette valeur |
| `!key:value` | Exclut ce tag (`osm_tag=!amenity:clock`) |
| `!key` | Exclut cette clé |
| `:!value` | Exclut cette valeur |

Seuls les tags « principaux » de l'import Nominatim sont indexés. Préférez `layer`
pour filtrer par type d'adresse : c'est plus stable.

## Erreurs observées

| Cas | HTTP | Corps |
|---|---|---|
| `q` vide ou absent | 400 | `{"message":"q parameter is required when no include categories are specified"}` |
| `lang` non supportée | 400 | `{"lang":[{"message":"Language is not supported. Supported are: default, de, en, fr", ...}]}` |
| Instance surchargée ou bannissement | 429 / 503 | Page HTML nginx, **pas du JSON** : ne pas faire `res.json()` sans vérifier `res.ok` |
| Aucun résultat | 200 | `{"type":"FeatureCollection","features":[]}` |

## Politique d'usage de l'instance publique

« Vous pouvez utiliser l'API pour votre projet tant que le nombre de requêtes reste
raisonnable. » Un usage intensif est limité puis banni, sans garantie de disponibilité
ni seuil chiffré publié. **Pour la production, auto-hébergez Photon** (Java 21 et dumps
GraphHopper par pays, dont un dump France) ou utilisez un fournisseur compatible
Photon, puis renseignez son URL dans la propriété `PhotonBaseUrl` du PCF.
