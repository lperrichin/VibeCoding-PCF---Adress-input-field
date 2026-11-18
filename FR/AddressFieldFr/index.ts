import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { AddressField, AddressFieldProps } from "./components/AddressField";
import { ComponentConfig, resolveConfig } from "./services/componentConfig";
import { buildOutputs } from "./services/outputs";
import { PhotonClient } from "./services/PhotonClient";
import { NormalizedAddress } from "./services/photonTypes";
import * as React from "react";

/**
 * Pendant ce délai après un `notifyOutputChanged`, une valeur différente renvoyée par le Canvas
 * est considérée comme un écho périmé (l'utilisateur a continué à taper) et ignorée.
 */
const ECHO_GRACE_MS = 1500;

export class AddressFieldFr implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged: () => void;

    private config: ComponentConfig = resolveConfig({});
    private client = new PhotonClient(this.config.client);
    private clientKey = JSON.stringify(this.config.client);

    /** Texte du champ : adresse choisie ou saisie libre */
    private text = "";
    /** Suggestion choisie ; `undefined` dès que le texte est modifié */
    private selected: NormalizedAddress | undefined;
    private isValidated = false;

    private lastDefaultValue: string | undefined;
    private awaitingEcho: { value: string; at: number } | undefined;

    constructor() {
        // Empty
    }

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        this.applyConfig(context);
        this.syncExternalValue(context);

        const props: AddressFieldProps = {
            value: this.text,
            placeholder: this.config.placeholder,
            label: context.parameters.Value.attributes?.DisplayName,
            disabled: context.mode.isControlDisabled,
            debounceMs: this.config.debounceMs,
            minLength: (q) => this.client.minLength(q),
            search: (q) => this.client.search(q),
            onTextChange: this.handleTextChange,
            onSelect: this.handleSelect,
            onClear: this.handleClear,
        };
        return React.createElement(AddressField, props);
    }

    public getOutputs(): IOutputs {
        return buildOutputs(this.text, this.selected, this.isValidated);
    }

    public destroy(): void {
        this.client.cancel();
    }

    // ───────────── Configuration ─────────────

    /** Relit les entrées ; le client (et son cache) n'est recréé que si la configuration a changé. */
    private applyConfig(context: ComponentFramework.Context<IInputs>): void {
        const p = context.parameters;
        this.config = resolveConfig({
            baseUrl: p.PhotonBaseUrl.raw,
            minCharsNumeric: p.MinCharsNumeric.raw,
            minCharsText: p.MinCharsText.raw,
            debounceMs: p.DebounceMs.raw,
            countryCodes: p.CountryCodes.raw,
            language: p.Language.raw,
            maxResults: p.MaxResults.raw,
            layers: p.Layers.raw,
            biasLatitude: p.BiasLatitude.raw,
            biasLongitude: p.BiasLongitude.raw,
            defaultValue: p.DefaultValue.raw,
            placeholder: p.Placeholder.raw,
        });

        const key = JSON.stringify(this.config.client);
        if (key !== this.clientKey) {
            this.client.cancel();
            this.client = new PhotonClient(this.config.client);
            this.clientKey = key;
        }
    }

    // ───────────── Valeur venant du Canvas ─────────────

    /**
     * Prend en compte `Value` (formule, enregistrement chargé) et `DefaultValue`, sans interroger Photon.
     * Une valeur venant du Canvas n'est jamais « validée » : les champs détaillés sont vidés.
     */
    private syncExternalValue(context: ComponentFramework.Context<IInputs>): void {
        const incoming = context.parameters.Value.raw ?? "";
        let changed = false;

        if (incoming === this.text) {
            this.awaitingEcho = undefined;
        } else if (this.awaitingEcho && Date.now() - this.awaitingEcho.at < ECHO_GRACE_MS) {
            // Écho périmé d'une valeur que nous avons déjà dépassée : on l'ignore
        } else {
            this.awaitingEcho = undefined;
            this.text = incoming;
            this.selected = undefined;
            this.isValidated = false;
            changed = true;
        }

        // Valeur par défaut : appliquée une seule fois à chaque changement, et seulement si le champ est vide
        const def = this.config.defaultValue;
        if (def !== this.lastDefaultValue) {
            this.lastDefaultValue = def;
            if (def.length > 0 && this.text.length === 0) {
                this.text = def;
                this.selected = undefined;
                this.isValidated = false;
                changed = true;
            }
        }

        if (changed) this.emit();
    }

    // ───────────── Actions de l'utilisateur ─────────────

    /** Saisie libre : la sélection précédente n'est plus valide, les champs détaillés sont vidés. */
    private readonly handleTextChange = (text: string): void => {
        if (text === this.text) return;
        this.text = text;
        this.selected = undefined;
        this.isValidated = false;
        this.emit();
    };

    /** Suggestion choisie : toutes les sorties sont alimentées avec un seul `notifyOutputChanged`. */
    private readonly handleSelect = (address: NormalizedAddress): void => {
        this.text = address.label;
        this.selected = address;
        this.isValidated = true;
        this.emit();
    };

    private readonly handleClear = (): void => {
        if (this.text.length === 0 && !this.selected) return;
        this.text = "";
        this.selected = undefined;
        this.isValidated = false;
        this.emit();
    };

    private emit(): void {
        this.awaitingEcho = { value: this.text, at: Date.now() };
        this.notifyOutputChanged();
    }
}
