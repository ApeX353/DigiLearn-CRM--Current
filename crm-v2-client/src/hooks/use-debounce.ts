import { useEffect, useState } from "react";

export function useDebounce(value: string, duration: number = 300) {

    const [debounced, setDebouncedValue] = useState("");

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