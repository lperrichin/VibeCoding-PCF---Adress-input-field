/**
 * Live scenarios against the real public Photon server (spec §11.2, scenarios 3-6 and the 500 ms rule).
 * Skipped by default so `npm test` stays offline. Run with:  LIVE_PHOTON=1 npx jest tests/live.test.ts
 */
import { PhotonClient } from "../AdressFieldEN/services/photonClient";
import { SearchScheduler } from "../AdressFieldEN/services/searchScheduler";
import { PhotonFeature, PhotonSearchParams } from "../AdressFieldEN/services/photonTypes";
import { extractHouseNumber } from "../AdressFieldEN/utils/houseNumber";
import { toSuggestions } from "../AdressFieldEN/utils/addressMapper";
import { parseConfig } from "../AdressFieldEN/utils/config";
import { buildOutputs } from "../AdressFieldEN/utils/outputs";

const live = process.env.LIVE_PHOTON ? describe : describe.skip;
jest.setTimeout(60000);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function run(client: PhotonClient, typed: string, cfg = parseConfig({ countryCodes: "GB" }, () => undefined)) {
    const { query, houseNumber } = extractHouseNumber(typed, cfg.keepHouseNumber);
    const params: PhotonSearchParams = { q: query, lang: cfg.lang, limit: cfg.limit, layers: cfg.layers, countryCodes: cfg.countryCodes };
    const features = (await client.search(params)) ?? [];
    return { query, houseNumber, suggestions: toSuggestions(features, houseNumber), features };
}

live("live Photon scenarios", () => {
    const client = new PhotonClient("https://photon.komoot.io");
    afterAll(() => client.dispose());

    test("scenario 3: FR, '10 rue de rivoli' -> 10 Rue de Rivoli, 75001 Paris", async () => {
        const r = await run(client, "10 rue de rivoli", parseConfig({ countryCodes: "FR" }, () => undefined));
        expect(r.query).toBe("rue de rivoli");
        const first = r.suggestions[0];
        expect(first).toMatchObject({ addressLine: "10 Rue de Rivoli", city: "Paris", country: "France", countryCode: "FR" });
        expect(first.latitude).toBeGreaterThan(48.8);
        expect(first.latitude).toBeLessThan(48.9);
        expect(first.longitude).toBeGreaterThan(2.2);
        expect(first.longitude).toBeLessThan(2.5);
        const out = buildOutputs({ kind: "selected", address: first });
        expect(out).toMatchObject({ addressLine: "10 Rue de Rivoli", countryCode: "FR" });
        console.log("scenario 3:", r.suggestions.map((s) => `${s.addressLine} | ${s.secondaryLine}`));
    });

    test("scenario 4: DE, 'hauptstrasse 5' -> German results only, number after the street", async () => {
        await sleep(600);
        const r = await run(client, "hauptstrasse 5", parseConfig({ countryCodes: "DE" }, () => undefined));
        expect(r.houseNumber).toBe("5");
        expect(r.suggestions.length).toBeGreaterThan(0);
        expect(r.suggestions.every((s) => s.countryCode === "DE")).toBe(true);
        expect(r.suggestions[0].addressLine).toMatch(/^Hauptstra(ß|ss)e 5$/);
        console.log("scenario 4:", r.suggestions.map((s) => `${s.addressLine} | ${s.secondaryLine}`));
    });

    test("scenario 5: default config (GB, en), '221b baker street london' -> 221B Baker Street", async () => {
        await sleep(600);
        const r = await run(client, "221b baker street london");
        expect(r.houseNumber).toBe("221B");
        const first = r.suggestions[0];
        expect(first).toMatchObject({ addressLine: "221B Baker Street", country: "United Kingdom", countryCode: "GB", city: "London" });
        console.log("scenario 5:", r.suggestions.map((s) => `${s.addressLine} | ${s.secondaryLine}`));
    });

    test("scenario 6: gibberish -> no result, no error", async () => {
        await sleep(600);
        const r = await run(client, "zzzqqqxxyy");
        expect(r.suggestions).toEqual([]);
    });

    test("no house layer is ever returned as a main result type for street searches", async () => {
        await sleep(600);
        const r = await run(client, "baker street");
        expect(r.features.length).toBeGreaterThan(0);
        expect(r.features.every((f: PhotonFeature) => f.properties.type !== "house")).toBe(true);
    });

    test("500 ms rule with real timing: fast typing never starts two calls < 500 ms apart", async () => {
        await sleep(600);
        const starts: number[] = [];
        const sent: string[] = [];
        let last: PhotonFeature[] | undefined;
        const c = new PhotonClient("https://photon.komoot.io");
        const cfg = parseConfig({ countryCodes: "GB" }, () => undefined);
        const scheduler = new SearchScheduler<PhotonFeature[]>(
            () => ({ minChars: cfg.minChars, intervalMs: cfg.requestIntervalMs }),
            {
                run: (q) => {
                    starts.push(Date.now());
                    sent.push(q);
                    return c.search({ q, lang: cfg.lang, limit: cfg.limit, layers: cfg.layers, countryCodes: cfg.countryCodes });
                },
                isCached: (q) => c.isCached({ q, lang: cfg.lang, limit: cfg.limit, layers: cfg.layers, countryCodes: cfg.countryCodes }),
                abort: () => c.cancel(),
                onResult: (_q, r) => { last = r; },
                onError: (_q, e) => { throw e; },
                onLoading: () => undefined,
                onClear: () => undefined,
            }
        );
        const text = "abbey road london";
        for (let i = 1; i <= text.length; i++) {
            scheduler.schedule(text.slice(0, i));
            await sleep(90); // fast typist
        }
        await sleep(2500);
        scheduler.dispose();
        c.dispose();
        console.log("calls:", sent.length, sent, "gaps(ms):", starts.slice(1).map((t, i) => t - starts[i]));
        for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(495);
        expect(sent[sent.length - 1]).toBe(text);
        expect(last && last.length).toBeGreaterThan(0);
    });
});
