import {
    PhotonError,
    PhotonFeature,
    PhotonFeatureCollection,
    PhotonSearchParams,
} from "./photonTypes";

const TIMEOUT_MS = 8000;
const CACHE_SIZE = 50;
/** Public Photon instance maximum. */
const MAX_LIMIT = 50;

/**
 * Builds the query string of a Photon /api search.
 * The "house" layer is never sent, whatever the caller passes.
 */
export function buildSearchQuery(p: PhotonSearchParams): string {
    const qs = new URLSearchParams();
    qs.set("q", p.q);
    qs.set("lang", p.lang);
    qs.set("limit", String(Math.min(Math.max(1, Math.round(p.limit)), MAX_LIMIT)));
    for (const layer of p.layers) {
        if ((layer as string) !== "house") qs.append("layer", layer);
    }
    for (const code of p.countryCodes) {
        qs.append("countrycode", code.toUpperCase());
    }
    if (p.lat !== undefined && p.lon !== undefined && isFinite(p.lat) && isFinite(p.lon)) {
        qs.set("lat", String(p.lat));
        qs.set("lon", String(p.lon));
        qs.set("zoom", String(p.zoom ?? 12));
    }
    return qs.toString();
}

export class PhotonClient {
    private baseUrl: string;
    private controller?: AbortController;
    private readonly cache = new Map<string, PhotonFeature[]>();

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
    }

    public setBaseUrl(baseUrl: string): void {
        const clean = baseUrl.replace(/\/+$/, "");
        if (clean !== this.baseUrl) {
            this.baseUrl = clean;
            this.cache.clear();
        }
    }

    /** True when the answer is already cached (no API call needed, §7.5 rule 8). */
    public isCached(p: PhotonSearchParams): boolean {
        return this.cache.has(this.cacheKey(p));
    }

    /**
     * Searches addresses.
     * - Aborts any previous in-flight call.
     * - Resolves `undefined` when this call was superseded/aborted (callers must ignore it).
     * - Throws PhotonError (busy | config | network | timeout) otherwise.
     */
    public async search(p: PhotonSearchParams): Promise<PhotonFeature[] | undefined> {
        const key = this.cacheKey(p);
        const cached = this.cache.get(key);
        if (cached) return cached;

        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;

        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}/api?${key}`, {
                signal: controller.signal,
                headers: { Accept: "application/json" },
            });
        } catch (e) {
            clearTimeout(timer);
            if (timedOut) throw new PhotonError("timeout", "Address service did not answer in time");
            if (controller.signal.aborted) return undefined; // superseded
            throw new PhotonError("network", "Address service unavailable");
        }
        clearTimeout(timer);

        if (!response.ok) {
            // 400 = JSON validation error; 503 = HTML page (fair-use throttling)
            if (response.status === 400) {
                let detail = "";
                try { detail = (await response.text()).slice(0, 300); } catch { /* ignore */ }
                throw new PhotonError("config", `Address search misconfigured: ${detail}`, 400);
            }
            if (response.status === 429 || response.status >= 500) {
                throw new PhotonError("busy", "Address service busy, please retry", response.status);
            }
            throw new PhotonError("network", `Address service error (${response.status})`, response.status);
        }

        let data: PhotonFeatureCollection;
        try {
            data = (await response.json()) as PhotonFeatureCollection;
        } catch {
            if (controller.signal.aborted) return undefined;
            throw new PhotonError("network", "Unreadable answer from the address service");
        }
        if (controller.signal.aborted) return undefined;
        if (!data || !Array.isArray(data.features)) {
            throw new PhotonError("network", "Unexpected answer from the address service");
        }

        if (this.cache.size >= CACHE_SIZE) {
            // Drop the oldest entry (Map keeps insertion order)
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
        }
        this.cache.set(key, data.features);
        return data.features;
    }

    /** Aborts the in-flight call, if any. */
    public cancel(): void {
        this.controller?.abort();
        this.controller = undefined;
    }

    public dispose(): void {
        this.cancel();
        this.cache.clear();
    }

    private cacheKey(p: PhotonSearchParams): string {
        return buildSearchQuery(p);
    }
}
