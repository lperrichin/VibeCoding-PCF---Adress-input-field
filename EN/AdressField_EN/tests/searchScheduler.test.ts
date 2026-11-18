import { SearchScheduler, SchedulerHandlers } from "../AdressFieldEN/services/searchScheduler";

interface Deferred { query: string; resolve: (v: string[] | undefined) => void; reject: (e: unknown) => void }

/** Test rig: every run() is a controllable promise, all callbacks are recorded. */
function rig(settings = { minChars: 3, intervalMs: 500 }, cached: Set<string> = new Set()) {
    const runs: Deferred[] = [];
    const callStarts: number[] = [];
    const events: string[] = [];
    const handlers: SchedulerHandlers<string[]> = {
        run: (query) =>
            new Promise((resolve, reject) => {
                callStarts.push(Date.now());
                runs.push({ query, resolve, reject });
            }),
        isCached: (q) => cached.has(q),
        abort: jest.fn(),
        onResult: (q, r) => events.push(`result:${q}:${r.join(",")}`),
        onError: (q, e) => events.push(`error:${q}:${String(e)}`),
        onLoading: (l) => events.push(`loading:${l}`),
        onClear: () => events.push("clear"),
    };
    const scheduler = new SearchScheduler<string[]>(() => settings, handlers);
    const queries = () => runs.map((r) => r.query);
    return { scheduler, runs, callStarts, events, handlers, queries, cached, settings };
}

/** Types one character every `stepMs`, like a user. */
function type(r: ReturnType<typeof rig>, text: string, stepMs = 100): void {
    for (let i = 1; i <= text.length; i++) {
        r.scheduler.schedule(text.slice(0, i));
        jest.advanceTimersByTime(stepMs);
    }
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("SearchScheduler - minimum characters", () => {
    test("below minChars: no call, list cleared", () => {
        const r = rig();
        r.scheduler.schedule("ba");
        jest.advanceTimersByTime(5000);
        expect(r.runs).toHaveLength(0);
        expect(r.events).toContain("clear");
    });

    test("typing 1 and 2 characters never calls the API; the 3rd does", () => {
        const r = rig();
        type(r, "bak");
        expect(r.queries()).toEqual(["bak"]);
    });

    test("minChars comes from the live settings", () => {
        const r = rig({ minChars: 5, intervalMs: 500 });
        type(r, "bake");
        expect(r.runs).toHaveLength(0);
        r.scheduler.schedule("baker");
        expect(r.queries()).toEqual(["baker"]);
    });

    test("dropping below minChars cancels the pending timer and aborts the in-flight call", () => {
        const r = rig();
        r.scheduler.schedule("bak"); // call 1 now
        jest.advanceTimersByTime(100);
        r.scheduler.schedule("bake"); // pending timer
        r.scheduler.schedule("ba"); // too short
        jest.advanceTimersByTime(5000);
        expect(r.queries()).toEqual(["bak"]); // "bake" never sent
        expect(r.handlers.abort).toHaveBeenCalled();
        expect(r.events.slice(-2)).toEqual(["loading:false", "clear"]);
    });
});

describe("SearchScheduler - one API call per 500 ms (§7.5)", () => {
    test("first eligible keystroke calls immediately", () => {
        const r = rig();
        r.scheduler.schedule("bak");
        expect(r.queries()).toEqual(["bak"]);
    });

    test("fast typing: calls are >= 500 ms apart and the LAST call uses the full text", () => {
        const r = rig();
        type(r, "rue de rivoli", 100);
        jest.advanceTimersByTime(2000);
        for (let i = 1; i < r.callStarts.length; i++) {
            expect(r.callStarts[i] - r.callStarts[i - 1]).toBeGreaterThanOrEqual(500);
        }
        expect(r.queries()[r.queries().length - 1]).toBe("rue de rivoli");
        expect(r.runs.length).toBeLessThanOrEqual(4); // 13 keystrokes over 1.3 s -> ~3 calls
    });

    test("never two calls less than 500 ms apart, whatever the typing rhythm", () => {
        const r = rig();
        let text = "";
        let seed = 7;
        const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 200; i++) {
            text = rand() < 0.2 && text.length > 3 ? text.slice(0, -1) : text + "abcdefgh"[Math.floor(rand() * 8)];
            r.scheduler.schedule(text);
            jest.advanceTimersByTime(Math.floor(rand() * 400));
        }
        jest.advanceTimersByTime(2000);
        expect(r.callStarts.length).toBeGreaterThan(3);
        for (let i = 1; i < r.callStarts.length; i++) {
            expect(r.callStarts[i] - r.callStarts[i - 1]).toBeGreaterThanOrEqual(500);
        }
        expect(r.queries()[r.queries().length - 1]).toBe(text);
    });

    test("only ONE timer is pending, extra keystrokes only update the latest query", () => {
        const r = rig();
        r.scheduler.schedule("bak"); // t=0 call
        jest.advanceTimersByTime(10);
        r.scheduler.schedule("bake");
        r.scheduler.schedule("baker");
        r.scheduler.schedule("bakers");
        expect(jest.getTimerCount()).toBe(1);
        jest.advanceTimersByTime(490);
        expect(r.queries()).toEqual(["bak", "bakers"]);
    });

    test("after a pause >= 500 ms the next keystroke is immediate again", () => {
        const r = rig();
        r.scheduler.schedule("bak");
        jest.advanceTimersByTime(600);
        r.scheduler.schedule("bake");
        expect(r.queries()).toEqual(["bak", "bake"]);
    });

    test("a call exactly 500 ms after the previous one is allowed", () => {
        const r = rig();
        r.scheduler.schedule("bak");
        jest.advanceTimersByTime(500);
        r.scheduler.schedule("bake");
        expect(r.queries()).toEqual(["bak", "bake"]);
    });

    test("interval comes from the live settings", () => {
        const r = rig({ minChars: 3, intervalMs: 1000 });
        r.scheduler.schedule("bak");
        jest.advanceTimersByTime(600);
        r.scheduler.schedule("bake");
        expect(r.runs).toHaveLength(1);
        jest.advanceTimersByTime(400);
        expect(r.queries()).toEqual(["bak", "bake"]);
    });

    test("an aborted/superseded call still counts towards the interval", () => {
        const r = rig();
        r.scheduler.schedule("bak"); // t=0
        r.runs[0].resolve(undefined); // aborted
        jest.advanceTimersByTime(100);
        r.scheduler.schedule("bake");
        expect(r.runs).toHaveLength(1); // still within the 500 ms
        jest.advanceTimersByTime(400);
        expect(r.runs).toHaveLength(2);
    });

    test("typing the same text again while its call is in flight does not call twice", () => {
        const r = rig();
        r.scheduler.schedule("bak");
        jest.advanceTimersByTime(600);
        r.scheduler.schedule("bak");
        jest.advanceTimersByTime(600);
        expect(r.runs).toHaveLength(1);
    });
});

describe("SearchScheduler - results", () => {
    test("result of the latest query is delivered, loading goes true then false", async () => {
        const r = rig();
        r.scheduler.schedule("bak");
        r.runs[0].resolve(["Baker Street"]);
        await Promise.resolve();
        await Promise.resolve();
        expect(r.events).toEqual(["loading:true", "result:bak:Baker Street", "loading:false"]);
    });

    test("a late answer to an older query is ignored", async () => {
        const r = rig();
        r.scheduler.schedule("bak"); // call 1
        jest.advanceTimersByTime(100);
        r.scheduler.schedule("bake"); // timer
        jest.advanceTimersByTime(400); // call 2 starts
        expect(r.queries()).toEqual(["bak", "bake"]);
        r.runs[0].resolve(["OLD"]); // late answer of call 1
        await Promise.resolve();
        await Promise.resolve();
        expect(r.events.some((e) => e.startsWith("result:"))).toBe(false);
        r.runs[1].resolve(["NEW"]);
        await Promise.resolve();
        await Promise.resolve();
        expect(r.events).toContain("result:bake:NEW");
        expect(r.events[r.events.length - 1]).toBe("loading:false");
    });

    test("an aborted call (undefined) delivers nothing", async () => {
        const r = rig();
        r.scheduler.schedule("bak");
        r.runs[0].resolve(undefined);
        await Promise.resolve();
        await Promise.resolve();
        expect(r.events.some((e) => e.startsWith("result:"))).toBe(false);
    });

    test("an error of the latest query is reported; an error of an older query is not", async () => {
        const r = rig();
        r.scheduler.schedule("bak");
        jest.advanceTimersByTime(100);
        r.scheduler.schedule("bake");
        jest.advanceTimersByTime(400);
        r.runs[0].reject("old failure");
        await Promise.resolve();
        await Promise.resolve();
        expect(r.events.some((e) => e.startsWith("error:"))).toBe(false);
        r.runs[1].reject("503");
        await Promise.resolve();
        await Promise.resolve();
        expect(r.events).toContain("error:bake:503");
    });

    test("a synchronous throw in run() is reported as an error", async () => {
        const events: string[] = [];
        const s = new SearchScheduler<string[]>(
            () => ({ minChars: 3, intervalMs: 500 }),
            {
                run: () => { throw new Error("boom"); },
                onResult: () => undefined,
                onError: (_q, e) => events.push(`error:${(e as Error).message}`),
                onLoading: () => undefined,
                onClear: () => undefined,
            }
        );
        s.schedule("bak");
        await Promise.resolve();
        await Promise.resolve();
        expect(events).toEqual(["error:boom"]);
    });
});

describe("SearchScheduler - cache (rule 8)", () => {
    test("a cached query is delivered immediately, even inside the interval", async () => {
        const r = rig();
        r.cached.add("bak");
        r.scheduler.schedule("bake"); // real call at t=0
        jest.advanceTimersByTime(100);
        r.scheduler.schedule("bak"); // cached
        expect(r.queries()).toEqual(["bake", "bak"]); // run() invoked (answered by the cache)...
        expect(jest.getTimerCount()).toBe(0); // ...without waiting
    });

    test("cache hits do not count towards the limit", () => {
        const r = rig();
        r.cached.add("cached query");
        r.scheduler.schedule("first"); // counted call, t=0
        jest.advanceTimersByTime(100);
        r.scheduler.schedule("cached query"); // not counted, t=100
        jest.advanceTimersByTime(100);
        r.scheduler.schedule("second"); // t=200: must wait until t=500 (first call at 0)
        expect(r.queries()).toEqual(["first", "cached query"]);
        jest.advanceTimersByTime(300);
        expect(r.queries()).toEqual(["first", "cached query", "second"]);
        expect(r.callStarts[2] - r.callStarts[0]).toBe(500);
    });

    test("typing a cached query cancels the pending timer", () => {
        const r = rig();
        r.cached.add("bak");
        r.scheduler.schedule("first");
        jest.advanceTimersByTime(50);
        r.scheduler.schedule("other"); // timer pending
        r.scheduler.schedule("bak"); // cached: replaces it
        jest.advanceTimersByTime(2000);
        expect(r.queries()).toEqual(["first", "bak"]);
    });
});

describe("SearchScheduler - cancel / dispose", () => {
    test("cancel() (selection or blur) stops the pending call and the in-flight one", () => {
        const r = rig();
        r.scheduler.schedule("bak");
        jest.advanceTimersByTime(50);
        r.scheduler.schedule("bake"); // timer pending
        r.scheduler.cancel();
        jest.advanceTimersByTime(5000);
        expect(r.queries()).toEqual(["bak"]);
        expect(r.handlers.abort).toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    test("an answer arriving after cancel() is ignored", async () => {
        const r = rig();
        r.scheduler.schedule("bak");
        r.scheduler.cancel();
        r.runs[0].resolve(["Baker Street"]);
        await Promise.resolve();
        await Promise.resolve();
        expect(r.events.some((e) => e.startsWith("result:"))).toBe(false);
    });

    test("dispose() clears the timer and silences all callbacks", async () => {
        const r = rig();
        r.scheduler.schedule("bak");
        jest.advanceTimersByTime(50);
        r.scheduler.schedule("bake");
        r.scheduler.dispose();
        r.runs[0].resolve(["x"]);
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
        await Promise.resolve();
        r.scheduler.schedule("anything");
        expect(r.runs).toHaveLength(1);
        expect(r.events.some((e) => e.startsWith("result:"))).toBe(false);
        expect(jest.getTimerCount()).toBe(0);
    });
});
