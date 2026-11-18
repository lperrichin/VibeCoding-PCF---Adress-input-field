import { buildOutputs, fit } from "../AdressFieldEN/utils/outputs";
import { ParsedAddress } from "../AdressFieldEN/services/photonTypes";

const address: ParsedAddress = {
    addressLine: "221B Baker Street",
    postalCode: "NW1 4RB",
    city: "London",
    county: "",
    stateOrProvince: "England",
    country: "United Kingdom",
    countryCode: "GB",
    latitude: 51.5246,
    longitude: -0.1586,
    secondaryLine: "NW1 4RB London, United Kingdom",
};

describe("buildOutputs (spec §2.3)", () => {
    test("selected: every bound column is written", () => {
        expect(buildOutputs({ kind: "selected", address })).toEqual({
            addressLine: "221B Baker Street",
            postalCode: "NW1 4RB",
            city: "London",
            county: "", // not provided by Photon: cleared, never left stale
            stateOrProvince: "England",
            country: "United Kingdom",
            countryCode: "GB",
            latitude: 51.5246,
            longitude: -0.1586,
        });
    });

    test("selected: latitude/longitude are not swapped", () => {
        const o = buildOutputs({ kind: "selected", address });
        expect(o.latitude).toBe(51.5246);
        expect(o.longitude).toBe(-0.1586);
    });

    test("selected: the address line is cut to the column MaxLength", () => {
        const o = buildOutputs({ kind: "selected", address }, { addressLine: 10, postalCode: 4 });
        expect(o.addressLine).toBe("221B Baker"); // 10 chars
        expect(o.postalCode).toBe("NW1"); // "NW1 " trimmed
        expect(o.city).toBe("London"); // no limit known
    });

    test("free text: only the address line, other keys omitted (columns unchanged)", () => {
        const o = buildOutputs({ kind: "freeText", text: "my own address" });
        expect(o).toEqual({ addressLine: "my own address" });
        expect(Object.keys(o)).toEqual(["addressLine"]);
    });

    test("free text is cut to MaxLength too", () => {
        expect(buildOutputs({ kind: "freeText", text: "abcdefghij" }, { addressLine: 5 }).addressLine).toBe("abcde");
    });

    test("cleared: every column is emptied", () => {
        const o = buildOutputs({ kind: "cleared" });
        expect(o).toMatchObject({ addressLine: "", postalCode: "", city: "", county: "", stateOrProvince: "", country: "", countryCode: "" });
        expect(Object.keys(o)).toContain("latitude");
        expect(Object.keys(o)).toContain("longitude");
        // null (not undefined): canvas apps ignore undefined and would keep the old number
        expect(o.latitude).toBeNull();
        expect(o.longitude).toBeNull();
    });

    test("none: nothing to write", () => {
        expect(buildOutputs({ kind: "none" })).toEqual({});
    });
});

describe("fit", () => {
    test.each([
        ["abc", undefined, "abc"],
        ["abc", null, "abc"],
        ["abc", 0, "abc"],
        ["abc", -1, "abc"],
        ["abc", 3, "abc"],
        ["abcdef", 3, "abc"],
        ["ab  cdef", 4, "ab"], // trailing space removed after the cut
        ["", 5, ""],
    ])("fit(%p, %p) = %p", (value, max, expected) => {
        expect(fit(value, max)).toBe(expected);
    });
});
