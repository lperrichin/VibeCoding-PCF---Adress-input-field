/** Types de l'API Photon (GeoJSON) et de l'adresse normalisée exposée au composant. */

export type PhotonLayer =
    | "house" | "street" | "locality" | "district"
    | "city" | "county" | "state" | "country" | "other";

export interface PhotonProperties {
    osm_type: "N" | "W" | "R";
    osm_id: number;
    osm_key?: string;
    osm_value?: string;
    type?: PhotonLayer;
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    /** [minLon, maxLat, maxLon, minLat] (ordre ouest, nord, est, sud) */
    extent?: [number, number, number, number];
    extra?: Record<string, string>;
}

export interface PhotonFeature {
    type: "Feature";
    /** coordinates = [longitude, latitude] */
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: PhotonProperties;
}

export interface PhotonFeatureCollection {
    type: "FeatureCollection";
    features: PhotonFeature[];
}

/** Adresse à plat, prête à alimenter les sorties du composant. */
export interface NormalizedAddress {
    /** Identifiant OSM stable, ex. "N703432291" */
    id: string;
    /** Adresse postale complète, ex. "10 Rue de Rivoli, 75004 Paris" */
    label: string;
    /** Ligne secondaire pour distinguer les homonymes, ex. "Somme, Hauts-de-France" */
    detail: string;
    housenumber: string;
    street: string;
    postcode: string;
    city: string;
    country: string;
    countryCode: string;
    county: string;
    state: string;
    district: string;
    latitude: number;
    longitude: number;
    /** Couche Photon du résultat (house, street, city…) */
    layer: string;
}
