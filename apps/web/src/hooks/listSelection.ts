export type SelectionState = {
    readonly selection: ReadonlySet<string>
    readonly pivot: string | null
}

export type SelectionEvent = {
    readonly id: string
    readonly orderedIds: readonly string[]
    readonly shiftKey?: boolean
    readonly metaKey?: boolean
}

export const emptySelection: SelectionState = { selection: new Set(), pivot: null };

function only(id: string): SelectionState {
    return { selection: new Set([id]), pivot: id };
}

// Shift-click replaces the selected run around the pivot with the range from the pivot to the click.
function selectRange(state: SelectionState, id: string, orderedIds: readonly string[]): SelectionState {
    const pivotIndex = state.pivot === null ? -1 : orderedIds.indexOf(state.pivot);
    const clickedIndex = orderedIds.indexOf(id);
    if (pivotIndex < 0 || clickedIndex < 0)
        return only(id);

    const selection = new Set(state.selection);
    const isSelectedAt = (index: number) => {
        const value = orderedIds[index];

        return value !== undefined && selection.has(value);
    };

    if (isSelectedAt(pivotIndex)) {
        let start = pivotIndex;
        while (start > 0 && isSelectedAt(start - 1))
            start--;

        let end = pivotIndex;
        while (end < orderedIds.length - 1 && isSelectedAt(end + 1))
            end++;

        for (const value of orderedIds.slice(start, end + 1))
            selection.delete(value);
    }

    for (const value of orderedIds.slice(Math.min(pivotIndex, clickedIndex), Math.max(pivotIndex, clickedIndex) + 1))
        selection.add(value);

    return { selection, pivot: state.pivot };
}

// Meta-click toggles one item; removing the pivot hands it to the next selected item, else the first.
function toggle(state: SelectionState, id: string, orderedIds: readonly string[]): SelectionState {
    const selection = new Set(state.selection);
    if (!selection.has(id)) {
        selection.add(id);

        return { selection, pivot: id };
    }

    selection.delete(id);
    if (state.pivot !== id)
        return { selection, pivot: state.pivot };

    const pivotIndex = orderedIds.indexOf(id);
    const pivot = orderedIds.find((other, index) => index > pivotIndex && selection.has(other))
        ?? orderedIds.find(other => selection.has(other))
        ?? null;

    return { selection, pivot };
}

export function nextSelection(state: SelectionState, event: SelectionEvent): SelectionState {
    const { id, orderedIds, shiftKey, metaKey } = event;
    if (shiftKey)
        return selectRange(state, id, orderedIds);

    if (metaKey)
        return toggle(state, id, orderedIds);

    return only(id);
}
