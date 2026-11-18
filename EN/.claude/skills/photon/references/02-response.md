# Photon response format

GeoJSON `FeatureCollection`; properties follow the
[GeocodeJSON spec](https://github.com/geocoders/geocodejson-spec/tree/master/draft)
plus an optional `extra` object (extra OSM tags, when the instance stores them).

## Real example (`/api?q=10 rue de rivoli paris&lang=fr&limit=1`)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "osm_type": "N",
        "osm_id": 703432291,
        "osm_key": "place",
        "osm_value": "house",
        "type": "house",
        "housenumber": "10",
        "street": "Rue de Rivoli",
        "locality": "Quartier Saint-Gervais",
        "district": "Le Marais",
        "city": "Paris",
        "state": "Île-de-France",
        "country": "France",
        "postcode": "75004",
        "countrycode": "FR"
      },
      "geometry": { "type": "Point", "coordinates": [2.3604077, 48.8554814] }
    }
  ]
}
```

A street result has `name` = street name (no `street`/`housenumber`) and an
`extent`. A POI has `name` = POI name **and** `street`/`housenumber` of its
address.

## Properties

| Field | Always? | Meaning |
|---|---|---|
| `osm_type` | ✔ | `N` node, `W` way, `R` relation |
| `osm_id` | ✔ | OSM id (can exceed int32 — store as string/number in JS) |
| `osm_key`, `osm_value` | ✔ | main OSM tag (e.g. `highway`/`residential`, `place`/`city`) |
| `type` | ✔ | layer: `house`, `street`, `locality`, `district`, `city`, `county`, `state`, `country`, `other` |
| `name` | | place / POI / street name (absent for plain house numbers) |
| `housenumber` | | house number |
| `street` | | street of the address |
| `locality` | | neighbourhood / quarter |
| `district` | | city district / suburb |
| `city` | | city |
| `county` | | county / département |
| `state` | | state / region |
| `postcode` | | postal code |
| `country` | | country name (in `lang`) |
| `countrycode` | | ISO 3166-1 alpha-2, uppercase |
| `extent` | | bbox of the object `[minLon, maxLat, maxLon, minLat]` (note order: west, north, east, south) |
| `extra` | | object of extra tags (instance-dependent) |

Geometry: always `Point`, `coordinates: [lon, lat]`.

## TypeScript types

```ts
export type PhotonLayer =
  | "house" | "street" | "locality" | "district" | "city"
  | "county" | "state" | "country" | "other";

export interface PhotonProperties {
  osm_type: "N" | "W" | "R";
  osm_id: number;
  osm_key: string;
  osm_value: string;
  type: PhotonLayer;
  name?: string;
  housenumber?: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countrycode?: string;
  extent?: [number, number, number, number];
  extra?: Record<string, string>;
}

export interface PhotonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] }; // [lon, lat]
  properties: PhotonProperties;
}

export interface PhotonFeatureCollection {
  type: "FeatureCollection";
  features: PhotonFeature[];
}

export interface PhotonSearchParams {
  q: string;
  limit?: number;            // public max 50
  lang?: "default" | "de" | "en" | "fr"; // public instance
  lat?: number;
  lon?: number;
  zoom?: number;             // default 12
  location_bias_scale?: number; // 0..1, default 0.4
  bbox?: [number, number, number, number]; // minLon,minLat,maxLon,maxLat
  countrycode?: string[];    // repeated
  layer?: PhotonLayer[];     // repeated
  include?: string[];        // repeated, each "a.b,c.d"
  exclude?: string[];        // repeated
  osm_tag?: string[];        // deprecated, repeated
  dedupe?: boolean;
}
```

## Normalising to an address

```ts
export interface ParsedAddress {
  line1: string;        // "10 Rue de Rivoli" or POI/street name
  postcode: string;
  city: string;
  county: string;
  state: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  label: string;        // one-line display
  osmId: string;        // "N703432291"
}

/** Country codes where the number follows the street name. */
const NUMBER_AFTER_STREET = new Set([
  "DE","AT","CH","NL","BE","DK","SE","NO","FI","PL","CZ","SK","IT","ES","PT","HR","SI","HU","RO","BR",
]);

export function toAddress(f: PhotonFeature): ParsedAddress {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const cc = (p.countrycode ?? "").toUpperCase();

  const street = p.street ?? (p.type === "street" ? p.name : undefined);
  let line1 = "";
  if (street) {
    line1 = p.housenumber
      ? NUMBER_AFTER_STREET.has(cc) ? `${street} ${p.housenumber}` : `${p.housenumber} ${street}`
      : street;
  }
  // POI: prefix its name ("Coffea, 52 Boulevard Saint-Germain")
  const isPoi = p.name && p.type !== "street" && p.name !== street && p.name !== p.city;
  const city = p.city ?? p.district ?? p.locality ?? "";

  const label = [isPoi ? p.name : undefined, line1 || p.name, [p.postcode, city].filter(Boolean).join(" "), p.country]
    .filter((s, i, a) => s && a.indexOf(s) === i)
    .join(", ");

  return {
    line1: line1 || p.name || "",
    postcode: p.postcode ?? "",
    city,
    county: p.county ?? "",
    state: p.state ?? "",
    country: p.country ?? "",
    countryCode: cc,
    latitude: lat,
    longitude: lon,
    label,
    osmId: `${p.osm_type}${p.osm_id}`,
  };
}
```

Two-line suggestion display (common pattern): **primary** = `name` or
`line1`; **secondary** = `postcode city, country`.
