import { useEffect, useState } from "react";

export function useDebounce(value: string, duration: number = 300) {

    // Preserve an initial URL/prefilled search; debounce subsequent edits.
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
