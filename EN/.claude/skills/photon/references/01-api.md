# Photon API reference

Sources: komoot/photon `docs/api-v1.md` and `docs/categories.md`, the Photon
OpenAPI 3.1 spec (gist KiwiKilian), the `photon-geocoding` Rust crate, and
live checks against `https://photon.komoot.io` (v1.3.0, Nov 2026).

## Base URLs

| Instance | Base URL | Notes |
|---|---|---|
| Public demo | `https://photon.komoot.io` | Fair use, throttled, no SLA, CORS `*` |
| Self-hosted | `http://localhost:2322` | `java -jar photon-*.jar serve`; limits configurable |

`photon.komoot.de` is the legacy domain — always use `.io`.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api` | Forward search (free text, search-as-you-type) |
| `GET /structured` | Forward search with the address split into parts |
| `GET /reverse` | Reverse geocoding (coordinate → place) |
| `GET /status` | Health check: `{"status":"Ok","import_date":"…","version":"1.3.0","git_commit":"…"}` |
| `/update`, `/metrics` | Optional, self-hosted only (updates trigger, Prometheus) |

---

## `GET /api` — forward search

```
https://photon.komoot.io/api?q=10 rue de rivoli paris&limit=5&lang=fr
```

| Param | Type | Description |
|---|---|---|
| `q` | string | Search term. **Mandatory** unless an `include` filter is set (else: `{"message":"q parameter is required when no include categories are specified"}`) |
| `lat`, `lon` | number | Location bias: prefer results near this point |
| `zoom` | number | Radius of the bias, ≈ map zoom level. Default `12` |
| `location_bias_scale` | number 0.0–1.0 | How much prominence still counts vs. proximity. `0` = almost ignore prominence, `1` = same weight. Default `0.4` |
| `bbox` | string | Restrict to area: `minLon,minLat,maxLon,maxLat` (e.g. `9.5,51.5,11.5,53.5`) |
| `countrycode` | string, repeatable | Restrict to countries, ISO 3166-1 alpha-2 (e.g. `countrycode=FR&countrycode=BE`) |
| + common params | | see below |

Location bias example:
```
/api?q=berlin&lon=10&lat=52&zoom=12&location_bias_scale=0.1
```

## `GET /structured` — structured search

```
/structured?city=berlin&street=Unter%20den%20Linden&housenumber=2
```

Address parts: `countrycode` (ISO alpha-2), `state`, `county`, `city`,
`postcode`, `district` (city district / suburb), `street`, `housenumber`.
All `/api` parameters (bias, bbox, common params) also apply. Useful to
re-geocode an already-split address (e.g. existing Dataverse record).

## `GET /reverse` — reverse geocoding

```
/reverse?lon=2.35&lat=48.85&radius=1&limit=1
```

| Param | Type | Description |
|---|---|---|
| `lat`, `lon` | number | **Mandatory** coordinate |
| `radius` | number (km) | Search radius, `0`–`5000` |
| `distance_sort` | boolean | Sort by distance, default `true` |
| + common params | | see below |

---

## Parameters common to `/api`, `/structured`, `/reverse`

### `limit`
Number of results. Server may return fewer. **Public instance max = 50.**

### `lang`
One language for result names. Fallback chain: requested lang → server
`-default-language` → local name. If omitted, the `Accept-Language` header is
used (browsers send it automatically).
**Public instance accepts only `default`, `de`, `en`, `fr`**; others fail:
```json
{"lang":[{"message":"Language is not supported. Supported are: default, de, en, fr","args":{},"value":"xx"}]}
```
→ In PCF, map the user's LCID to one of these, else omit `lang`.

### `layer` (repeatable)
`house`, `street`, `locality`, `district`, `city`, `county`, `state`,
`country`, `other` (e.g. natural features).
```
/api?q=rivoli&layer=house&layer=street
```
Unknown value → 400 `{"layer":[{"message":"Unknown layer type. Available layers: [...]"}]}`.
**Address autocomplete tip**: `layer=house&layer=street` keeps only
addressable results (removes POIs-as-cities, countries, etc.). Note: POIs
(shops, …) carry `type: "house"` so they still pass the `house` layer —
exclude them with categories if needed.

### `include` / `exclude` (categories)
Category = dot-separated labels `[a-zA-Z0-9_-]`, case-sensitive,
`group.value[.sub…]`, 1–4 labels deep for filtering. The Nominatim export
creates one category per place: `osm.<osm_key>.<osm_value>`.

- `include=a.b,c.d` → keep if **any** listed category is present. Repeating
  `include` → **all** repeated conditions must match.
- `exclude=a.b,c.d` → drop if **all** listed categories are present.
  Repeating `exclude` → drop if **any** condition matches.
- Prefix match: `include=osm.highway` matches every highway.
- Group alone is an error: `include=osm` ✗.

Examples:
```
/api?q=lyon&include=osm.place.city
/api?q=rivoli&exclude=osm.shop&exclude=osm.amenity
```

### `osm_tag` (deprecated, repeatable — still works)
| Syntax | Meaning |
|---|---|
| `osm_tag=key:value` | include tag |
| `osm_tag=!key:value` | exclude tag |
| `osm_tag=key` | include key |
| `osm_tag=:value` | include value |
| `osm_tag=!key` | exclude key |
| `osm_tag=:!value` | exclude value |

Only principal ("main") OSM tags are indexed.
```
/reverse?lon=10&lat=52&osm_tag=amenity:pharmacy&limit=5
```

### `dedupe`
`dedupe=0` disables deduplication. Default: dedupe results with same name,
postcode and OSM value (e.g. a street split into several ways).

---

## Errors & status codes

| Case | Response |
|---|---|
| Validation error (bad `lang`, `layer`, …) | HTTP 400, JSON `{ "<param>": [{ "message", "args", "value" }] }` |
| Missing `q` | HTTP 400, JSON `{ "message": "…" }` |
| Throttled / overloaded (public) | HTTP **503**, nginx **HTML** body → don't `JSON.parse` blindly |
| No match | HTTP 200, `{"type":"FeatureCollection","features":[]}` |

Always check `response.ok` and `Content-Type` before parsing.

## Fair use (public instance)

"You can use the API for your project, but please be fair — extensive usage
will be throttled." No SLA, may change without notice. For production volume,
self-host (or point the control at a configurable base URL).

Client-side obligations for autocomplete:
- minimum 3 characters before querying
- debounce ≈ 300 ms
- abort the previous in-flight request (`AbortController`)
- cache recent queries in memory
- show "© OpenStreetMap contributors" attribution

## Rust crate `photon-geocoding` mapping (for reference)

`ForwardFilter`: `location_bias(coord, zoom, scale)` → `lat`/`lon`/`zoom`/
`location_bias_scale`; `bounding_box` → `bbox`; `limit`; `language` (lowercased)
→ `lang`; `layer: Vec<PhotonLayer>` → repeated `layer`; `additional_query` →
arbitrary extra params (used for `osm_tag`).
`ReverseFilter`: `radius`, `limit`, `lang`, `layer`, `additional_query`.
