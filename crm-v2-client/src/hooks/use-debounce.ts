import { useEffect, useState } from "react";

export function useDebounce(value: string, duration: number = 300) {

    // Seeded from `value`, not from "". It used to start empty no matter what
    // was passed, so a page opened with a term already in hand — the leads list
    // arriving from the topbar search with `?search=Ingwalo` — reported an empty
    // search on first render and only corrected itself a full duration later.
    // The caller had the term; the hook threw it away and made them wait for it.
    const [debounced, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedValue(value);
        }, duration)

        return () => {
            clearTimeout(timeout)
        }
    },[value, duration])

    return debounced;
}