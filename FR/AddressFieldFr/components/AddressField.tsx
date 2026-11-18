import * as React from "react";
import {
    Button,
    Caption1,
    Combobox,
    FluentProvider,
    Option,
    makeStyles,
    tokens,
    webLightTheme,
} from "@fluentui/react-components";
import { NormalizedAddress } from "../services/photonTypes";
import { PhotonError } from "../services/PhotonClient";

export const STRINGS = {
    defaultLabel: "Adresse",
    clear: "Effacer l'adresse",
    searching: "Recherche en cours…",
    noResult: "Aucune adresse trouvée",
    errorBusy: "Service d'adresse saturé, réessayez dans un instant. Saisie libre possible.",
    errorGeneric: "Recherche d'adresse indisponible. Saisie libre possible.",
    attribution: "© OpenStreetMap contributors",
} as const;

export interface AddressFieldProps {
    /** Texte affiché dans le champ */
    value: string;
    placeholder?: string;
    /** Nom accessible du champ (lecteurs d'écran) */
    label?: string;
    disabled: boolean;
    debounceMs: number;
    /** Nombre minimal de caractères avant recherche, selon la saisie (8 si elle commence par un chiffre, 3 sinon) */
    minLength: (query: string) => number;
    search: (query: string) => Promise<NormalizedAddress[]>;
    /** Saisie libre : l'utilisateur tape du texte (la sélection précédente n'est plus valide) */
    onTextChange: (text: string) => void;
    /** L'utilisateur a choisi une suggestion */
    onSelect: (address: NormalizedAddress) => void;
    onClear: () => void;
}

type Status = "idle" | "loading" | "results" | "empty" | "error";

const useStyles = makeStyles({
    root: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        width: "100%",
        boxSizing: "border-box",
    },
    combo: {
        flexGrow: 1,
        minWidth: 0,
    },
    option: {
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
    },
    detail: {
        color: tokens.colorNeutralForeground3,
    },
    clear: {
        flexShrink: 0,
    },
});

function errorMessage(e: unknown): string {
    return e instanceof PhotonError && e.status === 429 ? STRINGS.errorBusy : STRINGS.errorGeneric;
}

export const AddressField: React.FC<AddressFieldProps> = (props) => {
    const styles = useStyles();

    const [text, setText] = React.useState(props.value);
    const [status, setStatus] = React.useState<Status>("idle");
    const [results, setResults] = React.useState<NormalizedAddress[]>([]);
    const [error, setError] = React.useState<string>(STRINGS.errorGeneric);
    const [open, setOpen] = React.useState(false);

    const timer = React.useRef<number | undefined>(undefined);
    /** Numéro de la dernière demande : toute réponse d'une demande plus ancienne est ignorée. */
    const requestId = React.useRef(0);

    // Le texte venant du Canvas (enregistrement chargé, formule…) remplace la saisie, sans interroger Photon.
    React.useEffect(() => {
        setText(props.value);
    }, [props.value]);

    // Démontage : plus de temporisation ni de réponse tardive.
    React.useEffect(() => {
        return () => {
            window.clearTimeout(timer.current);
            requestId.current++;
        };
    }, []);

    const reset = (): void => {
        window.clearTimeout(timer.current);
        requestId.current++;
        setResults([]);
        setStatus("idle");
        setOpen(false);
    };

    const runSearch = async (query: string): Promise<void> => {
        const id = ++requestId.current;
        setStatus("loading");
        setOpen(true);
        try {
            const found = await props.search(query);
            if (id !== requestId.current) return;
            setResults(found);
            setStatus(found.length > 0 ? "results" : "empty");
        } catch (e) {
            if (id !== requestId.current) return;
            if (e instanceof Error && e.name === "AbortError") return;
            setResults([]);
            setError(errorMessage(e));
            setStatus("error");
        }
    };

    const handleInput = (newText: string): void => {
        setText(newText);
        props.onTextChange(newText);

        window.clearTimeout(timer.current);
        requestId.current++; // invalide toute réponse encore attendue

        const query = newText.trim();
        if (query.length < props.minLength(query)) {
            setResults([]);
            setStatus("idle");
            setOpen(false);
            return;
        }
        timer.current = window.setTimeout(() => {
            void runSearch(query);
        }, props.debounceMs);
    };

    const handleSelect = (id: string | undefined): void => {
        const picked = results.find((a) => a.id === id);
        if (!picked) return;
        reset();
        setText(picked.label);
        props.onSelect(picked);
    };

    const handleClear = (): void => {
        reset();
        setText("");
        props.onClear();
    };

    const isOpen = open && !props.disabled && status !== "idle";

    return (
        <FluentProvider theme={webLightTheme} style={{ background: "transparent", width: "100%" }}>
            <div className={styles.root}>
                <Combobox
                    className={styles.combo}
                    freeform
                    expandIcon={null}
                    aria-label={props.label ?? STRINGS.defaultLabel}
                    placeholder={props.placeholder}
                    disabled={props.disabled}
                    value={text}
                    selectedOptions={[]}
                    open={isOpen}
                    onOpenChange={(_, data) => setOpen(data.open)}
                    onChange={(e) => handleInput(e.target.value)}
                    onOptionSelect={(_, data) => handleSelect(data.optionValue)}
                >
                    {status === "loading" && (
                        <Option key="status-loading" value="status-loading" text={STRINGS.searching} disabled>
                            {STRINGS.searching}
                        </Option>
                    )}
                    {status === "empty" && (
                        <Option key="status-empty" value="status-empty" text={STRINGS.noResult} disabled>
                            {STRINGS.noResult}
                        </Option>
                    )}
                    {status === "error" && (
                        <Option key="status-error" value="status-error" text={error} disabled>
                            {error}
                        </Option>
                    )}
                    {status === "results" &&
                        results.map((a) => (
                            <Option key={a.id} value={a.id} text={a.label}>
                                <div className={styles.option}>
                                    <span>{a.label}</span>
                                    {a.detail.length > 0 && <Caption1 className={styles.detail}>{a.detail}</Caption1>}
                                </div>
                            </Option>
                        ))}
                    {status === "results" && (
                        <Option key="attribution" value="attribution" text={STRINGS.attribution} disabled>
                            <Caption1 className={styles.detail}>{STRINGS.attribution}</Caption1>
                        </Option>
                    )}
                </Combobox>
                {text.length > 0 && !props.disabled && (
                    <Button
                        className={styles.clear}
                        appearance="subtle"
                        size="small"
                        aria-label={STRINGS.clear}
                        title={STRINGS.clear}
                        onClick={handleClear}
                    >
                        ✕
                    </Button>
                )}
            </div>
        </FluentProvider>
    );
};
