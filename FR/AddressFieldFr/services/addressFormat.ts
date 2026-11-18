import { NormalizedAddress, PhotonFeature, PhotonProperties } from "./photonTypes";

/**
 * Libellé postal français : "10 Rue de Rivoli, 75004 Paris".
 * Le nom d'un point d'intérêt (magasin, etc.) n'est volontairement PAS inclus :
 * le libellé est stocké comme adresse, il ne doit contenir que l'adresse.
 * Le pays n'est ajouté que s'il n'est pas la France.
 */
export function formatLabelFr(p: PhotonProperties): string {
    const street = p.street ?? (p.type === "street" ? p.name : undefined);
    const city = p.city ?? (p.type === "city" ? p.name : undefined);

    const line1 = [p.housenumber, street].filter(Boolean).join(" ");
    const line2 = [p.postcode, city].filter(Boolean).join(" ");

    const parts = [line1, line2].filter((s) => s.length > 0);
    if (parts.length === 0 && p.name) parts.push(p.name); // région, pays…
    if (p.countrycode && p.countrycode !== "FR" && p.country) parts.push(p.country);
    return parts.join(", ");
}

/** Transforme un résultat Photon en adresse à plat. Tous les champs sont des chaînes, jamais `undefined`. */
export function normalize(f: PhotonFeature): NormalizedAddress {
    const p = f.properties;
    const [longitude, latitude] = f.geometry.coordinates;

    // Pour une rue ou une ville, le nom porteur est dans `name`
    const street = p.street ?? (p.type === "street" ? p.name ?? "" : "");
    const city = p.city ?? (p.type === "city" ? p.name ?? "" : "");

    return {
        id: `${p.osm_type}${p.osm_id}`,
        label: formatLabelFr(p),
        detail: [p.county, p.state].filter(Boolean).join(", "),
        housenumber: p.housenumber ?? "",
        street,
        postcode: p.postcode ?? "",
        city,
        country: p.country ?? "",
        countryCode: p.countrycode ?? "",
        county: p.county ?? "",
        state: p.state ?? "",
        district: p.district ?? "",
        latitude,
        longitude,
        layer: p.type ?? "",
    };
}

/**
 * Un résultat est exploitable s'il porte des coordonnées valides et un libellé, et s'il s'agit
 * d'une vraie adresse : un résultat de couche `house` sans numéro est un point d'intérêt
 * (commerce, etc.) dont le libellé ressemblerait à tort à une rue, on l'écarte.
 */
export function isUsable(f: PhotonFeature): boolean {
    const c = f.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return false;
    const p = f.properties;
    if (p.type === "house" && !(p.housenumber ?? "").trim()) return false;
    return formatLabelFr(p).length > 0;
}
