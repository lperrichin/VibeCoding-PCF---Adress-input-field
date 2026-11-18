import { IOutputs } from "../generated/ManifestTypes";
import { NormalizedAddress } from "./photonTypes";

/**
 * Sorties du composant.
 * - `Value` et `FullAddress` portent toujours le texte du champ (adresse choisie ou saisie libre).
 * - Les champs détaillés ne sont renseignés que si une suggestion est sélectionnée ; dès que
 *   l'utilisateur modifie le texte, `selected` redevient `undefined` et ils sont vidés.
 * - `IsValidated` est vrai uniquement après le choix d'une suggestion.
 */
export function buildOutputs(text: string, selected: NormalizedAddress | undefined, isValidated: boolean): IOutputs {
    return {
        Value: text,
        FullAddress: text,
        HouseNumber: selected?.housenumber ?? "",
        Street: selected?.street ?? "",
        PostCode: selected?.postcode ?? "",
        City: selected?.city ?? "",
        Country: selected?.country ?? "",
        Latitude: selected?.latitude,
        Longitude: selected?.longitude,
        CountryCode: selected?.countryCode ?? "",
        County: selected?.county ?? "",
        State: selected?.state ?? "",
        District: selected?.district ?? "",
        IsValidated: isValidated && selected !== undefined,
        OsmId: selected?.id ?? "",
    };
}
