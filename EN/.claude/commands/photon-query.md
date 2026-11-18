Run a live query against the Photon geocoder and show the parsed results.

Arguments: $ARGUMENTS
Format: `[search|reverse|structured] <query or lat,lon or key=value...> [extra params]`
Examples: `/photon-query search 10 rue de rivoli lang=fr countrycode=FR`,
`/photon-query reverse 48.8555,2.3604`, `/photon-query structured city=paris street=rue de rivoli housenumber=10`

## What you must do

1. Read `.claude/skills/photon/references/01-api.md` (parameters, validation rules)
   and `.claude/skills/photon/references/02-response.md` (fields).

2. Build the URL against `https://photon.komoot.io` (or the base URL the user gives):
   - `search` → `/api?q=...` (default `limit=5`)
   - `reverse` → `/reverse?lat=..&lon=..&limit=1`
   - `structured` → `/structured?...`
   URL-encode values; repeat `layer`, `countrycode`, `include`, `exclude` params.
   Validate `lang` ∈ default/de/en/fr and `layer` values before calling.

3. Run it once with `curl -s` (one request only — fair use).

4. Show the URL, then a table: label, type (layer), postcode, city, country, lat, lon.
   On 503 explain it is throttling; on 400 show the validation message.
