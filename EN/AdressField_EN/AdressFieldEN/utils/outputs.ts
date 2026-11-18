import type { IOutputs } from "../generated/ManifestTypes";
import type { ParsedAddress } from "../services/photonTypes";

/** What the user did since the last getOutputs() (spec §2.3). */
export type PendingChange =
    | { kind: "none" }
    | { kind: "selected"; address: ParsedAddress }
    | { kind: "freeText"; text: string }
    | { kind: "cleared" };

export type TextOutput = "addressLine" | "postalCode" | "city" | "county" | "stateOrProvince" | "country" | "countryCode";

/** Dataverse MaxLength of each bound text column (undefined/0 = unknown, no truncation). */
export type MaxLengths = Partial<Record<TextOutput, number | null | undefined>>;

/** IOutputs types numbers as `number | undefined`; null is what empties a number column / canvas property. */
const EMPTY_NUMBER = null as unknown as undefined;

/** Cuts the value to the column's maximum length (a longer value would make the save fail). */
export function fit(value: string, max: number | null | undefined): string {
    if (!max || max <= 0 || value.length <= max) return value;
    return value.slice(0, max).trimEnd();
}

/**
 * Builds the IOutputs of the control.
 *  - selected : every bound column is written; values Photon does not have become "" (text) / undefined (numbers),
 *               so the record never mixes the old and the new address.
 *  - freeText : only the address line is written, the other columns are left unchanged (keys omitted).
 *  - cleared  : every column is emptied (text "", numbers null).
 *  - none     : nothing to write.
 */
export function buildOutputs(change: PendingChange, max: MaxLengths = {}): IOutputs {
    switch (change.kind) {
        case "selected": {
            const a = change.address;
            return {
                addressLine: fit(a.addressLine, max.addressLine),
                postalCode: fit(a.postalCode, max.postalCode),
                city: fit(a.city, max.city),
                county: fit(a.county, max.county),
                stateOrProvince: fit(a.stateOrProvince, max.stateOrProvince),
                country: fit(a.country, max.country),
                countryCode: fit(a.countryCode, max.countryCode),
                latitude: a.latitude,
                longitude: a.longitude,
            };
        }
        case "freeText":
            return { addressLine: fit(change.text, max.addressLine) };
        case "cleared":
            return {
                addressLine: "",
                postalCode: "",
                city: "",
                county: "",
                stateOrProvince: "",
                country: "",
                countryCode: "",
                // Canvas apps ignore `undefined` and would keep the old number: null is the blank value.
                latitude: EMPTY_NUMBER,
                longitude: EMPTY_NUMBER,
            };
        default:
            return {};
    }
}
