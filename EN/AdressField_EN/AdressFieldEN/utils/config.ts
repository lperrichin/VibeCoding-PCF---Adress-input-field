import { AddressFieldConfig, AllowedLayer, PhotonLang } from "../services/photonTypes";

export const DEFAULT_BASE_URL = "https://photon.komoot.io";
export const DEFAULT_LAYERS: AllowedLayer[] = ["street", "locality", "district", "city"];
export const DEFAULT_PLACEHOLDER = "Start typing an address…";

const ALLOWED_LANGS: PhotonLang[] = ["en", "fr", "de", "default"];
const ALLOWED_LAYERS: AllowedLayer[] = [
    "street", "locality", "district", "city", "county", "state", "country", "other",
];

/** Raw values as read from context.parameters.xxx.raw (null/undefined when not set). */
export interface RawConfig {
    photonBaseUrl?: string | null;
    language?: string | null;
    countryCodes?: string | null;
    layers?: string | null;
    maxResults?: number | null;
    minChars?: number | null;
    requestIntervalMs?: number | null;
    keepHouseNumber?: boolean | null;
    placeholder?: string | null;
}

function csv(value: string | null | undefined): string[] {
    return (value ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

function clamp(value: number | null | undefined, fallback: number, min: number, max: number): number {
    const n = typeof value === "number" && isFinite(value) ? Math.round(value) : fallback;
    return Math.min(max, Math.max(min, n));
}

/** Validates the maker's configuration and applies the defaults of the specification (§7.1). */
export function parseConfig(raw: RawConfig, warn: (msg: string) => void = console.warn): AddressFieldConfig {
    // Base URL: HTTPS only, trailing slashes removed
    let baseUrl = (raw.photonBaseUrl ?? "").trim().replace(/\/+$/, "");
    if (!baseUrl) {
        baseUrl = DEFAULT_BASE_URL;
    } else if (!/^https:\/\//i.test(baseUrl)) {
        warn(`[AdressField_EN] photonBaseUrl "${baseUrl}" is not an HTTPS URL, using ${DEFAULT_BASE_URL}.`);
        baseUrl = DEFAULT_BASE_URL;
    }

    // Language
    const requestedLang = (raw.language ?? "").trim().toLowerCase();
    const lang: PhotonLang = ALLOWED_LANGS.includes(requestedLang as PhotonLang)
        ? (requestedLang as PhotonLang)
        : "en";
    if (requestedLang && requestedLang !== lang) {
        warn(`[AdressField_EN] language "${requestedLang}" is not supported by Photon, using "en".`);
    }

    // Country codes: ISO 3166-1 alpha-2, uppercase, unique
    const countryCodes: string[] = [];
    for (const c of csv(raw.countryCodes).map((s) => s.toUpperCase())) {
        if (!/^[A-Z]{2}$/.test(c)) {
            warn(`[AdressField_EN] country code "${c}" ignored (expected 2 letters, e.g. GB).`);
        } else if (!countryCodes.includes(c)) {
            countryCodes.push(c);
        }
    }

    // Layers: "house" is never allowed
    const layers: AllowedLayer[] = [];
    for (const l of csv(raw.layers).map((s) => s.toLowerCase())) {
        if (l === "house") {
            warn(`[AdressField_EN] layer "house" is not supported by this control and was ignored.`);
        } else if (!ALLOWED_LAYERS.includes(l as AllowedLayer)) {
            warn(`[AdressField_EN] unknown layer "${l}" ignored.`);
        } else if (!layers.includes(l as AllowedLayer)) {
            layers.push(l as AllowedLayer);
        }
    }

    return {
        baseUrl,
        lang,
        countryCodes,
        layers: layers.length > 0 ? layers : DEFAULT_LAYERS.slice(),
        limit: clamp(raw.maxResults, 5, 1, 10),
        minChars: clamp(raw.minChars, 3, 2, 10),
        requestIntervalMs: clamp(raw.requestIntervalMs, 500, 250, 2000),
        keepHouseNumber: raw.keepHouseNumber ?? true,
        placeholder: (raw.placeholder ?? "").trim() || DEFAULT_PLACEHOLDER,
    };
}
