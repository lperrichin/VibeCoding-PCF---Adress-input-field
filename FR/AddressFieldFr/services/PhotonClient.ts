import { isUsable, normalize } from "./addressFormat";
import { DEFAULTS, MAX_LIMIT, SUPPORTED_LAYERS, intInRange, sanitizeLang } from "./photonConfig";
import { NormalizedAddress, PhotonFeatureCollection } from "./photonTypes";

export interface PhotonClientOptions {
    /** URL de base, ex. https://photon.komoot.io (le slash final est ignoré) */
    baseUrl?: string;
    /** default | de | en | fr (sinon repli sur fr) */
    lang?: string;
    /** 1 à 50 */
    limit?: number;
    /** Seuil de déclenchement si la saisie commence par un chiffre (défaut 8) */
    minCharsNumeric?: number;
    /** Seuil de déclenchement sinon (défaut 3) */
    minCharsText?: number;
    /** Codes pays ISO alpha-2 (défaut ["FR"]) */
    countryCodes?: readonly string[];
    /** Couches Photon (défaut ["house", "street"]) */
    layers?: readonly string[];
    /** Point qui favorise les résultats proches, sans les restreindre */
    bias?: { lat: number; lon: number };
}

/** Erreur HTTP renvoyée par Photon (400 paramètre invalide, 429 trop de requêtes, 503 indisponible…). */
export class PhotonError extends Error {
    constructor(public readonly status: number, body: string) {
        super(`Photon HTTP ${status}: ${body.slice(0, 200)}`);
        this.name = "PhotonError";
    }
}

const CACHE_MAX = 100;
/** Photon est interrogé avec `limit` x ce facteur (plafonné à 50) pour compenser les résultats écartés. */
const FETCH_FACTOR = 4;

export class PhotonClient {
    private controller?: AbortController;
    private readonly cache = new Map<string, NormalizedAddress[]>();

    constructor(private readonly opts: PhotonClientOptions = {}) {}

    /** Nombre minimal de caractères : 8 si la saisie commence par un chiffre, 3 sinon. */
    minLength(query: string): number {
        return /^\d/.test(query.trim())
            ? this.opts.minCharsNumeric ?? DEFAULTS.minCharsNumeric
            : this.opts.minCharsText ?? DEFAULTS.minCharsText;
    }

    /**
     * Recherche au fil de la frappe. Renvoie [] sous le seuil sans appeler le réseau.
     * Annule la requête précédente encore en vol (qui lève alors une AbortError chez son appelant).
     */
    async search(query: string): Promise<NormalizedAddress[]> {
        const q = query.trim();
        if (q.length < this.minLength(q)) return [];

        const url = this.buildUrl(q);
        const cached = this.cache.get(url);
        if (cached) return cached;

        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;

        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new PhotonError(res.status, await res.text().catch(() => ""));

        // Une page HTML (proxy, nginx) peut répondre en 200 : on la traite comme une erreur
        let data: PhotonFeatureCollection;
        try {
            data = (await res.json()) as PhotonFeatureCollection;
        } catch {
            throw new PhotonError(res.status, "Réponse non JSON");
        }

        // Photon applique `limit` avant notre filtre (POI sans numéro écartés) : on en demande plus, on tronque ensuite
        // Une même rue peut exister en plusieurs tronçons OSM : on dédoublonne sur le libellé
        const seen = new Set<string>();
        const result = (data.features ?? [])
            .filter(isUsable)
            .map(normalize)
            .filter((a) => {
                const key = a.label.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, this.displayLimit());
        if (this.cache.size >= CACHE_MAX) this.cache.clear();
        this.cache.set(url, result);
        return result;
    }

    /** Nombre de suggestions affichées (1 à 50). */
    private displayLimit(): number {
        return intInRange(this.opts.limit, DEFAULTS.maxResults, 1, MAX_LIMIT);
    }

    /** Annule la requête en cours (à appeler dans destroy()). */
    cancel(): void {
        this.controller?.abort();
        this.controller = undefined;
    }

    /** Construit l'URL de recherche. Publique pour pouvoir être testée. */
    buildUrl(q: string): string {
        const sp = new URLSearchParams();
        sp.set("q", q);
        sp.set("lang", sanitizeLang(this.opts.lang));
        sp.set("limit", String(Math.min(MAX_LIMIT, this.displayLimit() * FETCH_FACTOR)));

        // Paramètres répétables : append, jamais de valeurs séparées par des virgules
        (this.opts.countryCodes ?? DEFAULTS.countryCodes).forEach((c) => sp.append("countrycode", c.toUpperCase()));
        const validLayers = (this.opts.layers ?? DEFAULTS.layers).filter((l) => SUPPORTED_LAYERS.includes(l));
        (validLayers.length > 0 ? validLayers : DEFAULTS.layers).forEach((l) => sp.append("layer", l));

        const bias = this.opts.bias;
        if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lon)) {
            sp.set("lat", String(bias.lat));
            sp.set("lon", String(bias.lon));
        }

        const customBase = this.opts.baseUrl?.trim() ?? "";
        const base = (customBase.length > 0 ? customBase : DEFAULTS.baseUrl).replace(/\/+$/, "");
        return `${base}/api?${sp.toString()}`;
    }
}
