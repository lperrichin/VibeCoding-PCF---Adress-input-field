# AdressField_EN

Address autocompletion code component (PCF) for **Power Apps canvas apps**, powered by
[Photon](https://photon.komoot.io) (OpenStreetMap data). React 16.14.0 + Fluent UI 9.46.2 (platform libraries; newer Fluent versions such as 9.68.0 are rejected by the US environment).
Full specification: [`../AdressField_EN_Specification.md`](../AdressField_EN_Specification.md).

| | |
|---|---|
| Component | `FWL.AdressFieldEN` (display name **AdressField_EN**) |
| Version | 0.0.1 |
| Solution | `AdressField_EN` (publisher `FWL`, prefix `fwl`) |
| Premium | Yes - calls `photon.komoot.io` (external-service-usage) |

## Packages (`dist/`)

| File | Use |
|---|---|
| `AdressField_EN_managed.zip` | Production build (minified, ~21 KB bundle), managed solution |
| `AdressField_EN_unmanaged.zip` | Development build, unmanaged solution |

## Commands

```bash
npm install            # once
npm run build          # development build
npm start watch        # test harness on http://localhost:8181
npm run lint
npm test               # unit tests (offline)
LIVE_PHOTON=1 npx jest tests/live.test.ts   # live scenarios against photon.komoot.io

# production build + solution packages
cd Solutions
dotnet build --configuration Release   # bin/Release/Solutions.zip  (managed)
dotnet build --configuration Debug     # bin/Debug/Solutions.zip    (unmanaged)
```

Increment `version` in `AdressFieldEN/ControlManifest.Input.xml` (and the solution version in
`Solutions/src/Other/Solution.xml`) for every deployment.

## Using it in a canvas app

1. **Once per environment** (Power Platform admin center -> Environments -> Settings -> Product -> Features):
   enable **Power Apps component framework for canvas apps**.
2. Import the solution zip into the environment (make.powerapps.com -> Solutions -> Import).
3. In the canvas app: Insert -> Get more components -> **Code** -> `AdressField_EN` -> Import, then insert it.
4. Premium licences are required for apps that use it (external call to `photon.komoot.io`).

### Properties

Bound (readable and settable): `addressLine`, `postalCode`, `city`, `county`, `stateOrProvince`,
`country`, `countryCode`, `latitude`, `longitude`.

Configuration (Advanced pane): `photonBaseUrl` (`https://photon.komoot.io`), `language` (`en`),
`countryCodes` (`GB`), `layers` (`street,locality,district,city`; `house` is ignored),
`maxResults` (5), `minChars` (3), `requestIntervalMs` (500), `keepHouseNumber` (true), `placeholder`.

### Reading the result

`OnChange` fires when the user picks a suggestion, leaves the field with free text, or clears it:

```powerfx
// AdressField_EN1.OnChange
UpdateContext({
    locStreet: AdressField_EN1.addressLine,
    locPostcode: AdressField_EN1.postalCode,
    locCity: AdressField_EN1.city,
    locCountry: AdressField_EN1.country,
    locLat: AdressField_EN1.latitude,
    locLon: AdressField_EN1.longitude
})
```

Setting a property from a formula or variable (for example the saved street of a record) replaces
the control's current value for that property.

## Status

170 unit tests + 6 live tests pass, lint clean. Imported in environment `US` (unmanaged, 0.0.1.0). Final checklist: spec section 13. Canvas Studio check (OnChange, null = blank, sizes) is still to be confirmed by a maker.

## Notes

- The public Photon server is fair-use only: at most one call per 500 ms, at least 3 characters.
  For heavy use, self-host Photon, set `photonBaseUrl`, and add its domain to
  `<external-service-usage>` in the manifest.
- Attribution "(c) OpenStreetMap contributors" is shown in the suggestion list.
