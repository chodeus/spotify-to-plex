import { useCallback, useSyncExternalStore } from "react";
import { emptySelection, nextSelection, SelectionEvent, SelectionState } from "./listSelection";

// One selection shared by every caller of this module; no provider needed.
let state: SelectionState = emptySelection;
const listeners = new Set<() => void>();

function setState(next: SelectionState) {
    state = next;

    for (const listener of listeners)
        listener();
}

function subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

function getSelection() {
    return state.selection;
}

export function selectListItem(event: SelectionEvent) {
    setState(nextSelection(state, event));
}

export function clearListSelection() {
    setState(emptySelection);
}

export function useListSelection() {
    return useSyncExternalStore(subscribe, getSelection, getSelection);
}

export function useIsListItemSelected(id: string) {
    const isSelected = useCallback(() => state.selection.has(id), [id]);

    return useSyncExternalStore(subscribe, isSelected, isSelected);
}
