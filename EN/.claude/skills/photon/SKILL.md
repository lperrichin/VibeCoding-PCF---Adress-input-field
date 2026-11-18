---
name: photon-geocoding
description: >
  Use this skill for anything involving the Photon geocoder (komoot) — address
  autocompletion, search-as-you-type, forward/structured/reverse geocoding with
  OpenStreetMap data, typically inside a PCF address field. Trigger on: Photon,
  photon.komoot.io, komoot, geocoding, geocoder, reverse geocoding, address
  autocomplete, address autocompletion, address suggestions, typeahead address,
  OpenStreetMap / OSM address, GeoJSON FeatureCollection, osm_tag, layer filter,
  bbox, location bias, countrycode filter, /api?q=, /reverse, /structured.
---

# Photon – OpenStreetMap geocoder (komoot)

Photon is an open-source, search-as-you-type geocoder built on OpenStreetMap
data. Public demo instance: `https://photon.komoot.io` (self-hosted default:
`http://localhost:2322`).

Read the reference file matching the task **before** writing code.

| Task | File |
|---|---|
| Endpoints, every query parameter, filters, errors, limits, fair use | `references/01-api.md` |
| Response format, property fields, TypeScript types, label formatting | `references/02-response.md` |
| TypeScript client + autocomplete UX (debounce, abort, keyboard) inside a PCF control, mapping to Dataverse fields | `references/03-pcf-integration.md` |

**Rule**: API question → 01. Parsing / displaying results → 02. Building the
control → 03 (plus 01/02 as needed, plus the `pcf-component` skill).

## Facts to never get wrong

- Coordinates in GeoJSON are **`[lon, lat]`** (longitude first).
- `bbox` format is **`minLon,minLat,maxLon,maxLat`**.
- Public instance `lang` only accepts **`default`, `de`, `en`, `fr`** — anything
  else returns a 400 validation error. Omit `lang` to fall back to the
  browser's `Accept-Language` header.
- Public instance caps `limit` at **50**.
- Public instance sends `Access-Control-Allow-Origin: *` → callable from the
  browser (PCF) with plain `fetch`, no proxy needed.
- Fair use only: debounce keystrokes, abort stale requests, never fire per
  keystroke without a minimum length. HTTP **503** (nginx HTML page) = throttled.
- Required OSM attribution in the UI: "© OpenStreetMap contributors".
- `osm_tag` is **deprecated** in favour of `include`/`exclude` categories
  (`osm.<key>.<value>`) — but both still work.
