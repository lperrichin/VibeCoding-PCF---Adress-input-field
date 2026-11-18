# Photon – Format de réponse

## Enveloppe GeoJSON

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [2.3604077, 48.8554814] },
      "properties": {
        "osm_type": "N", "osm_id": 703432291,
        "osm_key": "place", "osm_value": "house",
        "type": "house",
        "housenumber": "10", "street": "Rue de Rivoli",
        "locality": "Quartier Saint-Gervais", "district": "Le Marais",
        "city": "Paris", "postcode": "75004",
        "state": "Île-de-France", "country": "France", "countrycode": "FR"
      }
    }
  ]
}
```

C'est une réponse réelle de `/api?q=10 rue de rivoli paris&lang=fr`.

## Propriétés (toutes optionnelles sauf `osm_*`)

| Propriété | Sens | Remarques |
|---|---|---|
| `type` | Couche du résultat : `house`, `street`, `locality`, `district`, `city`, `county`, `state`, `country`, `other` | Pilote le formatage du libellé |
| `name` | Nom de l'objet (rue, ville, POI…) | **Absent** pour une adresse pure. Présent pour un POI, par exemple `"Rivoli Collection"` |
| `housenumber` | Numéro | Chaîne : peut valoir `"10bis"` ou `"12-14"` |
| `street` | Voie | Pour `type: "street"`, le nom de la rue est dans **`name`**, pas dans `street` |
| `postcode` | Code postal | Chaîne, à ne pas convertir en nombre (zéros initiaux, ex. `01000`) |
| `city` | Commune | Pour `type: "city"`, le nom est dans **`name`** |
| `district` | Arrondissement ou quartier | Peut répéter la ville, ex. `"Paris"` |
| `locality` | Lieu-dit ou quartier fin | |
| `county` | Département | Ex. `"Somme"` |
| `state` | Région | Ex. `"Hauts-de-France"` |
| `country` / `countrycode` | Pays / code ISO alpha-2 | |
| `extent` | Emprise `[minLon, maxLat, maxLon, minLat]` | **Ordre ouest, nord, est, sud**, différent de l'ordre de `bbox`. Absent pour les points |
| `osm_type` | `N` (node), `W` (way), `R` (relation) | |
| `osm_id` | Identifiant OSM | `osm_type + osm_id` forme un **identifiant stable** |
| `osm_key` / `osm_value` | Tag OSM principal | Ex. `place/house`, `highway/primary`, `amenity/clock` |
| `extra` | Tags supplémentaires | Ex. `{"admin_level":"6"}`. Dépend de l'instance |

Le pays n'est pas toujours la France même avec `lang=fr`. Seul `countrycode=FR` filtre.

## Types TypeScript

```typescript
export type PhotonLayer =
  | "house" | "street" | "locality" | "district"
  | "city" | "county" | "state" | "country" | "other";

export interface PhotonProperties {
  osm_type: "N" | "W" | "R";
  osm_id: number;
  osm_key?: string;
  osm_value?: string;
  type?: PhotonLayer;
  name?: string;
  housenumber?: string;
  street?: string;
  postcode?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
  /** [minLon, maxLat, maxLon, minLat] */
  extent?: [number, number, number, number];
  extra?: Record<string, string>;
}

export interface PhotonFeature {
  type: "Feature";
  /** coordinates = [lon, lat] */
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PhotonProperties;
}

export interface PhotonFeatureCollection {
  type: "FeatureCollection";
  features: PhotonFeature[];
}
```

## Normalisation vers une adresse « métier »

Les champs varient selon `type`. Normalisez toujours vers une structure plate
avant de l'exposer au Canvas :

```typescript
export interface NormalizedAddress {
  id: string;            // ex. "N703432291"
  label: string;         // libellé complet affiché/sauvegardé
  housenumber: string;
  street: string;
  postcode: string;
  city: string;
  county: string;
  state: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  layer: string;
}

export function normalize(f: PhotonFeature): NormalizedAddress {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;

  // Pour une rue ou une ville, le nom porteur est dans `name`
  const street = p.street ?? (p.type === "street" ? p.name ?? "" : "");
  const city = p.city ?? (p.type === "city" ? p.name ?? "" : "");

  return {
    id: `${p.osm_type}${p.osm_id}`,
    label: formatLabelFr(p),
    housenumber: p.housenumber ?? "",
    street,
    postcode: p.postcode ?? "",
    city,
    county: p.county ?? "",
    state: p.state ?? "",
    country: p.country ?? "",
    countryCode: p.countrycode ?? "",
    latitude: lat,
    longitude: lon,
    layer: p.type ?? "",
  };
}
```

## Libellé au format postal français

Format visé : `10 Rue de Rivoli, 75004 Paris`. Le nom d'un POI (magasin, etc.) n'est
**pas** inclus : le libellé est stocké comme adresse. Implémentation de référence du
projet : `AddressFieldFr/services/addressFormat.ts`.

```typescript
export function formatLabelFr(p: PhotonProperties): string {
  const street = p.street ?? (p.type === "street" ? p.name : undefined);
  const city = p.city ?? (p.type === "city" ? p.name : undefined);

  const line1 = [p.housenumber, street].filter(Boolean).join(" ");
  const line2 = [p.postcode, city].filter(Boolean).join(" ");

  const parts = [line1, line2].filter((s) => s.length > 0);
  if (parts.length === 0 && p.name) parts.push(p.name);      // région, pays…
  if (p.countrycode && p.countrycode !== "FR" && p.country) parts.push(p.country);
  return parts.join(", ");
}
```

> **Piège :** avec `layer=house`, Photon renvoie aussi des **POI qui ont une adresse**
> (magasin, commerce) sans `housenumber`, et `type` vaut `"house"`. Leur libellé ressemble
> alors à une rue (« Rue du Château Landon, 75010 Paris »). Pour n'afficher que de vraies
> adresses, écartez les résultats `type === "house"` sans `housenumber`.

Pour la **2e ligne** de la suggestion, affichée en gris dans la liste,
`[p.county, p.state].filter(Boolean).join(", ")` aide à distinguer les homonymes,
comme deux « Rue du Port » dans des départements différents.
