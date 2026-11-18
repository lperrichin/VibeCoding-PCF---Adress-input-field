# AdressField_EN — PCF Specification

Address autocompletion field for **Power Apps canvas apps** (the same code also runs on model-driven forms), powered by the
[Photon](https://github.com/komoot/photon) geocoder (OpenStreetMap data),
built as a **React / Fluent UI 9 virtual PCF control**.

| Item | Value |
|---|---|
| Component name (constructor) | `AdressField_EN` |
| Namespace / publisher prefix | `FWL` / `fwl` *(confirmed)* |
| Template | `field` |
| Control type | `virtual` (React, platform libraries) |
| Target host | **Canvas app** (primary); model-driven forms also supported |
| UI library | Fluent UI 9 (`@fluentui/react-components`) |
| Geocoder | Photon — `https://photon.komoot.io` by default |
| Default language | `en` |
| Photon layers | **No `house` layer** — streets and higher levels only |
| Version | `0.0.1` |

---

## 1. Functional overview

1. The user types an address into a single text field.
2. Once **3 characters** are typed, and never more than **one API call per
   500 ms** (see §7.5), the control queries Photon
   `/api`.
3. A dropdown shows up to **5 suggestions** (street, postcode, city, country).
4. The user picks a suggestion with the mouse or keyboard.
5. The control fills **every bound column** (address line, postcode, city,
   county, state, country, country code, latitude, longitude) in one
   `notifyOutputChanged()` call.
6. If the user never picks a suggestion, the typed text is saved as free text
   in the address line and the other columns stay as they were.

### House number handling (because `house` is not used)

Photon is queried **without** the `house` layer. Tests on the public instance
show that leaving a house number in `q` degrades results badly:

| Query (`layer=street,…`) | First result |
|---|---|
| `10 rue de rivoli` | Rue de Rivoli – **Brussels** (1 result only) |
| `rue de rivoli` | Rue de Rivoli – **75001 Paris** (5 results) |

So the control:

1. **Extracts** a house number from the typed text (leading or trailing, see §7.2).
2. **Queries Photon with the remaining text** only.
3. **Re-applies** the house number to the selected street when building the
   address line, using country-specific order (`10 Rue de Rivoli` in FR/GB/US,
   `Hauptstraße 10` in DE/AT/CH/NL/BE/IT/ES…).
4. Shows the house number in the suggestion label so the user sees the final
   result before picking it.

---

## 2. Inputs and outputs

### 2.1 Bound properties (read **and** written by the control)

All bound properties are `usage="bound"`. Only `addressLine` is required. The
others are optional: makers bind the ones their table has, and the control
ignores those left unbound.

| # | Property name | Type (`of-type`) | Req. | Written on selection | Suggested Dataverse column (Account / Contact) |
|---|---|---|---|---|---|
| 1 | `addressLine` | `SingleLine.Text` | ✔ | House number + street (or place name) | `address1_line1` |
| 2 | `postalCode` | `SingleLine.Text` | | `postcode` | `address1_postalcode` |
| 3 | `city` | `SingleLine.Text` | | `city` → fallback `district` → `locality` | `address1_city` |
| 4 | `county` | `SingleLine.Text` | | `county` | `address1_county` |
| 5 | `stateOrProvince` | `SingleLine.Text` | | `state` | `address1_stateorprovince` |
| 6 | `country` | `SingleLine.Text` | | `country` (in the configured language) | `address1_country` |
| 7 | `countryCode` | `SingleLine.Text` | | `countrycode` (ISO 3166-1 alpha-2, uppercase) | custom column, e.g. `fwl_countrycode` |
| 8 | `latitude` | `FP` | | `geometry.coordinates[1]` | `address1_latitude` |
| 9 | `longitude` | `FP` | | `geometry.coordinates[0]` | `address1_longitude` |

> ⚠ GeoJSON coordinates are **`[longitude, latitude]`**. Do not swap them.

The **read** side of the bound properties is used as follows:

| Property read | Usage |
|---|---|
| `addressLine.raw` | Initial / external value displayed in the input |
| `latitude.raw` + `longitude.raw` | Location bias (`lat`/`lon`) for the next searches, when both are set |
| `addressLine.attributes.MaxLength` | Truncate the written address line if necessary |

### 2.2 Input properties (configuration set by the maker)

All are `usage="input"`, `required="false"`, and have a default value.

| # | Property name | Type | Default | Allowed values / rules | Photon parameter |
|---|---|---|---|---|---|
| 1 | `photonBaseUrl` | `SingleLine.Text` | `https://photon.komoot.io` | HTTPS URL without a trailing `/` (it is trimmed) | base URL |
| 2 | `language` | `SingleLine.Text` | `en` | `en`, `fr`, `de`, `default` (public instance). Any other value → fallback `en` | `lang` |
| 3 | `countryCodes` | `SingleLine.Text` | `GB` | CSV of ISO 3166-1 alpha-2 codes, e.g. `GB,IE`. Empty = worldwide. Note: `EN` is not a country code (Photon returns 0 results) | `countrycode` (repeated) |
| 4 | `layers` | `SingleLine.Text` | `street,locality,district,city` | CSV among `street`, `locality`, `district`, `city`, `county`, `state`, `country`, `other`. **`house` is rejected** (ignored with a console warning) | `layer` (repeated) |
| 5 | `maxResults` | `Whole.None` | `5` | 1 – 10 (clamped) | `limit` |
| 6 | `minChars` | `Whole.None` | `3` | 2 – 10 (clamped) | — |
| 7 | `requestIntervalMs` | `Whole.None` | `500` | 250 – 2000 (clamped). Minimum time between the **start** of two Photon calls (§7.5) | — |
| 8 | `keepHouseNumber` | `TwoOptions` | `true` | Extract and re-apply the typed house number (§1) | — |
| 9 | `placeholder` | `SingleLine.Text` | `Start typing an address…` | Free text | — |

### 2.3 Outputs (`getOutputs()`)

`IOutputs` contains the 9 bound properties of §2.1.

| Situation | `addressLine` | Other bound outputs |
|---|---|---|
| Suggestion selected | Formatted line (§7.3), truncated to `MaxLength` | All filled from the feature. Missing values → `undefined` (column left unchanged) |
| Free text typed, no selection (on blur) | Typed text (trimmed) | `undefined` (unchanged) |
| Field cleared (empty text / clear button) | `undefined` → column set to null | All set to `undefined` |
| No change since last notify | — | `notifyOutputChanged()` is **not** called |

> Rule: when an address is selected, values the feature lacks (e.g. no
> `county`) are cleared, not left stale. Return `""` for text columns and
> `undefined` for FP columns in that case, so the record doesn't mix the old
> and the new address.

---

## 3. ControlManifest.Input.xml

```xml
<?xml version="1.0" encoding="utf-8" ?>
<manifest>
  <control namespace="FWL"
           constructor="AdressField_EN"
           version="0.0.1"
           display-name-key="AdressField_EN"
           description-key="Address autocompletion powered by Photon (OpenStreetMap)"
           control-type="virtual">

    <!-- External service (makes the component premium, required for transparency) -->
    <external-service-usage enabled="true">
      <domain>photon.komoot.io</domain>
    </external-service-usage>

    <!-- ===== Bound properties ===== -->
    <property name="addressLine"     display-name-key="Address line"    description-key="Street line written by the control" of-type="SingleLine.Text" usage="bound" required="true" />
    <property name="postalCode"      display-name-key="Postal code"     of-type="SingleLine.Text" usage="bound" required="false" />
    <property name="city"            display-name-key="City"            of-type="SingleLine.Text" usage="bound" required="false" />
    <property name="county"          display-name-key="County"          of-type="SingleLine.Text" usage="bound" required="false" />
    <property name="stateOrProvince" display-name-key="State/Province"  of-type="SingleLine.Text" usage="bound" required="false" />
    <property name="country"         display-name-key="Country"         of-type="SingleLine.Text" usage="bound" required="false" />
    <property name="countryCode"     display-name-key="Country code"    of-type="SingleLine.Text" usage="bound" required="false" />
    <property name="latitude"        display-name-key="Latitude"        of-type="FP"              usage="bound" required="false" />
    <property name="longitude"       display-name-key="Longitude"       of-type="FP"              usage="bound" required="false" />

    <!-- ===== Input (configuration) properties ===== -->
    <property name="photonBaseUrl"   display-name-key="Photon base URL"           of-type="SingleLine.Text" usage="input" required="false" default-value="https://photon.komoot.io" />
    <property name="language"        display-name-key="Language (en/fr/de/default)" of-type="SingleLine.Text" usage="input" required="false" default-value="en" />
    <property name="countryCodes"    display-name-key="Country codes (CSV)"       of-type="SingleLine.Text" usage="input" required="false" default-value="GB" />
    <property name="layers"          display-name-key="Layers (CSV, no house)"    of-type="SingleLine.Text" usage="input" required="false" default-value="street,locality,district,city" />
    <property name="maxResults"      display-name-key="Max suggestions"           of-type="Whole.None"      usage="input" required="false" default-value="5" />
    <property name="minChars"        display-name-key="Min characters"            of-type="Whole.None"      usage="input" required="false" default-value="3" />
    <property name="requestIntervalMs" display-name-key="Min interval between API calls (ms)" of-type="Whole.None" usage="input" required="false" default-value="500" />
    <property name="keepHouseNumber" display-name-key="Keep typed house number"   of-type="TwoOptions"      usage="input" required="false" default-value="true" />
    <property name="placeholder"     display-name-key="Placeholder"               of-type="SingleLine.Text" usage="input" required="false" default-value="Start typing an address…" />

    <resources>
      <code path="index.ts" order="1" />
      <platform-library name="React"  version="16.14.0" />
      <platform-library name="Fluent" version="9.46.2" />
    </resources>
  </control>
</manifest>
```

After any manifest change: `npm run refreshTypes`.

---

## 4. Project structure

```
AdressField_EN/                         ← project root (pac pcf init)
├── AdressField_EN/
│   ├── ControlManifest.Input.xml
│   ├── index.ts                         ← ReactControl: lifecycle, outputs
│   ├── components/
│   │   └── AddressAutocomplete.tsx      ← Fluent UI 9 Combobox UI
│   ├── services/
│   │   ├── photonClient.ts              ← fetch, abort, cache, errors
│   │   └── photonTypes.ts               ← GeoJSON / params types
│   ├── utils/
│   │   ├── houseNumber.ts               ← extract / re-apply house number
│   │   ├── addressMapper.ts             ← feature → ParsedAddress
│   │   └── config.ts                    ← read + validate input properties
│   └── generated/ManifestTypes.d.ts     ← auto-generated, do not edit
├── Solutions/                           ← pac solution (packaging)
├── package.json
└── tsconfig.json
```

---

## 5. Prerequisites and scaffolding

| Tool | Check |
|---|---|
| Node.js LTS | `node --version` |
| Power Platform CLI | `pac --version` |
| .NET SDK / VS Build Tools | `dotnet --version` |

```bash
mkdir AdressField_EN && cd AdressField_EN
pac pcf init --namespace FWL --name AdressField_EN --template field --framework react --run-npm-install
npm install @fluentui/react-components@9.46.2 --save
```

`react` and `@fluentui/react-components` are provided by the platform at
runtime (`platform-library`). The npm packages are only used for compilation
and typing.

---

## 6. Photon API usage

### 6.1 Search request

```
GET {photonBaseUrl}/api
    ?q={text without house number}
    &lang=en
    &limit=5
    &layer=street&layer=locality&layer=district&layer=city
    [&countrycode=FR&countrycode=BE]
    [&lat={latitude.raw}&lon={longitude.raw}&zoom=12]
```

| Rule | Detail |
|---|---|
| `lang` | Public instance accepts only `default`, `de`, `en`, `fr`. Default: `en` |
| `limit` | Public instance max = 50; the control clamps to 10 |
| `layer` | Repeated param. **Never `house`** |
| `countrycode` | Repeated param, uppercase ISO alpha-2 |
| Location bias | Only when both `latitude.raw` and `longitude.raw` are non-null |
| CORS | Public instance returns `Access-Control-Allow-Origin: *` → plain `fetch`, no proxy |

### 6.2 Response used

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": { "type": "Point", "coordinates": [2.3454332, 48.8594512] },
    "properties": {
      "osm_type": "W", "osm_id": 693307149, "osm_key": "highway", "osm_value": "residential",
      "type": "street", "name": "Rue de Rivoli",
      "locality": "Les Halles", "district": "Paris", "city": "Paris",
      "state": "Île-de-France", "country": "France", "countrycode": "FR", "postcode": "75001"
    }
  }]
}
```

### 6.3 Errors

| Response | Meaning | Control behaviour |
|---|---|---|
| 200 + empty `features` | No match | Dropdown shows "No address found" |
| 400 + JSON | Invalid parameter (bad `lang`, `layer`…) | Console error + inline message "Address search misconfigured" |
| 503 + **HTML** body | Throttled (fair use) | Inline message "Address service busy, please retry"; typing never blocked |
| Network error / timeout (8 s) | Offline or blocked | Inline message "Address service unavailable" |
| Aborted request | Superseded by a newer keystroke | Silently ignored |

Always check `response.ok` **before** `response.json()` (503 is HTML).

### 6.4 Fair use and attribution

- Minimum characters, the 500 ms call interval (§7.5) and abort are **mandatory** (public instance throttles abusive clients).
- In-memory cache of the last 50 queries (key = full query string).
- The dropdown footer shows **"© OpenStreetMap contributors"** (required by the ODbL licence).
- For production volume, set `photonBaseUrl` to a self-hosted Photon instance
  (and add its domain to `<external-service-usage>`).

---

## 7. Business rules

### 7.1 Configuration parsing (`config.ts`)

```ts
const ALLOWED_LANGS = ["en", "fr", "de", "default"];
const ALLOWED_LAYERS = ["street", "locality", "district", "city", "county", "state", "country", "other"];

lang     = ALLOWED_LANGS.includes(v?.toLowerCase()) ? v.toLowerCase() : "en";
layers   = csv(v ?? "street,locality,district,city").filter(l => ALLOWED_LAYERS.includes(l)); // "house" dropped
           // if empty after filtering → default list
countries = csv(v).map(c => c.toUpperCase()).filter(c => /^[A-Z]{2}$/.test(c));
limit    = clamp(v ?? 5, 1, 10);
minChars = clamp(v ?? 3, 2, 10);
interval = clamp(v ?? 500, 250, 2000);   // requestIntervalMs
baseUrl  = (v || "https://photon.komoot.io").replace(/\/+$/, "");
```

### 7.2 House number extraction (`houseNumber.ts`)

Applied only when `keepHouseNumber = true`.

| Pattern | Example input | House number | Query sent |
|---|---|---|---|
| Leading number | `10 rue de rivoli` | `10` | `rue de rivoli` |
| Leading number + suffix | `10bis rue de rivoli`, `10 bis, rue…`, `221B baker street` | `10bis` / `10 bis` / `221B` | `rue de rivoli` / `baker street` |
| Trailing number (DE style) | `hauptstraße 10a` | `10a` | `hauptstraße` |
| Number range | `12-14 rue x` | `12-14` | `rue x` |
| No number | `rue de rivoli` | — | `rue de rivoli` |
| Only a number | `10` | — | not sent (below search rules) |

Reference regexes:

```ts
const LEADING  = /^\s*(\d+(?:\s?-\s?\d+)?\s?(?:[a-zA-Z]|bis|ter|quater)?)\b[\s,]+(.+)$/i;
const TRAILING = /^(.+?)[\s,]+(\d+(?:\s?-\s?\d+)?\s?[a-zA-Z]?)\s*$/;
```

The minimum-characters rule applies to the **query sent** (after extraction).

### 7.3 Address line formatting (`addressMapper.ts`)

```
street result  → line = order(houseNumber, name, countrycode)
other layers   → line = name     (house number ignored: no street to attach it to)
```

Countries where the number follows the street:
`DE, AT, CH, NL, BE, DK, SE, NO, FI, PL, CZ, SK, IT, ES, PT, HR, SI, HU, RO, BR`.
Others (FR, GB, US, CA, IE, LU, AU…): number first.

Mapping to `ParsedAddress`:

| Field | Source |
|---|---|
| `addressLine` | §7.3 above |
| `postalCode` | `postcode` |
| `city` | `city` ?? `district` ?? `locality` ?? (`name` if `type` = `city`) |
| `county` | `county` |
| `stateOrProvince` | `state` |
| `country` | `country` |
| `countryCode` | `countrycode?.toUpperCase()` |
| `latitude` | `coordinates[1]` |
| `longitude` | `coordinates[0]` |

### 7.5 Call rate limit (throttle with trailing call)

Rule: **the control never starts two Photon calls less than
`requestIntervalMs` (default 500 ms) apart.** This is a throttle, not a plain
debounce: the user gets suggestions while still typing, but the API is never
hit faster than the limit.

Algorithm (in `AddressAutocomplete` / `PhotonClient`):

1. On each keystroke, compute the query to send (§7.2). If it is shorter than
   `minChars` (default 3): cancel any pending search, close the list, stop.
2. Store it as `latestQuery`.
3. If no call was started in the last `requestIntervalMs` and no timer is
   pending → call Photon now (`lastCallStart = Date.now()`).
4. Otherwise schedule **one** timer for
   `lastCallStart + requestIntervalMs − now`. Further keystrokes only update
   `latestQuery`; they never create extra timers.
5. When the timer fires, send `latestQuery` (skip if identical to the last
   query already sent or cached).
6. A new call aborts the in-flight one (`AbortController`). An aborted call
   still counts towards the interval.
7. A response is ignored if its query differs from `latestQuery`.
8. Cache hits do not call the API and therefore do not count towards the limit.
9. Selecting a suggestion or blurring cancels any pending timer.

```ts
function scheduleSearch(query: string) {
  latestQuery = query;
  if (query.length < minChars) { clearTimeout(timer); timer = undefined; return; }
  if (timer) return;                                   // one timer max
  const wait = Math.max(0, lastCallStart + intervalMs - Date.now());
  timer = setTimeout(() => {
    timer = undefined;
    if (latestQuery === lastSentQuery) return;
    lastCallStart = Date.now();
    lastSentQuery = latestQuery;
    void run(latestQuery);                             // fetch + abort previous
  }, wait);
}
```

### 7.4 Suggestion display and deduplication

- **Primary line**: formatted address line (with house number when applicable).
- **Secondary line**: `postcode city, country` (empty parts skipped).
- **Client-side dedupe**: Photon can return several ways of the same street
  with the same postcode (e.g. two `Rue de Rivoli 75001 Paris`). Keep the
  first feature for each `primary + secondary` key.

---

## 8. UI specification (Fluent UI 9)

| Element | Fluent component | Detail |
|---|---|---|
| Wrapper | `FluentProvider` | `webLightTheme`, width 100% |
| Input + dropdown | `Combobox` with `freeform` | Options rendered from state; no built-in filtering |
| Suggestion | `Option` | `text` = primary line; children = primary (semibold) + secondary (caption) |
| Loading | `Spinner size="tiny"` | Inside the input's `expandIcon` slot while the request is pending |
| Empty / error | Disabled `Option` or `Caption1` under the list | Text from §6.3 |
| Clear | `Dismiss` icon button | Visible when text is not empty and control is enabled |
| Attribution | `Caption1` in list footer | "© OpenStreetMap contributors" |

### Behaviour

| Event | Action |
|---|---|
| Typing | Update text; schedule a search (§7.5) if `query.length ≥ minChars` |
| ↑ / ↓ | Move the active option (Combobox native) |
| Enter | Select the active option |
| Esc | Close the list, keep the text |
| Select option | Fill outputs, set text to the address line, close list, `notifyOutputChanged()` |
| Blur without selection | If text changed: write free text to `addressLine`, `notifyOutputChanged()` |
| Clear | Empty the text and all outputs, `notifyOutputChanged()` |
| Late response | Ignored if its query ≠ current query |
| `isControlDisabled` | Combobox `disabled`, no search, no clear button |
| `isVisible = false` | Render nothing |

### Accessibility

Combobox provides `role="combobox"`, `aria-expanded`, `aria-activedescendant`.
Add `aria-label` = control label (`context.mode.label`) and announce the result
count with a visually hidden `aria-live="polite"` region ("5 addresses found").

---

## 9. Lifecycle (`index.ts`)

| Method | Responsibility |
|---|---|
| `init` | Store `notifyOutputChanged`; create `PhotonClient(baseUrl)`; read initial `addressLine.raw` |
| `updateView` | Re-read config; if `addressLine.raw` changed **from outside** (and differs from the last value written by the control) → refresh text; return `<AddressAutocomplete … />` |
| `getOutputs` | Return the pending outputs (§2.3), then reset the "dirty" state |
| `destroy` | Abort the in-flight request, clear the pending-search timer |

Props passed to `AddressAutocomplete`:

```ts
interface AddressAutocompleteProps {
  value: string;                    // addressLine.raw ?? ""
  disabled: boolean;                // context.mode.isControlDisabled
  label: string;                    // context.mode.label
  placeholder: string;
  config: AddressFieldConfig;       // §7.1
  bias?: { lat: number; lon: number };
  maxLength?: number;               // addressLine.attributes?.MaxLength
  search: (query: string) => Promise<PhotonFeature[]>;  // PhotonClient.search
  onSelect: (address: ParsedAddress) => void;
  onFreeText: (text: string) => void;
  onClear: () => void;
}
```

Never pass `context` itself to the React component.

---

## 10. Types (`photonTypes.ts`)

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

export interface ParsedAddress {
  addressLine: string;
  postalCode: string;
  city: string;
  county: string;
  stateOrProvince: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  secondaryLine: string; // display only
}

export interface AddressFieldConfig {
  baseUrl: string;
  lang: "en" | "fr" | "de" | "default";
  countryCodes: string[];
  layers: Exclude<PhotonLayer, "house">[];
  limit: number;
  minChars: number;
  requestIntervalMs: number;
  keepHouseNumber: boolean;
}
```

---

## 11. Test plan

### 11.1 Unit tests (pure functions)

| Function | Cases |
|---|---|
| `extractHouseNumber` | All rows of §7.2 |
| `formatAddressLine` | FR (`10 Rue de Rivoli`), DE (`Hauptstraße 10`), GB (`221B Baker Street`), no number, non-street layer |
| `toParsedAddress` | Coordinates not swapped; city fallback; missing fields → `""` |
| `parseConfig` | `lang=xx` → `en`; `layers=house,street` → `[street]`; `layers=house` → default list; clamps |
| `dedupe` | Two identical street/postcode features → one |

### 11.2 Test harness (`npm start watch`, http://localhost:8181)

| # | Scenario | Expected |
|---|---|---|
| 1 | Type `ri` | No request (below 3 chars) |
| 2 | Type `rue de rivoli` quickly (one key every ~100 ms) | At most **1** request per 500 ms; the final request always uses the full text; the network tab never shows two calls starting less than 500 ms apart |
| 3 | Set `countryCodes = FR`, type `10 rue de rivoli`, pick `10 Rue de Rivoli – 75001 Paris, France` | `addressLine = "10 Rue de Rivoli"`, postcode `75001`, city `Paris`, country `France`, countryCode `FR`, lat ≈ 48.86, lon ≈ 2.35 |
| 4 | `countryCodes = DE`, type `hauptstrasse 5 berlin` | DE results only, line `Hauptstraße 5` |
| 5 | Default config (`GB`), type `221b baker street london`, pick | `addressLine = "221B Baker Street"`, country `United Kingdom`, countryCode `GB` |
| 6 | Type gibberish `zzzqqq` | "No address found" |
| 7 | Type free text, tab out | Only `addressLine` written |
| 8 | Clear button | All outputs empty |
| 9 | Disabled form | Read-only, no request |
| 10 | Set `photonBaseUrl` to an invalid host | "Address service unavailable", typing still works |
| 11 | `layers = house` | Falls back to default layers, console warning |

### 11.3 In Dataverse

- Account main form: bind to `address1_*` columns, save, reopen → values persisted and displayed.
- Verify the control in the unified interface on desktop and on mobile (Power Apps app).

---

## 12. Build, package, deploy

```bash
# Development
npm run build
npm start watch                     # test harness on http://localhost:8181

# Production build
npm run build -- --buildMode production

# Solution packaging (first time)
mkdir Solutions && cd Solutions
pac solution init --publisher-name FWL --publisher-prefix fwl
pac solution add-reference --path ..
dotnet build /p:configuration=Release

# Deploy
pac auth create --url https://<org>.crm.dynamics.com
pac solution import --path bin/Release/Solutions.zip
# or quick dev push:
pac pcf push --publisher-prefix fwl
```

Increment `version` in the manifest for every deployment.

---

## 13. Acceptance criteria - final status (Step 12)

Legend: **Auto** = automated test, **Live** = test against the real Photon server, **To confirm** = needs a person in a canvas app (not possible from the CLI).

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Suggestions appear ~1 s after the user stops typing | Auto + Live | Scheduler tests; live calls answered in 0.3-0.8 s; first call is immediate, then at most every 500 ms |
| 2 | No Photon request uses the `house` layer | Auto + Live | `buildSearchQuery` and `parseConfig` tests; manifest test; live test (no `house` results) |
| 3 | Typed house number kept and placed correctly for FR, GB, DE | Auto + Live | `10 Rue de Rivoli`, `221B Baker Street`, `Hauptstraße 5` (live scenarios 3-5) |
| 4 | Default language is English with no configuration | Auto | `parseConfig` and control tests (`lang=en`) |
| 5 | All 9 bound properties written on selection; unbound ones cause no error | Auto | `control.test.ts` |
| 6 | Free text accepted without selection | Auto | component + control tests |
| 7 | Latitude/longitude not swapped | Auto + Live | mapper test; live scenario 3 (Paris lat 48.8, lon 2.3) |
| 8 | 503 / network errors never block typing or saving | Auto | client + component tests (503 simulated, not seen live) |
| 9 | OpenStreetMap attribution visible in the dropdown | Auto | component test |
| 10 | Keyboard-only usage (type, down, Enter, Esc) | Auto (Enter) / **To confirm** | Fluent Combobox native behaviour; check visually |
| 11 | Bundle does not include React or Fluent | Done | production bundle 21 KB; no React/ReactDOM code inside |
| 12 | Imports and publishes in Dataverse | Done | solution `AdressField_EN` 0.0.1.0 imported into environment US |
| 13 | Works in a canvas app (OnChange, null = blank, sizes, DisplayMode) | **To confirm** | test steps given at Step 11 |
| 14 | 500 ms rule with real timing | Live | 4 calls at 514 / 513 / 500 ms intervals while typing 17 characters at 90 ms |

Totals at hand-over: **170 unit tests + 6 live tests pass**, ESLint clean, development and production builds succeed.

---

## 14. Open points to confirm

| # | Question | Default assumed in this spec |
|---|---|---|
| 1 | Namespace / publisher prefix | `FWL` / `fwl` |
| 2 | Default layers | `street,locality,district,city` |
| 3 | Default country restriction | **`GB`** (confirmed) |
| 4 | Public Photon instance acceptable for production? | Yes for pilot (`https://photon.komoot.io`); self-hosted recommended for volume |
| 5 | Custom column for `countryCode` | `fwl_countrycode`, optional (`osmReference` removed) |
| 6 | Target environment | `https://uslpe.crm.dynamics.com` (environment `US`, solution imported at Step 11) |


---

## 15. Canvas app specifics (added at Step 9)

| Topic | Behaviour |
|---|---|
| Properties | The 9 `bound` properties are readable **and** settable in canvas (`AddressField.postalCode`, `.latitude`…). The 9 `input` properties appear in the Advanced pane |
| Outputs | Canvas keeps the previous value of a key that is missing or `undefined`, so `getOutputs()` **always returns the complete state** of the 9 outputs |
| Clearing | Text → `""`; latitude/longitude → `null` = blank in canvas apps (confirmed). `undefined` would leave the old number |
| Values set from outside | A formula / variable changing an input property replaces the corresponding output state |
| `OnChange` | `notifyOutputChanged()` triggers the control's `OnChange`: use it to copy `AddressField.postalCode`, `.city`… into variables / collections / Dataverse |
| MaxLength | Not provided in canvas (`attributes` is empty): no truncation. Model-driven forms still truncate |
| Size | `context.mode.allocatedHeight` selects the Fluent size: < 32 px small, < 40 px medium, otherwise large (unknown → medium) |
| Label | `context.mode.label` is empty in canvas: accessible name falls back to "Address" |
| Disabled | `DisplayMode.View/Disabled` → `isControlDisabled` → read-only field |
| Licence | The external call to `photon.komoot.io` makes the component **premium** (apps using it need premium Power Apps licences) |
| Not used | `context.webAPI` (unavailable in canvas), web storage, custom auth |
| Tenant settings | "Power Apps component framework for canvas apps" must be enabled on the environment before the component can be added to an app (Step 11) |

### Findings from the first deployment (Step 11)

| Finding | Fix |
|---|---|
| Dataverse rejects apostrophes in manifest attribute values (`noAposStringType`) | Description of `layers` reworded; a unit test now guards it |
| Environment `US` does not support the Fluent platform library 9.68.0 (the `pac pcf init` default) | Manifest and `package.json` pinned to **Fluent 9.46.2**; React 16.14.0 |


---

## 16. Hand-over notes

### Going to production
- **Public Photon server:** fair use only, no availability guarantee. Fine for a pilot; the 3-character minimum, 500 ms interval, cancelling and caching limit the load, but many simultaneous users share the same limits.
- **Self-hosting Photon:** run your own instance (Java jar, `serve`, with a country database dump), put it behind HTTPS (canvas apps are HTTPS, so a plain `http://` URL is blocked) and make sure it answers cross-origin requests from the Power Apps domains (Photon CORS option or reverse proxy header). Then set `photonBaseUrl` and add the new domain to `<external-service-usage>` in the manifest (rebuild, bump the version, re-import). Without that declaration the component would call an undeclared domain.
- **Managed solution:** use `dist/AdressField_EN_managed.zip` (production bundle) for test/production environments; the unmanaged one is for development.
- **Licensing:** premium Power Apps licences are required for apps that use the component.

### Known limits
- A house number is taken from what the user types; Photon cannot confirm it exists on the street (no `house` layer by design).
- `countryCodes` defaults to `GB`; clear the property for a worldwide search.
- Public instance languages: `en`, `fr`, `de`, `default` only.
- The control always uses the light Fluent theme.
- Fluent platform library pinned to 9.46.2 (9.68.0 is refused by the US environment).
- `bound` properties are not linked to Dataverse columns in canvas apps; copy the values in `OnChange` (see README).

### Possible next steps
`git init` and a first commit; a Power Fx sample app (`.msapp`); an `OnSelect` custom event; translated labels (RESX); dark theme support; a CI pipeline (`pac pcf` build, tests, solution pack).
