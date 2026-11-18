import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { AddressAutocomplete } from "./components/AddressAutocomplete";
import { PhotonClient } from "./services/photonClient";
import { AddressFieldConfig, ParsedAddress, PhotonFeature } from "./services/photonTypes";
import { parseConfig } from "./utils/config";
import { buildOutputs, MaxLengths, PendingChange } from "./utils/outputs";

const TEXT_KEYS = ["addressLine", "postalCode", "city", "county", "stateOrProvince", "country", "countryCode"] as const;
const NUMBER_KEYS = ["latitude", "longitude"] as const;

export class AdressFieldEN implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged: () => void;
    private client: PhotonClient;
    private config: AddressFieldConfig;
    private bias?: { lat: number; lon: number };

    /** What the user did since the last getOutputs() (written once, then reset). */
    private pending: PendingChange = { kind: "none" };
    /** Dataverse MaxLength of the bound text columns, refreshed on every updateView (not available in canvas apps). */
    private maxLengths: MaxLengths = {};
    /**
     * Last value of ALL 9 outputs. Canvas apps keep the previous output value when a key is missing or
     * undefined, so getOutputs() always returns the complete state.
     */
    private readonly current: IOutputs = {};
    /** Last input value seen per property, to detect changes made from outside (formula, variable, form). */
    private readonly lastInputs = new Map<string, string | number | null | undefined>();

    constructor() {
        // Empty
    }

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;
        this.config = this.readConfig(context);
        this.client = new PhotonClient(this.config.baseUrl);
        this.syncInputs(context);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        this.config = this.readConfig(context);
        this.client.setBaseUrl(this.config.baseUrl);

        const lat = context.parameters.latitude.raw;
        const lon = context.parameters.longitude.raw;
        this.bias = typeof lat === "number" && typeof lon === "number" ? { lat, lon } : undefined;

        this.syncInputs(context);

        const p = context.parameters;
        this.maxLengths = {
            addressLine: p.addressLine.attributes?.MaxLength,
            postalCode: p.postalCode.attributes?.MaxLength,
            city: p.city.attributes?.MaxLength,
            county: p.county.attributes?.MaxLength,
            stateOrProvince: p.stateOrProvince.attributes?.MaxLength,
            country: p.country.attributes?.MaxLength,
            countryCode: p.countryCode.attributes?.MaxLength,
        };

        return React.createElement(AddressAutocomplete, {
            value: context.parameters.addressLine.raw ?? "",
            disabled: context.mode.isControlDisabled,
            label: context.mode.label,
            height: context.mode.allocatedHeight,
            placeholder: this.config.placeholder,
            minChars: this.config.minChars,
            requestIntervalMs: this.config.requestIntervalMs,
            keepHouseNumber: this.config.keepHouseNumber,
            search: this.search,
            isCached: this.isCached,
            abort: this.abort,
            onSelect: this.handleSelect,
            onFreeText: this.handleFreeText,
            onClear: this.handleClear,
        });
    }

    public getOutputs(): IOutputs {
        Object.assign(this.current, buildOutputs(this.pending, this.maxLengths));
        this.pending = { kind: "none" };
        return { ...this.current };
    }

    public destroy(): void {
        this.client.dispose();
    }

    // ---- helpers (arrow functions: stable references passed to React) ----

    /** Keeps `current` in step with values set from outside (canvas formula/variable, form reload). */
    private syncInputs(context: ComponentFramework.Context<IInputs>): void {
        const p = context.parameters;
        for (const key of TEXT_KEYS) {
            const raw = p[key].raw;
            if (!this.lastInputs.has(key) || this.lastInputs.get(key) !== raw) {
                this.lastInputs.set(key, raw);
                this.current[key] = raw ?? "";
            }
        }
        for (const key of NUMBER_KEYS) {
            const raw = p[key].raw;
            if (!this.lastInputs.has(key) || this.lastInputs.get(key) !== raw) {
                this.lastInputs.set(key, raw);
                this.current[key] = typeof raw === "number" ? raw : undefined;
            }
        }
    }

    private readConfig(context: ComponentFramework.Context<IInputs>): AddressFieldConfig {
        const p = context.parameters;
        return parseConfig({
            photonBaseUrl: p.photonBaseUrl.raw,
            language: p.language.raw,
            countryCodes: p.countryCodes.raw,
            layers: p.layers.raw,
            maxResults: p.maxResults.raw,
            minChars: p.minChars.raw,
            requestIntervalMs: p.requestIntervalMs.raw,
            keepHouseNumber: p.keepHouseNumber.raw,
            placeholder: p.placeholder.raw,
        });
    }

    private paramsFor(query: string) {
        return {
            q: query,
            lang: this.config.lang,
            limit: this.config.limit,
            layers: this.config.layers,
            countryCodes: this.config.countryCodes,
            lat: this.bias?.lat,
            lon: this.bias?.lon,
        };
    }

    private search = (query: string): Promise<PhotonFeature[] | undefined> =>
        this.client.search(this.paramsFor(query));

    private isCached = (query: string): boolean => this.client.isCached(this.paramsFor(query));

    private abort = (): void => this.client.cancel();

    private handleSelect = (address: ParsedAddress): void => {
        this.pending = { kind: "selected", address };
        this.notifyOutputChanged();
    };

    private handleFreeText = (text: string): void => {
        this.pending = { kind: "freeText", text };
        this.notifyOutputChanged();
    };

    private handleClear = (): void => {
        this.pending = { kind: "cleared" };
        this.notifyOutputChanged();
    };
}
