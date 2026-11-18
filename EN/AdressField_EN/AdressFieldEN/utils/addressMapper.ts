import { ParsedAddress, PhotonFeature } from "../services/photonTypes";

/** Countries where the house number follows the street name (specification §7.3). */
const NUMBER_AFTER_STREET = [
    "DE", "AT", "CH", "NL", "BE", "DK", "SE", "NO", "FI", "PL",
    "CZ", "SK", "IT", "ES", "PT", "HR", "SI", "HU", "RO", "BR",
];

/** "10 Rue de Rivoli" (FR, GB, US...) or "Hauptstraße 10" (DE, NL, IT...). */
export function formatAddressLine(street: string, houseNumber: string | undefined, countryCode: string): string {
    if (!houseNumber) return street;
    return NUMBER_AFTER_STREET.includes(countryCode.toUpperCase())
        ? `${street} ${houseNumber}`
        : `${houseNumber} ${street}`;
}

/**
 * Converts a Photon feature to the address written to Dataverse.
 * @param houseNumber number typed by the user; only applied to street results.
 */
export function toParsedAddress(feature: PhotonFeature, houseNumber?: string): ParsedAddress {
    const p = feature.properties;
    const [lon, lat] = feature.geometry.coordinates; // GeoJSON order: lon first
    const countryCode = (p.countrycode ?? "").toUpperCase();
    const name = p.name ?? "";

    const mainName = p.name ?? p.street ?? "";
    const addressLine = p.type === "street" ? formatAddressLine(mainName, houseNumber, countryCode) : mainName;

    const city = p.city ?? (p.type === "city" ? name : undefined) ?? p.district ?? p.locality ?? "";

    // Secondary line: "postcode city, country" (the city is omitted when it already is the main line)
    const cityPart = city && city !== name ? city : "";
    const secondaryLine = [[p.postcode, cityPart].filter(Boolean).join(" "), p.country]
        .filter(Boolean)
        .join(", ");

    return {
        addressLine,
        postalCode: p.postcode ?? "",
        city,
        county: p.county ?? "",
        stateOrProvince: p.state ?? "",
        country: p.country ?? "",
        countryCode,
        latitude: lat,
        longitude: lon,
        secondaryLine,
    };
}

/**
 * Photon can return several OSM ways of the same street with the same postcode.
 * Keeps the first suggestion for each "main line + secondary line" pair.
 */
export function dedupeAddresses(addresses: ParsedAddress[]): ParsedAddress[] {
    const seen = new Set<string>();
    return addresses.filter((a) => {
        const key = `${a.addressLine}|${a.secondaryLine}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Features -> deduplicated suggestions, ready for the dropdown. */
export function toSuggestions(features: PhotonFeature[], houseNumber?: string): ParsedAddress[] {
    return dedupeAddresses(features.map((f) => toParsedAddress(f, houseNumber)));
}
