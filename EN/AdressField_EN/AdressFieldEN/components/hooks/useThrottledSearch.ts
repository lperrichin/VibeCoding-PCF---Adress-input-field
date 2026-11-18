import * as React from "react";
import { SearchScheduler } from "../../services/searchScheduler";

export interface UseThrottledSearchOptions<R> {
    /** Performs the search; must resolve `undefined` when aborted/superseded. */
    search: (query: string) => Promise<R | undefined>;
    /** True when `search(query)` is answered from the cache (no API call). */
    isCached?: (query: string) => boolean;
    /** Aborts the in-flight call. */
    abort?: () => void;
    minChars: number;
    intervalMs: number;
}

export interface UseThrottledSearchResult<R> {
    /** Latest result for the latest query (undefined = nothing to show). */
    result: R | undefined;
    loading: boolean;
    error: unknown;
    /** Call on every keystroke with the text to search. */
    onQueryChange: (query: string) => void;
    /** Selection / blur / clear: stop everything and drop the result. */
    reset: () => void;
}

/**
 * React wrapper of {@link SearchScheduler}: at most one API call per `intervalMs`,
 * trailing call, stale answers ignored. The scheduler is created once; options are read at call time.
 */
export function useThrottledSearch<R>(options: UseThrottledSearchOptions<R>): UseThrottledSearchResult<R> {
    const [result, setResult] = React.useState<R | undefined>(undefined);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<unknown>(undefined);

    const optionsRef = React.useRef(options);
    optionsRef.current = options;

    const schedulerRef = React.useRef<SearchScheduler<R>>();
    schedulerRef.current ??= new SearchScheduler<R>(
        () => ({ minChars: optionsRef.current.minChars, intervalMs: optionsRef.current.intervalMs }),
        {
            run: (q) => optionsRef.current.search(q),
            isCached: (q) => optionsRef.current.isCached?.(q) ?? false,
            abort: () => optionsRef.current.abort?.(),
            onResult: (_q, r) => {
                setError(undefined);
                setResult(r);
            },
            onError: (_q, e) => {
                setResult(undefined);
                setError(e);
            },
            onLoading: setLoading,
            onClear: () => {
                setResult(undefined);
                setError(undefined);
            },
        }
    );

    React.useEffect(() => {
        const scheduler = schedulerRef.current;
        return () => scheduler?.dispose();
    }, []);

    const onQueryChange = React.useCallback((query: string) => schedulerRef.current?.schedule(query), []);
    const reset = React.useCallback(() => {
        schedulerRef.current?.cancel();
        setResult(undefined);
        setError(undefined);
    }, []);

    return { result, loading, error, onQueryChange, reset };
}
