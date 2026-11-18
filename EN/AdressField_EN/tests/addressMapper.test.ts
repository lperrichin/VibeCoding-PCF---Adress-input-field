import {
    dedupeAddresses,
    formatAddressLine,
    toParsedAddress,
    toSuggestions,
} from "../AdressFieldEN/utils/addressMapper";
import { PhotonFeature } from "../AdressFieldEN/services/photonTypes";

function feature(props: Partial<PhotonFeature["properties"]>, coords: [number, number] = [2.35, 48.85]): PhotonFeature {
    return {
        type: "Feature",
        geometry: { type: "Point", coordinates: coords },
        properties: { osm_type: "W", osm_id: 1, osm_key: "highway", osm_value: "residential", type: "street", ...props },
    };
}

const rivoli = feature(
    { name: "Rue de Rivoli", district: "Paris", city: "Paris", state: "Île-de-France", country: "France", countrycode: "FR", postcode: "75001" },
    [2.3454332, 48.8594512]
);

describe("formatAddressLine (spec §7.3)", () => {
    test.each([
        ["Rue de Rivoli", "10", "FR", "10 Rue de Rivoli"],
        ["Baker Street", "221B", "GB", "221B Baker Street"],
        ["Main Street", "5", "US", "5 Main Street"],
        ["Hauptstraße", "10", "DE", "Hauptstraße 10"],
        ["Kalverstraat", "92", "NL", "Kalverstraat 92"],
        ["Via Roma", "3", "IT", "Via Roma 3"],
        ["Hauptstraße", "10", "de", "Hauptstraße 10"], // case-insensitive
        ["Rue de Rivoli", undefined, "FR", "Rue de Rivoli"],
        ["Baker Street", undefined, "", "Baker Street"],
        ["Baker Street", "7", "", "7 Baker Street"], // unknown country: number first
    ])("%s / %s / %s -> %s", (street, num, cc, expected) => {
        expect(formatAddressLine(street, num, cc)).toBe(expected);
    });
});

describe("toParsedAddress", () => {
    test("street result with a typed house number", () => {
        const a = toParsedAddress(rivoli, "10");
        expect(a).toEqual({
            addressLine: "10 Rue de Rivoli",
            postalCode: "75001",
            city: "Paris",
            county: "",
            stateOrProvince: "Île-de-France",
            country: "France",
            countryCode: "FR",
            latitude: 48.8594512,
            longitude: 2.3454332,
            secondaryLine: "75001 Paris, France",
        });
    });

    test("coordinates are not swapped ([lon, lat] in GeoJSON)", () => {
        const a = toParsedAddress(feature({ name: "X", countrycode: "GB" }, [-0.158656, 51.5246225]));
        expect(a.longitude).toBe(-0.158656);
        expect(a.latitude).toBe(51.5246225);
    });

    test("GB street with house number 221B", () => {
        const baker = feature({
            name: "Baker Street", district: "Marylebone", city: "London", state: "England",
            country: "United Kingdom", countrycode: "GB", postcode: "NW1 4RB",
        });
        const a = toParsedAddress(baker, "221B");
        expect(a.addressLine).toBe("221B Baker Street");
        expect(a.countryCode).toBe("GB");
        expect(a.secondaryLine).toBe("NW1 4RB London, United Kingdom");
    });

    test("DE street: number after the name", () => {
        const a = toParsedAddress(feature({ name: "Hauptstraße", city: "Berlin", countrycode: "DE", country: "Germany", postcode: "10827" }), "5");
        expect(a.addressLine).toBe("Hauptstraße 5");
    });

    test("no house number -> street name only", () => {
        expect(toParsedAddress(rivoli).addressLine).toBe("Rue de Rivoli");
    });

    test("non-street layer ignores the house number and uses the name", () => {
        const city = feature({ type: "city", name: "Paris", country: "France", countrycode: "FR", state: "Île-de-France" });
        const a = toParsedAddress(city, "10");
        expect(a.addressLine).toBe("Paris");
        expect(a.city).toBe("Paris");
        expect(a.secondaryLine).toBe("France"); // city not repeated
    });

    test("district / locality results", () => {
        const d = feature({ type: "district", name: "Marylebone", city: "London", country: "United Kingdom", countrycode: "GB" });
        expect(toParsedAddress(d, "3")).toMatchObject({ addressLine: "Marylebone", city: "London" });
    });

    test("city falls back to district then locality", () => {
        expect(toParsedAddress(feature({ name: "A", district: "Le Marais", locality: "Quartier" })).city).toBe("Le Marais");
        expect(toParsedAddress(feature({ name: "A", locality: "Quartier" })).city).toBe("Quartier");
        expect(toParsedAddress(feature({ name: "A" })).city).toBe("");
    });

    test("missing fields become empty strings; country code upper-cased", () => {
        const a = toParsedAddress(feature({ name: "A", countrycode: "gb" }));
        expect(a).toMatchObject({ postalCode: "", county: "", stateOrProvince: "", country: "", countryCode: "GB" });
    });

    test("county is mapped", () => {
        expect(toParsedAddress(feature({ name: "A", county: "Greater London" })).county).toBe("Greater London");
    });
});

describe("dedupe (spec §7.4)", () => {
    test("two ways of the same street with the same postcode -> one suggestion", () => {
        const second = feature({ ...rivoli.properties, osm_id: 2 }, [2.33, 48.86]);
        const list = toSuggestions([rivoli, second], "10");
        expect(list).toHaveLength(1);
        expect(list[0].longitude).toBe(2.3454332); // first one kept
    });

    test("same street, different postcodes -> both kept", () => {
        const other = feature({ ...rivoli.properties, osm_id: 2, postcode: "75004" });
        expect(toSuggestions([rivoli, other])).toHaveLength(2);
    });

    test("order is preserved and the comparison ignores case", () => {
        const a = toParsedAddress(rivoli);
        const b = { ...a, addressLine: "RUE DE RIVOLI" };
        const c = { ...a, addressLine: "Other" };
        expect(dedupeAddresses([a, b, c]).map((x) => x.addressLine)).toEqual(["Rue de Rivoli", "Other"]);
    });

    test("empty list", () => {
        expect(toSuggestions([])).toEqual([]);
    });
});
