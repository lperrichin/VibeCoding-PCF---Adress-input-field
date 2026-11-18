/** Photon layers. "house" exists in the API but is deliberately NOT usable in this control. */
export type PhotonLayer =
    | "house" | "street" | "locality" | "district" | "city"
    | "county" | "state" | "country" | "other";

export type AllowedLayer = Exclude<PhotonLayer, "house">;

/** Languages accepted by the public Photon instance. */
export type PhotonLang = "en" | "fr" | "de" | "default";

export interface PhotonProperties {
    osm_type: "N" | "W" | "R";
    osm_id: number;
    osm_key: string;
    osm_value: string;
    type: PhotonLayer;
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countrycode?: string;
    extent?: [number, number, number, number];
}

export interface PhotonFeature {
    type: "Feature";
    /** GeoJSON order: [longitude, latitude] */
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: PhotonProperties;
}

export interface PhotonFeatureCollection {
    type: "FeatureCollection";
    features: PhotonFeature[];
}

/** Parameters of a Photon /api search used by this control. */
export interface PhotonSearchParams {
    q: string;
    lang: PhotonLang;
    limit: number;
    layers: AllowedLayer[];
    countryCodes: string[];
    /** Location bias, only used when both are set. */
    lat?: number;
    lon?: number;
    zoom?: number;
}

export interface ParsedAddress {
    addressLine: string;
    postalCode: string;
    city: string;
    county: string;
    stateOrProvince: string;
    country: string;
    countryCode: string;
    latitude: number;
    longitude: number;
    /** Display only: "postcode city, country" */
    secondaryLine: string;
}

export interface AddressFieldConfig {
    baseUrl: string;
    lang: PhotonLang;
    countryCodes: string[];
    layers: AllowedLayer[];
    limit: number;
    minChars: number;
    requestIntervalMs: number;
    keepHouseNumber: boolean;
    placeholder: string;
}

export type PhotonErrorKind =
    /** 503 or other server-side overload (fair-use throttling) */
    | "busy"
    /** 400: invalid parameter (bad lang, layer, ...) */
    | "config"
    /** Network failure, CORS, unreadable response */
    | "network"
    /** No answer within the timeout */
    | "timeout";

export class PhotonError extends Error {
    constructor(
        public readonly kind: PhotonErrorKind,
        message: string,
        public readonly status = 0
    ) {
        super(message);
        this.name = "PhotonError";
        // Required when targeting ES5 so that instanceof works.
        Object.setPrototypeOf(this, PhotonError.prototype);
    }
}
