import {
    DEFAULTS,
    MAX_LIMIT,
    intInRange,
    resolveBaseUrl,
    resolveBias,
    resolveCountryCodes,
    resolveLayers,
    sanitizeLang,
} from "./photonConfig";
import { PhotonClientOptions } from "./PhotonClient";

/** Entrées du manifest telles que lues dans le contexte (toutes peuvent être vides en Canvas). */
export interface RawInputs {
    baseUrl?: string | null;
    minCharsNumeric?: number | null;
    minCharsText?: number | null;
    debounceMs?: number | null;
    countryCodes?: string | null;
    language?: string | null;
    maxResults?: number | null;
    layers?: string | null;
    biasLatitude?: number | null;
    biasLongitude?: number | null;
    defaultValue?: string | null;
    placeholder?: string | null;
}

export interface ComponentConfig {
    client: PhotonClientOptions;
    debounceMs: number;
    placeholder: string | undefined;
    defaultValue: string;
}

/** Temporisation minimale : protège l'instance Photon contre une configuration trop agressive. */
const DEBOUNCE_MIN_MS = 100;
const DEBOUNCE_MAX_MS = 5000;
const MIN_CHARS_MAX = 50;

/** Transforme les entrées brutes en configuration valide, en appliquant les valeurs par défaut. */
export function resolveConfig(raw: RawInputs): ComponentConfig {
    const placeholder = (raw.placeholder ?? "").trim();
    return {
        client: {
            baseUrl: resolveBaseUrl(raw.baseUrl),
            lang: sanitizeLang(raw.language),
            limit: intInRange(raw.maxResults, DEFAULTS.maxResults, 1, MAX_LIMIT),
            minCharsNumeric: intInRange(raw.minCharsNumeric, DEFAULTS.minCharsNumeric, 1, MIN_CHARS_MAX),
            minCharsText: intInRange(raw.minCharsText, DEFAULTS.minCharsText, 1, MIN_CHARS_MAX),
            countryCodes: resolveCountryCodes(raw.countryCodes),
            layers: resolveLayers(raw.layers),
            bias: resolveBias(raw.biasLatitude, raw.biasLongitude),
        },
        debounceMs: intInRange(raw.debounceMs, DEFAULTS.debounceMs, DEBOUNCE_MIN_MS, DEBOUNCE_MAX_MS),
        placeholder: placeholder.length > 0 ? placeholder : undefined,
        defaultValue: (raw.defaultValue ?? "").trim(),
    };
}
