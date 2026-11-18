import { parseConfig } from "../AdressFieldEN/utils/config";

const quiet = (): void => undefined;

describe("parseConfig (spec §7.1)", () => {
    test("manifest defaults", () => {
        expect(
            parseConfig({
                photonBaseUrl: "https://photon.komoot.io", language: "en", countryCodes: "GB",
                layers: "street,locality,district,city", maxResults: 5, minChars: 3,
                requestIntervalMs: 500, keepHouseNumber: true, placeholder: "Start typing an address…",
            }, quiet)
        ).toEqual({
            baseUrl: "https://photon.komoot.io",
            lang: "en",
            countryCodes: ["GB"],
            layers: ["street", "locality", "district", "city"],
            limit: 5,
            minChars: 3,
            requestIntervalMs: 500,
            keepHouseNumber: true,
            placeholder: "Start typing an address…",
        });
    });

    test("nothing set -> safe defaults", () => {
        const c = parseConfig({}, quiet);
        expect(c).toMatchObject({ baseUrl: "https://photon.komoot.io", lang: "en", limit: 5, minChars: 3, requestIntervalMs: 500, keepHouseNumber: true });
        expect(c.layers).toEqual(["street", "locality", "district", "city"]);
        expect(c.countryCodes).toEqual([]);
    });

    test("unsupported language -> en", () => {
        const warn = jest.fn();
        expect(parseConfig({ language: "xx" }, warn).lang).toBe("en");
        expect(warn).toHaveBeenCalled();
    });

    test.each(["en", "FR", " de ", "default"])("supported language %p", (l) => {
        expect(parseConfig({ language: l }, quiet).lang).toBe(l.trim().toLowerCase());
    });

    test("layers: house is dropped", () => {
        const warn = jest.fn();
        expect(parseConfig({ layers: "house,street" }, warn).layers).toEqual(["street"]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("house"));
    });

    test("layers: only house -> default list", () => {
        expect(parseConfig({ layers: "house" }, quiet).layers).toEqual(["street", "locality", "district", "city"]);
    });

    test("layers: unknown values ignored, duplicates removed, case-insensitive", () => {
        expect(parseConfig({ layers: "Street, foo, street, CITY" }, quiet).layers).toEqual(["street", "city"]);
    });

    test("country codes: upper-cased, validated, unique; 'EN' style typos are 2 letters so kept, digits rejected", () => {
        expect(parseConfig({ countryCodes: "gb, ie ,GB,EN1,F" }, quiet).countryCodes).toEqual(["GB", "IE"]);
        expect(parseConfig({ countryCodes: "" }, quiet).countryCodes).toEqual([]);
    });

    test("clamps", () => {
        const hi = parseConfig({ maxResults: 99, minChars: 99, requestIntervalMs: 99999 }, quiet);
        expect([hi.limit, hi.minChars, hi.requestIntervalMs]).toEqual([10, 10, 2000]);
        const lo = parseConfig({ maxResults: 0, minChars: 0, requestIntervalMs: 1 }, quiet);
        expect([lo.limit, lo.minChars, lo.requestIntervalMs]).toEqual([1, 2, 250]);
    });

    test("non-numeric values use the defaults", () => {
        const c = parseConfig({ maxResults: NaN, minChars: null, requestIntervalMs: undefined }, quiet);
        expect([c.limit, c.minChars, c.requestIntervalMs]).toEqual([5, 3, 500]);
    });

    test("base URL: trailing slashes trimmed; non-HTTPS rejected", () => {
        expect(parseConfig({ photonBaseUrl: "https://my.photon.local///" }, quiet).baseUrl).toBe("https://my.photon.local");
        expect(parseConfig({ photonBaseUrl: "http://insecure" }, quiet).baseUrl).toBe("https://photon.komoot.io");
    });

    test("keepHouseNumber false is respected", () => {
        expect(parseConfig({ keepHouseNumber: false }, quiet).keepHouseNumber).toBe(false);
    });

    test("blank placeholder -> default", () => {
        expect(parseConfig({ placeholder: "   " }, quiet).placeholder).toBe("Start typing an address…");
    });
});
