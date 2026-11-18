# Photon in a PCF address-autocomplete control

Combine with the `pcf-component` skill (manifest, lifecycle, React/Fluent).

## 1. Manifest design

Bind the visible text to the main address line and expose the other parts as
optional bound properties, so makers can map them to `address1_*` columns.
`notifyOutputChanged()` then writes all of them at once when a suggestion is
picked.

```xml
<property name="addressLine" display-name-key="Address line" of-type="SingleLine.Text" usage="bound" required="true" />
<property name="postcode"    display-name-key="Postal code"  of-type="SingleLine.Text" usage="bound" required="false" />
<property name="city"        display-name-key="City"         of-type="SingleLine.Text" usage="bound" required="false" />
<property name="county"      display-name-key="County"       of-type="SingleLine.Text" usage="bound" required="false" />
<property name="state"       display-name-key="State"        of-type="SingleLine.Text" usage="bound" required="false" />
<property name="country"     display-name-key="Country"      of-type="SingleLine.Text" usage="bound" required="false" />
<property name="latitude"    display-name-key="Latitude"     of-type="FP"              usage="bound" required="false" />
<property name="longitude"   display-name-key="Longitude"    of-type="FP"              usage="bound" required="false" />

<!-- configuration (input) -->
<property name="photonUrl"     display-name-key="Photon base URL"     of-type="SingleLine.Text" usage="input" default-value="https://photon.komoot.io" />
<property name="countryCodes"  display-name-key="Country codes (CSV)" of-type="SingleLine.Text" usage="input" />
<property name="language"      display-name-key="Language (default/de/en/fr)" of-type="SingleLine.Text" usage="input" />
<property name="maxResults"    display-name-key="Max suggestions"     of-type="Whole.None" usage="input" default-value="5" />
<property name="minChars"      display-name-key="Min characters"      of-type="Whole.None" usage="input" default-value="3" />
```

Dataverse `address1_*` targets: `address1_line1`, `address1_postalcode`,
`address1_city`, `address1_county`, `address1_stateorprovince`,
`address1_country`, `address1_latitude`, `address1_longitude` (Float).

### External service declaration

Calling an external domain from a code component makes it a **premium**
component when declared. Declare it so admins see it:

```xml
<external-service-usage enabled="true">
  <domain>photon.komoot.io</domain>
</external-service-usage>
```

(Place it inside `<control>`. If the base URL is configurable, list each domain
you expect.) Model-driven apps do not block `fetch` to external origins, and
Photon answers with `Access-Control-Allow-Origin: *`, so no proxy is needed.

## 2. Client (framework-free)

```ts
import { PhotonFeature, PhotonFeatureCollection, PhotonSearchParams } from "./photonTypes";

export class PhotonError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export class PhotonClient {
  private controller?: AbortController;
  private cache = new Map<string, PhotonFeature[]>();

  constructor(private baseUrl = "https://photon.komoot.io") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private buildQuery(p: PhotonSearchParams): string {
    const qs = new URLSearchParams();
    qs.set("q", p.q);
    if (p.limit) qs.set("limit", String(Math.min(p.limit, 50)));
    if (p.lang) qs.set("lang", p.lang);
    if (p.lat !== undefined && p.lon !== undefined) {
      qs.set("lat", String(p.lat));
      qs.set("lon", String(p.lon));
      if (p.zoom !== undefined) qs.set("zoom", String(p.zoom));
      if (p.location_bias_scale !== undefined) qs.set("location_bias_scale", String(p.location_bias_scale));
    }
    if (p.bbox) qs.set("bbox", p.bbox.join(","));
    p.countrycode?.forEach(c => qs.append("countrycode", c.trim().toUpperCase()));
    p.layer?.forEach(l => qs.append("layer", l));
    p.include?.forEach(i => qs.append("include", i));
    p.exclude?.forEach(e => qs.append("exclude", e));
    p.osm_tag?.forEach(t => qs.append("osm_tag", t));
    if (p.dedupe === false) qs.set("dedupe", "0");
    return qs.toString();
  }

  /** Cancels any previous in-flight search. Resolves [] when aborted. */
  async search(p: PhotonSearchParams): Promise<PhotonFeature[]> {
    const query = this.buildQuery(p);
    const cached = this.cache.get(query);
    if (cached) return cached;

    this.controller?.abort();
    this.controller = new AbortController();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api?${query}`, { signal: this.controller.signal });
    } catch (e) {
      if ((e as Error).name === "AbortError") return [];
      throw new PhotonError("Network error", 0);
    }
    if (!res.ok) {
      // 503 = throttled (HTML body); 400 = validation (JSON body)
      throw new PhotonError(res.status === 503 ? "Address service busy, retry shortly" : `Photon error ${res.status}`, res.status);
    }
    const data = (await res.json()) as PhotonFeatureCollection;
    if (this.cache.size > 100) this.cache.clear();
    this.cache.set(query, data.features);
    return data.features;
  }

  async reverse(lat: number, lon: number, lang?: string): Promise<PhotonFeature | undefined> {
    const qs = new URLSearchParams({ lat: String(lat), lon: String(lon), limit: "1" });
    if (lang) qs.set("lang", lang);
    const res = await fetch(`${this.baseUrl}/reverse?${qs}`);
    if (!res.ok) throw new PhotonError(`Photon error ${res.status}`, res.status);
    return ((await res.json()) as PhotonFeatureCollection).features[0];
  }

  dispose(): void { this.controller?.abort(); }
}
```

## 3. Language from the user context

```ts
/** Map Dataverse user LCID to a language supported by the public instance. */
export function photonLang(lcid: number): "de" | "en" | "fr" | undefined {
  const map: Record<number, "de" | "en" | "fr"> = {
    1031: "de", 2055: "de", 3079: "de",           // de-DE, de-CH, de-AT
    1033: "en", 2057: "en", 3081: "en", 4105: "en", // en-US, en-GB, en-AU, en-CA
    1036: "fr", 2060: "fr", 3084: "fr", 4108: "fr", // fr-FR, fr-BE, fr-CA, fr-CH
  };
  return map[lcid]; // undefined → omit lang, browser Accept-Language is used
}
// usage: photonLang(context.userSettings.languageId)
```

If the maker sets `language` explicitly, validate it against
`default|de|en|fr` (public instance) and ignore anything else.

## 4. Autocomplete behaviour checklist

- Debounce input ~300 ms; no request below `minChars` (default 3).
- Abort the previous request on each new one (`PhotonClient.search` does it).
- Ignore late responses: compare the query at resolve time with the current
  input value.
- Recommended filters for addresses: `layer=house&layer=street`, plus
  `countrycode` from config. Optionally bias with the record's existing
  lat/lon (`lat`, `lon`, `zoom=12`).
- Keyboard: ↑/↓ move highlight, Enter selects, Esc closes, Tab closes and
  keeps the typed text. Close on blur (use `onMouseDown` + `preventDefault` on
  items so the click fires before blur).
- Accessibility: `role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`; listbox items `role="option"` + `aria-selected`.
- Show "© OpenStreetMap contributors" (small text at the bottom of the list).
- Respect `context.mode.isControlDisabled` (read-only) and
  `context.mode.isVisible`.
- Free text must still be allowed: if the user never picks a suggestion, keep
  the typed value in `addressLine` and leave the other fields untouched.
- On selection: fill all outputs via `toAddress()` (see 02-response.md), set
  input text to `line1`, call `notifyOutputChanged()` once.
- In `updateView`, only overwrite the input text when the bound value changed
  from outside (not while the user is typing).
- Errors (503, network): show a discreet inline message, never block typing.
- `destroy()`: clear timers, `client.dispose()`, remove listeners.

## 5. getOutputs pattern

```ts
public getOutputs(): IOutputs {
  const a = this.selected; // ParsedAddress | undefined
  if (!a) return { addressLine: this.currentText };
  return {
    addressLine: a.line1,
    postcode: a.postcode,
    city: a.city,
    county: a.county,
    state: a.state,
    country: a.country,
    latitude: a.latitude,
    longitude: a.longitude,
  };
}
```

Outputs for optional properties the maker left unbound are ignored by the
platform, so returning them is harmless. Return `undefined` for a key you do
not want to change (an empty string `""` clears the column).

## 6. Testing quickly

```bash
curl "https://photon.komoot.io/api?q=10%20rue%20de%20rivoli&limit=5&lang=fr&layer=house&layer=street&countrycode=FR"
curl "https://photon.komoot.io/reverse?lat=48.8555&lon=2.3604&limit=1"
curl "https://photon.komoot.io/status"
```

In the PCF test harness (`npm start watch`, localhost:8181) the call works
directly thanks to CORS `*`.
