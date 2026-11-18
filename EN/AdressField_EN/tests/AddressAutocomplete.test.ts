/**
 * @jest-environment jsdom
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { AddressAutocomplete, AddressAutocompleteProps, errorMessage, sizeForHeight } from "../AdressFieldEN/components/AddressAutocomplete";
import { PhotonError, PhotonFeature } from "../AdressFieldEN/services/photonTypes";

function street(name: string, postcode: string, id: number): PhotonFeature {
    return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-0.15, 51.52] },
        properties: {
            osm_type: "W", osm_id: id, osm_key: "highway", osm_value: "residential", type: "street",
            name, city: "London", country: "United Kingdom", countrycode: "GB", postcode,
        },
    };
}

let container: HTMLDivElement;
let props: AddressAutocompleteProps;
let search: jest.Mock<Promise<PhotonFeature[] | undefined>, [string]>;

function render(overrides: Partial<AddressAutocompleteProps> = {}): void {
    props = {
        value: "",
        disabled: false,
        label: "Address",
        placeholder: "Start typing an address…",
        minChars: 3,
        requestIntervalMs: 500,
        keepHouseNumber: true,
        search,
        onSelect: jest.fn(),
        onFreeText: jest.fn(),
        onClear: jest.fn(),
        ...overrides,
    };
    act(() => { ReactDOM.render(React.createElement(AddressAutocomplete, props), container); });
}

const input = (): HTMLInputElement => container.querySelector("input") as HTMLInputElement;
const options = (): HTMLElement[] => Array.from(document.querySelectorAll('[role="option"]'));
const clearButton = (): HTMLButtonElement | null => container.querySelector('button[aria-label="Clear address"]');
const liveRegion = (): string => container.querySelector('[role="status"]')?.textContent ?? "";

function type(text: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set as (v: string) => void;
    act(() => {
        input().focus();
        setter.call(input(), text);
        input().dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function flush(): Promise<void> {
    await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
    });
}

beforeAll(() => {
    // jsdom lacks these browser APIs used by Fluent
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe(): void { /* */ } unobserve(): void { /* */ } disconnect(): void { /* */ } };
    window.matchMedia = window.matchMedia ?? ((q: string) => ({ matches: false, media: q, addListener() { /* */ }, removeListener() { /* */ }, addEventListener() { /* */ }, removeEventListener() { /* */ }, onchange: null, dispatchEvent: () => false }) as unknown as MediaQueryList);
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
});

beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    search = jest.fn((q: string) => Promise.resolve([street("Baker Street", "NW1 4RB", 1), street("Baker Street", "W1U 6SE", 2), street("Baker Street", "NW1 4RB", 3)]));
});

afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
    jest.useRealTimers();
});

describe("AddressAutocomplete", () => {
    test("renders an accessible combobox with the placeholder", () => {
        render();
        expect(input().getAttribute("role")).toBe("combobox");
        expect(input().getAttribute("aria-label")).toBe("Address");
        expect(input().placeholder).toBe("Start typing an address…");
        expect(clearButton()).toBeNull(); // empty field: no clear button
    });

    test("shows the initial value", () => {
        render({ value: "221B Baker Street" });
        expect(input().value).toBe("221B Baker Street");
        expect(clearButton()).not.toBeNull();
    });

    test("below 3 characters: no search", () => {
        render();
        type("ba");
        expect(search).not.toHaveBeenCalled();
        expect(options()).toHaveLength(0);
    });

    test("typing searches the text WITHOUT the house number", async () => {
        render();
        type("221b baker street");
        expect(search).toHaveBeenCalledTimes(1);
        expect(search).toHaveBeenCalledWith("baker street");
        await flush();
    });

    test("suggestions: street + number on the first line, postcode/city/country on the second, deduplicated, with attribution", async () => {
        render();
        type("221b baker street");
        await flush();
        const opts = options();
        expect(opts).toHaveLength(2); // 3 results, 2 identical street+postcode merged
        expect(opts[0].textContent).toContain("221B Baker Street");
        expect(opts[0].textContent).toContain("NW1 4RB London, United Kingdom");
        expect(opts[1].textContent).toContain("W1U 6SE London, United Kingdom");
        expect(document.body.textContent).toContain("© OpenStreetMap contributors");
        expect(liveRegion()).toBe("2 addresses found");
    });

    test("selecting a suggestion calls onSelect, fills the field and closes the list", async () => {
        render();
        type("221b baker street");
        await flush();
        act(() => { options()[0].click(); });
        expect(props.onSelect).toHaveBeenCalledTimes(1);
        const address = (props.onSelect as jest.Mock).mock.calls[0][0];
        expect(address).toMatchObject({ addressLine: "221B Baker Street", postalCode: "NW1 4RB", city: "London", countryCode: "GB" });
        expect(input().value).toBe("221B Baker Street");
        expect(options()).toHaveLength(0);
        expect(props.onFreeText).not.toHaveBeenCalled();
    });

    test("blur with typed text and no selection -> onFreeText (trimmed)", async () => {
        render();
        type("  my own address  ");
        act(() => { input().blur(); });
        expect(props.onFreeText).toHaveBeenCalledWith("my own address");
        expect(props.onSelect).not.toHaveBeenCalled();
    });

    test("blur without any change -> nothing written", () => {
        render({ value: "Existing" });
        act(() => { input().focus(); input().blur(); });
        expect(props.onFreeText).not.toHaveBeenCalled();
        expect(props.onClear).not.toHaveBeenCalled();
    });

    test("emptying the text then leaving the field -> onClear", () => {
        render({ value: "Existing" });
        type("");
        act(() => { input().blur(); });
        expect(props.onClear).toHaveBeenCalledTimes(1);
    });

    test("clear button empties the field and calls onClear", () => {
        render({ value: "Existing" });
        act(() => { clearButton()?.click(); });
        expect(input().value).toBe("");
        expect(props.onClear).toHaveBeenCalledTimes(1);
        expect(clearButton()).toBeNull();
    });

    test("no results -> 'No address found'", async () => {
        search.mockImplementation(() => Promise.resolve([]));
        render();
        type("zzzqqq");
        await flush();
        expect(document.body.textContent).toContain("No address found");
        expect(options().every((o) => o.getAttribute("aria-disabled") === "true")).toBe(true);
        expect(liveRegion()).toBe("No address found");
    });

    test("busy service -> inline message, typing still possible", async () => {
        search.mockImplementation(() => Promise.reject(new PhotonError("busy", "x", 503)));
        jest.spyOn(console, "error").mockImplementation(() => undefined);
        render();
        type("baker");
        await flush();
        expect(document.body.textContent).toContain("Address service busy, please retry");
        expect(input().disabled).toBe(false);
    });

    test("disabled control: field disabled, no clear button", () => {
        render({ value: "Existing", disabled: true });
        expect(input().disabled).toBe(true);
        expect(clearButton()).toBeNull();
    });

    test("a value changed from outside replaces the text and drops suggestions", async () => {
        render({ value: "A" });
        type("221b baker street");
        await flush();
        expect(options().length).toBeGreaterThan(0);
        render({ value: "Changed elsewhere" });
        expect(input().value).toBe("Changed elsewhere");
        expect(options()).toHaveLength(0);
    });

    test("the form echoing back our own value does not reset the field", async () => {
        render();
        type("221b baker street");
        await flush();
        act(() => { options()[0].click(); });
        render({ value: "221B Baker Street" }); // updateView after notifyOutputChanged
        expect(input().value).toBe("221B Baker Street");
    });
});

describe("errorMessage", () => {
    test.each([
        [new PhotonError("busy", "x"), "Address service busy, please retry"],
        [new PhotonError("config", "x"), "Address search misconfigured"],
        [new PhotonError("network", "x"), "Address service unavailable"],
        [new PhotonError("timeout", "x"), "Address service unavailable"],
        [new Error("?"), "Address service unavailable"],
    ])("%p", (e, msg) => expect(errorMessage(e)).toBe(msg));
});

describe("sizeForHeight (canvas apps give a fixed height)", () => {
    test.each([
        [undefined, "medium"], [-1, "medium"], [0, "medium"],
        [24, "small"], [31, "small"], [32, "medium"], [39, "medium"], [40, "large"], [80, "large"],
    ])("%p -> %p", (h, size) => expect(sizeForHeight(h as number | undefined)).toBe(size));
});

describe("canvas: empty label", () => {
    test("falls back to a default accessible name", () => {
        render({ label: "" });
        expect(input().getAttribute("aria-label")).toBe("Address");
    });
});
