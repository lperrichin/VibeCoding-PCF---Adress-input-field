import { AdressFieldEN } from "../AdressFieldEN/index";
import { AddressAutocompleteProps } from "../AdressFieldEN/components/AddressAutocomplete";
import { ParsedAddress } from "../AdressFieldEN/services/photonTypes";

type Ctx = Parameters<AdressFieldEN["updateView"]>[0];

const str = (raw: string | null, MaxLength?: number) => ({ raw, attributes: MaxLength ? { MaxLength } : undefined });
const num = (raw: number | null) => ({ raw });

function context(over: Record<string, unknown> = {}, mode: Record<string, unknown> = {}): Ctx {
    return {
        parameters: {
            addressLine: str("Old line", 20),
            postalCode: str(null), city: str(null), county: str(null), stateOrProvince: str(null),
            country: str(null), countryCode: str(null),
            latitude: num(null), longitude: num(null),
            photonBaseUrl: str("https://photon.komoot.io"), language: str("en"), countryCodes: str("GB"),
            layers: str("street,locality,district,city"), maxResults: num(5), minChars: num(3),
            requestIntervalMs: num(500), keepHouseNumber: { raw: true }, placeholder: str("Start typing an address…"),
            ...over,
        },
        mode: { isControlDisabled: false, label: "Address", ...mode },
    } as unknown as Ctx;
}

const address: ParsedAddress = {
    addressLine: "221B Baker Street, a very long line", postalCode: "NW1 4RB", city: "London", county: "",
    stateOrProvince: "England", country: "United Kingdom", countryCode: "GB", latitude: 51.52, longitude: -0.15, secondaryLine: "",
};

function start(over: Record<string, unknown> = {}) {
    const control = new AdressFieldEN();
    const notify = jest.fn();
    const ctx = context(over);
    control.init(ctx, notify, {});
    const element = control.updateView(ctx);
    return { control, notify, props: element.props as AddressAutocompleteProps };
}

describe("AdressFieldEN control", () => {
    test("updateView passes the configuration and the current value", () => {
        const { props } = start();
        expect(props).toMatchObject({
            value: "Old line", disabled: false, label: "Address", placeholder: "Start typing an address…",
            minChars: 3, requestIntervalMs: 500, keepHouseNumber: true,
        });
    });

    test("before any user action, outputs are the current input values (complete state)", () => {
        const { control } = start();
        expect(control.getOutputs()).toEqual({
            addressLine: "Old line", postalCode: "", city: "", county: "", stateOrProvince: "",
            country: "", countryCode: "", latitude: undefined, longitude: undefined,
        });
    });

    test("selection: notifies once, writes the 9 outputs (address line cut to MaxLength 20)", () => {
        const { control, notify, props } = start();
        props.onSelect(address);
        expect(notify).toHaveBeenCalledTimes(1);
        const out = control.getOutputs();
        expect(out).toEqual({
            addressLine: "221B Baker Street, a", postalCode: "NW1 4RB", city: "London", county: "",
            stateOrProvince: "England", country: "United Kingdom", countryCode: "GB", latitude: 51.52, longitude: -0.15,
        });
        // canvas apps keep the previous value of a missing key, so the complete state is returned every time
        expect(control.getOutputs()).toEqual(out);
    });

    test("free text: the address line changes, the other columns keep their last value", () => {
        const { control, notify, props } = start({ postalCode: str("SW1A 1AA"), city: str("London") });
        props.onFreeText("my own address");
        expect(notify).toHaveBeenCalledTimes(1);
        expect(control.getOutputs()).toMatchObject({ addressLine: "my own address", postalCode: "SW1A 1AA", city: "London" });
    });

    test("free text after a selection keeps the selected postcode/city (nothing is lost)", () => {
        const { control, props } = start();
        props.onSelect(address);
        control.getOutputs();
        props.onFreeText("221B Baker St");
        expect(control.getOutputs()).toMatchObject({ addressLine: "221B Baker St", postalCode: "NW1 4RB", city: "London", latitude: 51.52 });
    });

    test("clear: every column emptied", () => {
        const { control, notify, props } = start();
        props.onClear();
        expect(notify).toHaveBeenCalledTimes(1);
        expect(control.getOutputs()).toMatchObject({ addressLine: "", city: "", postalCode: "", latitude: null, longitude: null });
    });

    test("canvas: a value changed from outside (formula / variable) becomes the new output state", () => {
        const control = new AdressFieldEN();
        control.init(context(), jest.fn(), {});
        control.updateView(context({ postalCode: str("EC1A 1BB"), latitude: num(51.5) }));
        expect(control.getOutputs()).toMatchObject({ postalCode: "EC1A 1BB", latitude: 51.5 });
    });

    test("canvas: no Dataverse attributes (MaxLength) and no label -> still works", () => {
        const noAttr = { raw: "x", attributes: undefined };
        const { control, props } = start({ addressLine: noAttr });
        props.onSelect(address);
        expect(control.getOutputs().addressLine).toBe("221B Baker Street, a very long line"); // not cut
    });

    test("canvas: the allocated height is passed to the UI", () => {
        const control = new AdressFieldEN();
        control.init(context(), jest.fn(), {});
        const el = control.updateView(context({}, { allocatedHeight: 44 }));
        expect((el.props as AddressAutocompleteProps).height).toBe(44);
    });

    test("unbound optional properties do not break the control", () => {
        const unbound = { raw: undefined, attributes: undefined };
        const { control, props } = start({ postalCode: unbound, latitude: unbound, longitude: unbound, county: unbound });
        props.onSelect(address);
        expect(() => control.getOutputs()).not.toThrow();
    });

    test("search uses the GB / en / layers configuration and never the house layer", async () => {
        const fetchMock = jest.fn(() => Promise.resolve(new Response('{"type":"FeatureCollection","features":[]}', { status: 200 })));
        (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
        const { props } = start({ layers: str("house,street") });
        await props.search("baker street");
        const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
        expect(url).toContain("https://photon.komoot.io/api?");
        expect(url).toContain("q=baker+street");
        expect(url).toContain("lang=en");
        expect(url).toContain("countrycode=GB");
        expect(url).toContain("layer=street");
        expect(url).not.toContain("house");
        expect(url).not.toContain("lat=");
    });

    test("stored coordinates bias the search", async () => {
        const fetchMock = jest.fn(() => Promise.resolve(new Response('{"type":"FeatureCollection","features":[]}', { status: 200 })));
        (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
        const { props } = start({ latitude: num(51.5), longitude: num(-0.12) });
        await props.search("abbey road");
        const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
        expect(url).toContain("lat=51.5");
        expect(url).toContain("lon=-0.12");
        expect(url).toContain("zoom=12");
    });

    test("defaults apply when the maker configured nothing", () => {
        const { props } = start({ minChars: num(null), requestIntervalMs: num(null), placeholder: str(null), keepHouseNumber: { raw: null } });
        expect(props).toMatchObject({ minChars: 3, requestIntervalMs: 500, placeholder: "Start typing an address…", keepHouseNumber: true });
    });

    test("destroy aborts without error", () => {
        const { control } = start();
        expect(() => control.destroy()).not.toThrow();
    });
});
