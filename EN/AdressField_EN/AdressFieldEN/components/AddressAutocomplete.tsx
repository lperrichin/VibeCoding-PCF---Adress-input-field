import * as React from "react";
import {
    Button,
    Combobox,
    Option,
    FluentProvider,
    Spinner,
    Caption1,
    makeStyles,
    mergeClasses,
    tokens,
    webLightTheme,
} from "@fluentui/react-components";
import type { ComboboxProps } from "@fluentui/react-components";
import { ParsedAddress, PhotonError, PhotonFeature } from "../services/photonTypes";
import { extractHouseNumber } from "../utils/houseNumber";
import { toSuggestions } from "../utils/addressMapper";
import { useThrottledSearch } from "./hooks/useThrottledSearch";

export interface AddressAutocompleteProps {
    /** addressLine.raw ?? "" */
    value: string;
    /** context.mode.isControlDisabled */
    disabled: boolean;
    /** context.mode.label (accessible name; empty in canvas apps) */
    label: string;
    /** context.mode.allocatedHeight in px (canvas apps; -1 or undefined when unknown) */
    height?: number;
    placeholder: string;
    minChars: number;
    requestIntervalMs: number;
    keepHouseNumber: boolean;
    /** Search the text (house number already removed). Resolves undefined when aborted/superseded. */
    search: (query: string) => Promise<PhotonFeature[] | undefined>;
    /** True when `search(query)` is answered by the cache (no API call). */
    isCached?: (query: string) => boolean;
    /** Aborts the in-flight API call. */
    abort?: () => void;
    /** A suggestion was picked. */
    onSelect: (address: ParsedAddress) => void;
    /** The user left the field with typed text and no selection. */
    onFreeText: (text: string) => void;
    /** The field was emptied. */
    onClear: () => void;
}

const useStyles = makeStyles({
    wrapper: {
        position: "relative",
        width: "100%",
        minWidth: 0,
    },
    combobox: {
        width: "100%",
        maxWidth: "none",
        minWidth: 0,
    },
    comboboxWithClear: {
        // room for the clear button
        "& input": { paddingRight: "28px" },
    },
    clearButton: {
        position: "absolute",
        top: "50%",
        right: "4px",
        transform: "translateY(-50%)",
        minWidth: "24px",
        width: "24px",
        height: "24px",
        padding: 0,
    },
    option: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        minWidth: 0,
    },
    primary: {
        fontWeight: tokens.fontWeightSemibold,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: "100%",
    },
    secondary: {
        color: tokens.colorNeutralForeground3,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: "100%",
    },
    attribution: {
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        color: tokens.colorNeutralForeground3,
    },
    srOnly: {
        position: "absolute",
        width: "1px",
        height: "1px",
        margin: "-1px",
        padding: 0,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap",
        border: 0,
    },
});

/** Canvas apps give the control a fixed height: pick the Fluent size that fits. */
export function sizeForHeight(height: number | undefined): "small" | "medium" | "large" {
    if (height === undefined || height <= 0) return "medium";
    if (height < 32) return "small";
    if (height < 40) return "medium";
    return "large";
}

const ERROR_OPTION = "__error";
const EMPTY_OPTION = "__empty";

/** User-facing text for a search failure (spec §6.3). */
export function errorMessage(error: unknown): string {
    if (error instanceof PhotonError) {
        switch (error.kind) {
            case "busy":
                return "Address service busy, please retry";
            case "config":
                return "Address search misconfigured";
            default:
                return "Address service unavailable";
        }
    }
    return "Address service unavailable";
}

const ClearIcon: React.FC = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path
            d="M2.2 2.2a.75.75 0 0 1 1.06 0L6 4.94l2.74-2.74a.75.75 0 1 1 1.06 1.06L7.06 6l2.74 2.74a.75.75 0 1 1-1.06 1.06L6 7.06 3.26 9.8A.75.75 0 0 1 2.2 8.74L4.94 6 2.2 3.26a.75.75 0 0 1 0-1.06Z"
            fill="currentColor"
        />
    </svg>
);

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = (props) => {
    const styles = useStyles();
    const { value, disabled, label, placeholder, keepHouseNumber, onSelect, onFreeText, onClear } = props;

    const [text, setText] = React.useState(value);
    const [open, setOpen] = React.useState(false);
    const [houseNumber, setHouseNumber] = React.useState<string | undefined>(undefined);

    /** Last text this control wrote to the form: lets us tell an outside change from our own echo. */
    const lastWritten = React.useRef(value);
    const justSelected = React.useRef(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const { result, loading, error, onQueryChange, reset } = useThrottledSearch<PhotonFeature[]>({
        search: props.search,
        isCached: props.isCached,
        abort: props.abort,
        minChars: props.minChars,
        intervalMs: props.requestIntervalMs,
    });

    // Value changed from outside (form reload, another script...): show it, drop stale suggestions.
    React.useEffect(() => {
        if (value !== lastWritten.current) {
            lastWritten.current = value;
            setText(value);
            setHouseNumber(undefined);
            setOpen(false);
            reset();
        }
    }, [value, reset]);

    const suggestions = React.useMemo(
        () => (result ? toSuggestions(result, houseNumber) : undefined),
        [result, houseNumber]
    );

    const hasError = error !== undefined;
    const noResult = !hasError && !loading && suggestions !== undefined && suggestions.length === 0;
    const hasContent = hasError || noResult || (suggestions !== undefined && suggestions.length > 0);

    React.useEffect(() => {
        if (hasError) console.error("[AdressField_EN] address search failed:", error);
    }, [hasError, error]);

    const handleChange = (ev: React.ChangeEvent<HTMLInputElement>): void => {
        const typed = ev.target.value;
        setText(typed);
        const extracted = extractHouseNumber(typed, keepHouseNumber);
        setHouseNumber(extracted.houseNumber);
        onQueryChange(extracted.query);
        setOpen(true);
    };

    const handleSelect: ComboboxProps["onOptionSelect"] = (_ev, data) => {
        const index = Number(data.optionValue);
        const address = suggestions?.[index];
        if (!address) return; // disabled info option
        justSelected.current = true;
        lastWritten.current = address.addressLine;
        setText(address.addressLine);
        setOpen(false);
        reset();
        onSelect(address);
    };

    const handleBlur = (): void => {
        setOpen(false);
        if (justSelected.current) {
            justSelected.current = false;
            return;
        }
        const trimmed = text.trim();
        if (trimmed === "") {
            if (lastWritten.current !== "") {
                lastWritten.current = "";
                onClear();
            }
        } else if (trimmed !== lastWritten.current) {
            lastWritten.current = trimmed;
            setText(trimmed);
            onFreeText(trimmed);
        }
        reset();
    };

    const handleClear = (): void => {
        setText("");
        setHouseNumber(undefined);
        setOpen(false);
        reset();
        if (lastWritten.current !== "") {
            lastWritten.current = "";
            onClear();
        }
        inputRef.current?.focus();
    };

    const announce = hasError
        ? errorMessage(error)
        : suggestions
            ? suggestions.length === 0
                ? "No address found"
                : `${suggestions.length} ${suggestions.length === 1 ? "address" : "addresses"} found`
            : "";

    const showClear = !disabled && text.length > 0;

    return (
        <FluentProvider theme={webLightTheme} style={{ background: "transparent", width: "100%" }}>
            <div className={styles.wrapper}>
                <Combobox
                    ref={inputRef}
                    className={mergeClasses(styles.combobox, showClear && styles.comboboxWithClear)}
                    freeform
                    size={sizeForHeight(props.height)}
                    disabled={disabled}
                    value={text}
                    selectedOptions={[]}
                    placeholder={placeholder}
                    aria-label={label || "Address"}
                    autoComplete="off"
                    open={open && hasContent}
                    onOpenChange={(_ev, data) => setOpen(data.open)}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onOptionSelect={handleSelect}
                    expandIcon={loading ? { children: <Spinner size="tiny" aria-label="Searching addresses" /> } : null}
                >
                    {hasError && (
                        <Option key={ERROR_OPTION} value={ERROR_OPTION} text={errorMessage(error)} disabled>
                            {errorMessage(error)}
                        </Option>
                    )}
                    {noResult && (
                        <Option key={EMPTY_OPTION} value={EMPTY_OPTION} text="No address found" disabled>
                            No address found
                        </Option>
                    )}
                    {!hasError &&
                        suggestions?.map((s, i) => (
                            <Option key={`${s.addressLine}|${s.secondaryLine}|${i}`} value={String(i)} text={s.addressLine}>
                                <div className={styles.option}>
                                    <span className={styles.primary}>{s.addressLine}</span>
                                    {s.secondaryLine && <Caption1 className={styles.secondary}>{s.secondaryLine}</Caption1>}
                                </div>
                            </Option>
                        ))}
                    {hasContent && (
                        <div className={styles.attribution} role="presentation">
                            <Caption1>© OpenStreetMap contributors</Caption1>
                        </div>
                    )}
                </Combobox>

                {showClear && (
                    <Button
                        className={styles.clearButton}
                        appearance="transparent"
                        size="small"
                        aria-label="Clear address"
                        icon={<ClearIcon />}
                        onMouseDown={(e) => e.preventDefault()} // keep focus, avoid a blur before the click
                        onClick={handleClear}
                    />
                )}

                <span className={styles.srOnly} role="status" aria-live="polite">
                    {announce}
                </span>
            </div>
        </FluentProvider>
    );
};
