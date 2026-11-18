import { extractHouseNumber } from "../AdressFieldEN/utils/houseNumber";

describe("extractHouseNumber (spec §7.2)", () => {
    test.each([
        ["10 rue de rivoli", "rue de rivoli", "10"],
        ["10bis rue de rivoli", "rue de rivoli", "10 bis"],
        ["10 bis, rue de rivoli", "rue de rivoli", "10 bis"],
        ["10 ter rue de rivoli", "rue de rivoli", "10 ter"],
        ["221b baker street", "baker street", "221B"],
        ["221B Baker Street london", "Baker Street london", "221B"],
        ["12-14 rue x", "rue x", "12-14"],
        ["12 - 14 rue x", "rue x", "12-14"],
        ["hauptstraße 10a", "hauptstraße", "10A"],
        ["hauptstrasse 5 berlin", "hauptstrasse 5 berlin", undefined], // number not at an end: left in the query
        ["  10   downing   street ", "downing street", "10"],
    ])("%s -> query %p, number %p", (input, query, houseNumber) => {
        expect(extractHouseNumber(input)).toEqual(
            houseNumber === undefined ? { query } : { query, houseNumber }
        );
    });

    test("no number", () => {
        expect(extractHouseNumber("rue de rivoli")).toEqual({ query: "rue de rivoli" });
    });

    test("only a number -> nothing to search", () => {
        expect(extractHouseNumber("10")).toEqual({ query: "" });
        expect(extractHouseNumber("1000")).toEqual({ query: "" });
    });

    test("street names that start with a digit are not cut", () => {
        expect(extractHouseNumber("5th avenue new york")).toEqual({ query: "5th avenue new york" });
        expect(extractHouseNumber("42nd street")).toEqual({ query: "42nd street" });
    });

    test("a 5-digit postcode is not a house number", () => {
        expect(extractHouseNumber("75001 paris")).toEqual({ query: "75001 paris" });
        expect(extractHouseNumber("rue de rivoli paris 75001")).toEqual({ query: "rue de rivoli paris 75001" });
    });

    test("a UK postcode is not a house number", () => {
        expect(extractHouseNumber("baker street nw1 4rb")).toEqual({ query: "baker street nw1 4rb" });
    });

    test("keepHouseNumber = false -> text searched as typed", () => {
        expect(extractHouseNumber("10 rue de rivoli", false)).toEqual({ query: "10 rue de rivoli" });
    });

    test("empty / whitespace", () => {
        expect(extractHouseNumber("")).toEqual({ query: "" });
        expect(extractHouseNumber("   ")).toEqual({ query: "" });
    });
});
