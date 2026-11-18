export interface ExtractedQuery {
    /** Text to send to Photon (house number removed). Empty = nothing worth searching. */
    query: string;
    /** Normalised house number, e.g. "10", "10 bis", "221B", "12-14". */
    houseNumber?: string;
}

/**
 * Leading number: "10 rue de rivoli", "10bis rue x", "10 bis, rue x", "221b baker street", "12-14 rue x".
 * Up to 4 digits, so a 5-digit postcode at the start is never taken for a house number.
 */
const LEADING = /^\s*(\d{1,4}(?:\s?-\s?\d{1,4})?\s?(?:[a-zA-Z]|bis|ter|quater)?)\b[\s,]+(.+)$/i;

/**
 * Trailing number (German style): "hauptstraße 10a".
 * Up to 3 digits, so a trailing 4/5-digit postcode ("paris 75001") is left alone.
 */
const TRAILING = /^(.+?)[\s,]+(\d{1,3}(?:\s?-\s?\d{1,3})?\s?[a-zA-Z]?)\s*$/;

function normalise(raw: string): string {
    let n = raw.trim().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
    // "10 b" / "10b" -> "10B" (single letter suffix upper-cased); "bis/ter/quater" stay lower-case
    n = n.replace(/^(\d+(?:-\d+)?)\s?([a-zA-Z])$/, (_m, d: string, l: string) => `${d}${l.toUpperCase()}`);
    // "10bis" -> "10 bis"
    n = n.replace(/^(\d+(?:-\d+)?)(bis|ter|quater)$/i, (_m, d: string, w: string) => `${d} ${w.toLowerCase()}`);
    return n;
}

/**
 * Splits what the user typed into the part Photon can search (street / place) and the house number.
 * Photon is queried WITHOUT the house layer, and a house number in `q` degrades the results badly
 * (e.g. "10 rue de rivoli" returns a street in Brussels), so the number is handled on our side.
 *
 * @param text what the user typed
 * @param keep when false, nothing is extracted (the full text is searched as typed)
 */
export function extractHouseNumber(text: string, keep = true): ExtractedQuery {
    const trimmed = (text ?? "").trim().replace(/\s+/g, " ");
    if (!keep) return { query: trimmed };

    // Only digits: nothing meaningful to search
    if (/^\d+$/.test(trimmed)) return { query: "" };

    const lead = LEADING.exec(trimmed);
    if (lead) {
        return { query: lead[2].trim(), houseNumber: normalise(lead[1]) };
    }
    const trail = TRAILING.exec(trimmed);
    if (trail) {
        return { query: trail[1].trim(), houseNumber: normalise(trail[2]) };
    }
    return { query: trimmed };
}
