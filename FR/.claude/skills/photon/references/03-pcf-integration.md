# Photon – Intégration dans le PCF « champ adresse » (Canvas App)

Pour le manifest, le cycle de vie, le build et le déploiement, lisez le skill `pcf`.
Ce fichier ne couvre que ce qui est propre à Photon.

## Propriétés suggérées pour le manifest

Une Canvas App ne lit que les propriétés déclarées : chaque champ d'adresse utile
doit être une propriété **output** (`usage="output"`) ou **bound**.

| Propriété | usage | Type | Rôle |
|---|---|---|---|
| `Value` | bound | `SingleLine.Text` | Libellé complet saisi ou sélectionné |
| `PhotonBaseUrl` | input | `SingleLine.Text` | Défaut `https://photon.komoot.io` |
| `CountryCodes` | input | `SingleLine.Text` | Ex. `FR` ou `FR,BE`, envoyé en `countrycode` répété |
| `Language` | input | `SingleLine.Text` | `fr` par défaut, filtré parmi `default\|de\|en\|fr` |
| `Layers` | input | `SingleLine.Text` | Défaut `house,street` |
| `MaxResults` | input | `Whole.None` | Défaut 5, borné entre 1 et 50 |
| `MinCharsNumeric` | input | `Whole.None` | Seuil si la saisie **commence par un chiffre**. Défaut **8** (choix du projet) |
| `MinCharsText` | input | `Whole.None` | Seuil sinon. Défaut **3** (choix du projet) |
| `DebounceMs` | input | `Whole.None` | Défaut **500** (choix du projet) |
| `BiasLatitude` / `BiasLongitude` | input | `FP` | Biais optionnel, ex. position de l'agence |
| `HouseNumber`, `Street`, `PostCode`, `City`, `County`, `State`, `Country`, `CountryCode` | output | `SingleLine.Text` | Champs normalisés de l'adresse retenue |
| `Latitude`, `Longitude` | output | `FP` | Coordonnées de l'adresse retenue |
| `OsmId` | output | `SingleLine.Text` | Identifiant stable (`N703432291`) |
| `IsValidated` | output | `TwoOptions` | `true` uniquement si l'utilisateur a **choisi** une suggestion |

Dans le Canvas, la formule `OnChange` du composant peut lire `MonCtrl.City`,
`MonCtrl.Latitude`, etc.

## Client Photon (TypeScript, sans dépendance)

À placer dans `<Control>/services/PhotonClient.ts`. Il réutilise les types et
`normalize()` de `02-response.md`.

```typescript
import { PhotonFeatureCollection, NormalizedAddress, normalize } from "./photonTypes";

const SUPPORTED_LANGS = ["default", "de", "en", "fr"];

export interface PhotonSearchOptions {
  baseUrl: string;
  lang?: string;
  limit?: number;
  minCharsNumeric?: number; // saisie commençant par un chiffre, défaut 8
  minCharsText?: number;    // autre saisie, défaut 3
  countryCodes?: string[];
  layers?: string[];
  bias?: { lat: number; lon: number; zoom?: number; scale?: number };
  bbox?: [number, number, number, number]; // minLon,minLat,maxLon,maxLat
}

export class PhotonClient {
  private controller?: AbortController;
  private cache = new Map<string, NormalizedAddress[]>();

  constructor(private readonly opts: PhotonSearchOptions) {}

  /** Recherche au fil de la frappe. Annule la requête précédente encore en vol. */
  async search(query: string): Promise<NormalizedAddress[]> {
    const q = query.trim();
    if (q.length < this.minLength(q)) return [];

    const url = this.buildUrl("/api", { q });
    const cached = this.cache.get(url);
    if (cached) return cached;

    this.controller?.abort();
    this.controller = new AbortController();

    const res = await fetch(url, { signal: this.controller.signal });
    if (!res.ok) throw new PhotonError(res.status, await safeText(res));

    const data = (await res.json()) as PhotonFeatureCollection;
    const result = data.features.map(normalize);
    if (this.cache.size > 100) this.cache.clear();
    this.cache.set(url, result);
    return result;
  }

  /** Géocodage inverse, par exemple pour un bouton « Ma position ». */
  async reverse(lat: number, lon: number): Promise<NormalizedAddress | undefined> {
    const url = this.buildUrl("/reverse", {
      lat: String(lat), lon: String(lon), radius: "0.1",
    }, { skipBias: true, limit: 1 });
    const res = await fetch(url);
    if (!res.ok) throw new PhotonError(res.status, await safeText(res));
    const data = (await res.json()) as PhotonFeatureCollection;
    return data.features[0] ? normalize(data.features[0]) : undefined;
  }

  /** 8 caractères si la saisie commence par un chiffre, 3 sinon. */
  minLength(q: string): number {
    return /^\d/.test(q)
      ? this.opts.minCharsNumeric ?? 8
      : this.opts.minCharsText ?? 3;
  }

  cancel(): void {
    this.controller?.abort();
  }

  private buildUrl(
    path: string,
    params: Record<string, string>,
    o: { skipBias?: boolean; limit?: number } = {},
  ): string {
    const sp = new URLSearchParams(params);
    const lang = (this.opts.lang ?? "fr").toLowerCase();
    sp.set("lang", SUPPORTED_LANGS.includes(lang) ? lang : "fr");
    sp.set("limit", String(clamp(o.limit ?? this.opts.limit ?? 5, 1, 50)));

    // Paramètres répétables : append, pas set, et jamais de valeurs séparées par des virgules
    this.opts.countryCodes?.forEach(c => sp.append("countrycode", c.trim().toUpperCase()));
    this.opts.layers?.forEach(l => sp.append("layer", l.trim()));

    if (!o.skipBias && this.opts.bias) {
      sp.set("lat", String(this.opts.bias.lat));
      sp.set("lon", String(this.opts.bias.lon));
      if (this.opts.bias.zoom) sp.set("zoom", String(this.opts.bias.zoom));
      if (this.opts.bias.scale != null) sp.set("location_bias_scale", String(this.opts.bias.scale));
    }
    if (this.opts.bbox) sp.set("bbox", this.opts.bbox.join(","));

    return `${this.opts.baseUrl.replace(/\/+$/, "")}${path}?${sp.toString()}`;
  }
}

export class PhotonError extends Error {
  constructor(public readonly status: number, body: string) {
    super(`Photon HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const safeText = (r: Response) => r.text().catch(() => "");
```

## Debounce et gestion des erreurs côté composant

```typescript
private debounceTimer?: number;

private onInput(text: string): void {
  this.isValidated = false;                 // toute frappe invalide la sélection
  this.value = text;
  this.notifyOutputChanged();

  window.clearTimeout(this.debounceTimer);
  this.debounceTimer = window.setTimeout(async () => {
    try {
      this.suggestions = await this.client.search(text);
      this.renderSuggestions();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;   // requête remplacée : normal
      this.suggestions = [];
      this.renderError(e instanceof PhotonError && e.status === 429
        ? "Service d'adresse saturé, réessayez dans un instant."
        : "Recherche d'adresse indisponible. Saisie libre possible.");
    }
  }, this.debounceMs);
}

public destroy(): void {
  window.clearTimeout(this.debounceTimer);
  this.client.cancel();
}
```

Points importants :

- **Recréez le `PhotonClient` dans `updateView`** seulement si une propriété de
  configuration a changé (URL, pays, langue…). Sinon, le cache et l'`AbortController`
  sont perdus à chaque rendu.
- **La saisie libre doit rester possible** : si Photon est indisponible, `Value`
  garde le texte tapé et `IsValidated` reste `false`.
- À la sélection d'une suggestion : remplissez toutes les sorties, passez
  `IsValidated = true` et appelez `notifyOutputChanged()` **une seule fois**.
- **Ne réinterrogez pas Photon** quand `updateView` reçoit une `Value` venant du
  Canvas, par exemple au chargement d'un enregistrement. Affichez-la telle quelle.

## Accessibilité de la liste de suggestions

Utilisez le pattern combobox ARIA (`role="combobox"`, `aria-expanded`,
`aria-activedescendant`, `role="listbox"`/`option`). Gérez les touches ↑ / ↓ / Entrée /
Échap. Avec React et Fluent UI, un `Combobox` (v9) ou `ComboBox` (v8) en mode
`freeform` le fournit directement. Voir `references/05-react.md` du skill `pcf`.

Ajoutez une mention « © OpenStreetMap contributors » en pied de liste (licence ODbL).

## Contraintes Power Platform

- **Pas de connecteur requis** : l'appel `fetch` part du navigateur, et CORS est ouvert
  sur Photon.
- Si une **politique DLP ou un proxy d'entreprise** bloque les domaines externes, il faut
  une instance Photon interne, renseignée via `PhotonBaseUrl`.
- **Licence premium** : un code component qui appelle un service externe directement
  depuis le navigateur, sans passer par un connecteur, est classé **premium**. Les
  utilisateurs de l'app ont alors besoin d'une licence Power Apps premium. Déclarez-le
  dans `ControlManifest.Input.xml`, à l'intérieur de `<control>` :

  ```xml
  <external-service-usage enabled="true">
    <domain>photon.komoot.io</domain>
    <!-- ajouter le domaine de l'instance auto-hébergée le cas échéant -->
  </external-service-usage>
  ```

  Faites valider ce point avec le client avant le développement, car il conditionne
  le coût de licence.
- Ne déclarez **pas** `<feature-usage><uses-feature name="WebAPI">`, qui ne concerne
  que Dataverse.
- Dans le test harness (`npm start watch`), les appels Photon fonctionnent tels quels,
  ce qui est pratique pour tester l'autocomplétion sans déployer.
