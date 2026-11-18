import { buildSearchQuery, PhotonClient } from "../AdressFieldEN/services/photonClient";
import { PhotonError, PhotonSearchParams } from "../AdressFieldEN/services/photonTypes";

const base: PhotonSearchParams = {
    q: "baker street",
    lang: "en",
    limit: 5,
    layers: ["street", "locality", "district", "city"],
    countryCodes: ["GB"],
};

const okBody = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { type: "street", name: "Baker Street" }, geometry: { type: "Point", coordinates: [0, 51] } }] });

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): jest.Mock {
    const m = jest.fn(impl);
    (globalThis as unknown as { fetch: unknown }).fetch = m;
    return m;
}

describe("buildSearchQuery", () => {
    test("standard request", () => {
        expect(buildSearchQuery(base)).toBe(
            "q=baker+street&lang=en&limit=5&layer=street&layer=locality&layer=district&layer=city&countrycode=GB"
        );
    });

    test("never sends the house layer", () => {
        const q = buildSearchQuery({ ...base, layers: ["house", "street"] as never });
        expect(q).not.toContain("house");
        expect(q).toContain("layer=street");
    });

    test("several countries are repeated, upper-cased", () => {
        expect(buildSearchQuery({ ...base, countryCodes: ["gb", "IE"] })).toContain("countrycode=GB&countrycode=IE");
    });

    test("worldwide: no countrycode", () => {
        expect(buildSearchQuery({ ...base, countryCodes: [] })).not.toContain("countrycode");
    });

    test("location bias only with both lat and lon", () => {
        expect(buildSearchQuery({ ...base, lat: 51.5 })).not.toContain("lat=");
        const q = buildSearchQuery({ ...base, lat: 51.5, lon: -0.15 });
        expect(q).toContain("lat=51.5&lon=-0.15&zoom=12");
    });

    test("limit is clamped to the public maximum (50)", () => {
        expect(buildSearchQuery({ ...base, limit: 500 })).toContain("limit=50");
        expect(buildSearchQuery({ ...base, limit: 0 })).toContain("limit=1");
    });

    test("special characters are encoded", () => {
        expect(buildSearchQuery({ ...base, q: "rue d'été & co" })).toContain("q=rue+d%27%C3%A9t%C3%A9+%26+co");
    });
});

describe("PhotonClient", () => {
    afterEach(() => jest.useRealTimers());

    test("success, then served from the cache", async () => {
        const f = mockFetch(async () => new Response(okBody, { status: 200 }));
        const c = new PhotonClient("https://photon.komoot.io/");
        expect(c.isCached(base)).toBe(false);
        const r = await c.search(base);
        expect(r).toHaveLength(1);
        expect(f.mock.calls[0][0]).toBe(`https://photon.komoot.io/api?${buildSearchQuery(base)}`);
        expect(c.isCached(base)).toBe(true);
        await c.search(base);
        expect(f).toHaveBeenCalledTimes(1); // cache hit: no second call
    });

    test("503 with an HTML body -> busy (never parsed as JSON)", async () => {
        mockFetch(async () => new Response("<html><h1>503 Service Temporarily Unavailable</h1></html>", { status: 503 }));
        await expect(new PhotonClient("https://x").search(base)).rejects.toMatchObject({ kind: "busy", status: 503 });
    });

    test("429 -> busy", async () => {
        mockFetch(async () => new Response("", { status: 429 }));
        await expect(new PhotonClient("https://x").search(base)).rejects.toMatchObject({ kind: "busy" });
    });

    test("400 -> config error with the server message", async () => {
        mockFetch(async () => new Response('{"lang":[{"message":"Language is not supported"}]}', { status: 400 }));
        const err = await new PhotonClient("https://x").search(base).catch((e) => e);
        expect(err).toBeInstanceOf(PhotonError);
        expect(err).toMatchObject({ kind: "config", status: 400 });
        expect(err.message).toContain("Language is not supported");
    });

    test("other 4xx -> network", async () => {
        mockFetch(async () => new Response("", { status: 404 }));
        await expect(new PhotonClient("https://x").search(base)).rejects.toMatchObject({ kind: "network", status: 404 });
    });

    test("fetch failure -> network", async () => {
        mockFetch(async () => { throw new TypeError("Failed to fetch"); });
        await expect(new PhotonClient("https://x").search(base)).rejects.toMatchObject({ kind: "network" });
    });

    test("200 with an HTML / unexpected body -> network", async () => {
        mockFetch(async () => new Response("<html></html>", { status: 200 }));
        await expect(new PhotonClient("https://x").search(base)).rejects.toMatchObject({ kind: "network" });
        mockFetch(async () => new Response('{"hello":1}', { status: 200 }));
        await expect(new PhotonClient("https://x").search({ ...base, q: "other" })).rejects.toMatchObject({ kind: "network" });
    });

    test("a newer search supersedes the previous one (which resolves undefined)", async () => {
        mockFetch(
            (_url, init) =>
                new Promise<Response>((resolve, reject) => {
                    const sig = init?.signal as AbortSignal;
                    sig.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
                    if (_url.includes("q=second")) resolve(new Response(okBody, { status: 200 }));
                })
        );
        const c = new PhotonClient("https://x");
        const first = c.search({ ...base, q: "first" });
        const second = c.search({ ...base, q: "second" });
        expect(await first).toBeUndefined();
        expect(await second).toHaveLength(1);
    });

    test("no answer within 8 s -> timeout", async () => {
        jest.useFakeTimers();
        mockFetch(
            (_url, init) =>
                new Promise<Response>((_res, reject) => {
                    (init?.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
                })
        );
        const p = new PhotonClient("https://x").search(base);
        const assertion = expect(p).rejects.toMatchObject({ kind: "timeout" });
        await jest.advanceTimersByTimeAsync(8001);
        await assertion;
    });

    test("cancel() aborts the in-flight call", async () => {
        mockFetch(
            (_url, init) =>
                new Promise<Response>((_res, reject) => {
                    (init?.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
                })
        );
        const c = new PhotonClient("https://x");
        const p = c.search(base);
        c.cancel();
        expect(await p).toBeUndefined();
    });

    test("cache keeps at most 50 entries and changing the base URL clears it", async () => {
        const f = mockFetch(async () => new Response(okBody, { status: 200 }));
        const c = new PhotonClient("https://x");
        for (let i = 0; i < 55; i++) await c.search({ ...base, q: `street ${i}` });
        expect(c.isCached({ ...base, q: "street 0" })).toBe(false); // evicted
        expect(c.isCached({ ...base, q: "street 54" })).toBe(true);
        c.setBaseUrl("https://y");
        expect(c.isCached({ ...base, q: "street 54" })).toBe(false);
        expect(f).toHaveBeenCalledTimes(55);
    });
});
