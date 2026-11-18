/** Valeurs par défaut du composant (le manifest ne peut pas en porter) et lecture des listes saisies en Canvas. */

export const DEFAULTS = {
    baseUrl: "https://photon.komoot.io",
    minCharsNumeric: 8,
    minCharsText: 3,
    debounceMs: 500,
    countryCodes: ["FR"],
    lang: "fr",
    maxResults: 5,
    layers: ["house", "street"],
} as const;

/** Langues acceptées par l'instance Photon : toute autre valeur renvoie HTTP 400. */
export const SUPPORTED_LANGS: readonly string[] = ["default", "de", "en", "fr"];

/** Couches Photon valides pour le paramètre `layer`. */
export const SUPPORTED_LAYERS: readonly string[] = [
    "house", "street", "locality", "district", "city", "county", "state", "country", "other",
];

export const MAX_LIMIT = 50;

/** "FR, be ,," -> ["FR", "BE"] ; renvoie `fallback` si la liste est vide ou absente. */
export function parseList(
    raw: string | null | undefined,
    fallback: readonly string[],
    transform: (s: string) => string = (s) => s,
): string[] {
    const items = (raw ?? "")
        .split(",")
        .map((s) => transform(s.trim()))
        .filter((s) => s.length > 0);
    return items.length > 0 ? items : [...fallback];
}

/** URL http(s) valide, sans slash final ; sinon l'instance par défaut. */
export function resolveBaseUrl(raw: string | null | undefined): string {
    const v = (raw ?? "").trim();
    return /^https?:\/\/\S+$/i.test(v) ? v.replace(/\/+$/, "") : DEFAULTS.baseUrl;
}

/** Codes pays ISO alpha-2 en majuscules ; les valeurs invalides sont écartées, sinon `FR`. */
export function resolveCountryCodes(raw: string | null | undefined): string[] {
    const codes = parseList(raw, DEFAULTS.countryCodes, (s) => s.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
    return codes.length > 0 ? codes : [...DEFAULTS.countryCodes];
}

/** Couches Photon valides ; si aucune n'est valide, `house,street`. */
export function resolveLayers(raw: string | null | undefined): string[] {
    const layers = parseList(raw, DEFAULTS.layers, (s) => s.toLowerCase()).filter((l) => SUPPORTED_LAYERS.includes(l));
    return layers.length > 0 ? layers : [...DEFAULTS.layers];
}

/** Point de biais : ignoré s'il est incomplet, hors limites ou égal à (0, 0) (valeur « vide » d'un champ numérique). */
export function resolveBias(
    lat: number | null | undefined,
    lon: number | null | undefined,
): { lat: number; lon: number } | undefined {
    if (lat === null || lat === undefined || lon === null || lon === undefined) return undefined;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
    if (lat === 0 && lon === 0) return undefined;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
    return { lat, lon };
}

export function sanitizeLang(raw: string | null | undefined): string {
    const lang = (raw ?? "").trim().toLowerCase();
    return SUPPORTED_LANGS.includes(lang) ? lang : DEFAULTS.lang;
}

/** Entier borné ; `fallback` si la valeur est absente ou invalide. */
export function intInRange(raw: number | null | undefined, fallback: number, min: number, max: number): number {
    if (raw === null || raw === undefined || !Number.isFinite(raw)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(raw)));
}
