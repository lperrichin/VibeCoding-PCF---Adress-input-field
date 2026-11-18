export interface SchedulerSettings {
    /** Minimum characters of the query before any search (default 3). */
    minChars: number;
    /** Never start two API calls closer than this (default 500 ms). */
    intervalMs: number;
}

export interface SchedulerHandlers<R> {
    /** Performs the search. Must resolve `undefined` when the call was aborted/superseded. */
    run(query: string): Promise<R | undefined>;
    /** True when `run(query)` would be answered from the cache (no API call). */
    isCached?(query: string): boolean;
    /** Aborts the in-flight API call, if any. */
    abort?(): void;
    onResult(query: string, result: R): void;
    onError(query: string, error: unknown): void;
    onLoading(loading: boolean): void;
    /** The query became too short: close the list / drop suggestions. */
    onClear(): void;
}

/**
 * Call limiter of the specification (§7.5): throttle with a trailing call.
 *
 *  - The control NEVER starts two API calls less than `intervalMs` apart.
 *  - The user gets suggestions while still typing; the last call always uses the latest text.
 *  - At most one timer is pending; further keystrokes only update the latest query.
 *  - Answers from the cache do not call the API and do not count towards the limit.
 *  - A new call aborts the in-flight one; an aborted call still counts towards the interval.
 *  - A late answer is ignored when its query is no longer the latest one.
 */
export class SearchScheduler<R> {
    private latestQuery = "";
    private lastCallStart = Number.NEGATIVE_INFINITY;
    private inFlight?: string;
    private timer?: ReturnType<typeof setTimeout>;
    private loading = false;
    private disposed = false;

    constructor(
        private readonly getSettings: () => SchedulerSettings,
        private readonly handlers: SchedulerHandlers<R>,
        private readonly now: () => number = () => Date.now()
    ) {}

    /** Call on every keystroke with the text to search (house number already removed). */
    public schedule(query: string): void {
        if (this.disposed) return;
        const { minChars, intervalMs } = this.getSettings();
        this.latestQuery = query;

        // 1. Too short: cancel everything, close the list.
        if (query.length < minChars) {
            this.clearTimer();
            this.inFlight = undefined;
            this.handlers.abort?.();
            this.refreshLoading();
            this.handlers.onClear();
            return;
        }

        // 8. Cached answers are delivered immediately and do not count towards the limit.
        if (this.handlers.isCached?.(query)) {
            this.clearTimer();
            this.dispatch();
            this.refreshLoading();
            return;
        }

        // 4. One timer at most: later keystrokes only update latestQuery.
        if (this.timer !== undefined) return;

        const wait = this.lastCallStart + intervalMs - this.now();
        if (wait <= 0) {
            this.dispatch();
        } else {
            this.timer = setTimeout(() => {
                this.timer = undefined;
                this.dispatch();
            }, wait);
            this.refreshLoading();
        }
    }

    /** Selection / blur: drop the pending timer and the in-flight call. */
    public cancel(): void {
        this.clearTimer();
        this.inFlight = undefined;
        this.latestQuery = "";
        this.handlers.abort?.();
        this.refreshLoading();
    }

    public dispose(): void {
        this.disposed = true;
        this.clearTimer();
        this.inFlight = undefined;
        this.handlers.abort?.();
    }

    private dispatch(): void {
        const q = this.latestQuery;
        if (q === this.inFlight) return; // the answer to this exact query is already on its way

        if (this.handlers.isCached?.(q)) {
            this.execute(q, false);
            return;
        }
        this.lastCallStart = this.now();
        this.inFlight = q;
        this.refreshLoading();
        this.execute(q, true);
    }

    private execute(q: string, counted: boolean): void {
        void this.executeAsync(q, counted);
    }

    private async executeAsync(q: string, counted: boolean): Promise<void> {
        let result: R | undefined;
        let error: unknown;
        let failed = false;
        try {
            result = await this.handlers.run(q);
        } catch (e) {
            failed = true;
            error = e;
        }
        if (counted && this.inFlight === q) this.inFlight = undefined;
        if (this.disposed) return;

        if (failed) {
            if (q === this.latestQuery) this.handlers.onError(q, error);
        } else if (result !== undefined && q === this.latestQuery) {
            // 7. Aborted calls (undefined) and late answers are ignored.
            this.handlers.onResult(q, result);
        }
        this.refreshLoading();
    }

    private clearTimer(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    /** Loading = a timer is pending or an API call is in flight. */
    private refreshLoading(): void {
        const loading = this.timer !== undefined || this.inFlight !== undefined;
        if (loading !== this.loading) {
            this.loading = loading;
            this.handlers.onLoading(loading);
        }
    }
}
