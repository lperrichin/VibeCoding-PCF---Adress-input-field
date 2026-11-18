/**
 * @jest-environment jsdom
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { useThrottledSearch, UseThrottledSearchResult } from "../AdressFieldEN/components/hooks/useThrottledSearch";

let container: HTMLDivElement;
let latest: UseThrottledSearchResult<string[]>;
let search: jest.Mock<Promise<string[] | undefined>, [string]>;
let abort: jest.Mock;

function Probe(): null {
    latest = useThrottledSearch<string[]>({ search, abort, minChars: 3, intervalMs: 500 });
    return null;
}

/** Flushes resolved promises inside act(). */
async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    search = jest.fn((q: string) => Promise.resolve([`${q} 1`, `${q} 2`]));
    abort = jest.fn();
    act(() => { ReactDOM.render(React.createElement(Probe), container); });
});

afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
    jest.useRealTimers();
});

describe("useThrottledSearch", () => {
    test("initial state", () => {
        expect(latest.result).toBeUndefined();
        expect(latest.loading).toBe(false);
        expect(latest.error).toBeUndefined();
    });

    test("short text: nothing is searched", () => {
        act(() => latest.onQueryChange("ba"));
        expect(search).not.toHaveBeenCalled();
        expect(latest.result).toBeUndefined();
    });

    test("result arrives, loading goes true then false", async () => {
        act(() => latest.onQueryChange("baker"));
        expect(search).toHaveBeenCalledWith("baker");
        expect(latest.loading).toBe(true);
        await flush();
        expect(latest.result).toEqual(["baker 1", "baker 2"]);
        expect(latest.loading).toBe(false);
    });

    test("fast typing -> at most one call per 500 ms, last call has the full text", async () => {
        const text = "baker street";
        for (let i = 3; i <= text.length; i++) {
            act(() => latest.onQueryChange(text.slice(0, i)));
            act(() => { jest.advanceTimersByTime(100); });
            await flush();
        }
        act(() => { jest.advanceTimersByTime(600); });
        await flush();
        expect(search.mock.calls.length).toBeLessThanOrEqual(3);
        expect(search.mock.calls[search.mock.calls.length - 1][0]).toBe(text);
        expect(latest.result).toEqual([`${text} 1`, `${text} 2`]);
    });

    test("deleting below minChars clears the result", async () => {
        act(() => latest.onQueryChange("baker"));
        await flush();
        expect(latest.result).toBeDefined();
        act(() => latest.onQueryChange("ba"));
        expect(latest.result).toBeUndefined();
        expect(abort).toHaveBeenCalled();
    });

    test("errors are exposed and the result is dropped", async () => {
        search.mockImplementationOnce(() => Promise.reject(new Error("busy")));
        act(() => latest.onQueryChange("baker"));
        await flush();
        expect(latest.error).toEqual(new Error("busy"));
        expect(latest.result).toBeUndefined();
        expect(latest.loading).toBe(false);
    });

    test("reset() drops result and cancels pending work", async () => {
        act(() => latest.onQueryChange("baker"));
        await flush();
        act(() => latest.onQueryChange("bakers")); // timer pending
        act(() => latest.reset());
        act(() => { jest.advanceTimersByTime(2000); });
        await flush();
        expect(latest.result).toBeUndefined();
        expect(search).toHaveBeenCalledTimes(1);
    });

    test("unmount cancels the pending timer and aborts", () => {
        act(() => latest.onQueryChange("baker"));
        act(() => latest.onQueryChange("bakers"));
        act(() => { ReactDOM.unmountComponentAtNode(container); });
        expect(abort).toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });
});
