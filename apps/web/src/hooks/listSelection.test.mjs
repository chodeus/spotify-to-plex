import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptySelection, nextSelection } from './listSelection.ts';

const ids = ['a', 'b', 'c', 'd', 'e'];
const click = (state, id, keys = {}) => nextSelection(state, { id, orderedIds: ids, ...keys });
const selected = state => [...state.selection].sort();

test('a plain click selects only that item and makes it the pivot', () => {
    const state = click(click(emptySelection, 'a'), 'c');
    assert.deepEqual(selected(state), ['c']);
    assert.equal(state.pivot, 'c');
});

test('meta-click toggles an item without touching the rest', () => {
    const added = click(click(emptySelection, 'a'), 'c', { metaKey: true });
    assert.deepEqual(selected(added), ['a', 'c']);
    assert.equal(added.pivot, 'c');

    const removed = click(added, 'a', { metaKey: true });
    assert.deepEqual(selected(removed), ['c']);
    assert.equal(removed.pivot, 'c');
});

test('shift-click selects from the pivot to the clicked item and keeps the pivot', () => {
    const state = click(click(emptySelection, 'b'), 'd', { shiftKey: true });
    assert.deepEqual(selected(state), ['b', 'c', 'd']);
    assert.equal(state.pivot, 'b');
});

test('a second shift-click replaces the previous range around the pivot', () => {
    const first = click(click(emptySelection, 'b'), 'd', { shiftKey: true });
    assert.deepEqual(selected(click(first, 'a', { shiftKey: true })), ['a', 'b']);
});

test('shift-click keeps selected items outside the run around the pivot', () => {
    const state = click(click(click(emptySelection, 'a'), 'd', { metaKey: true }), 'b', { shiftKey: true });
    assert.deepEqual(selected(state), ['a', 'b', 'c', 'd']);
});

test('meta-deselecting the pivot hands it to the next selected item, else the first', () => {
    const state = click(click(click(emptySelection, 'b'), 'c', { metaKey: true }), 'e', { metaKey: true });
    const afterNext = click({ ...state, pivot: 'c' }, 'c', { metaKey: true });
    assert.equal(afterNext.pivot, 'e');

    const afterFirst = click(state, 'e', { metaKey: true });
    assert.equal(afterFirst.pivot, 'b');
    assert.deepEqual(selected(click(afterFirst, 'd', { shiftKey: true })), ['b', 'c', 'd']);
});

test('shift-click without a usable pivot selects only the clicked item', () => {
    assert.deepEqual(selected(click(emptySelection, 'c', { shiftKey: true })), ['c']);
    const stale = { selection: new Set(['x']), pivot: 'x' };
    const state = click(stale, 'c', { shiftKey: true });
    assert.deepEqual(selected(state), ['c']);
    assert.equal(state.pivot, 'c');
});

test('an event never mutates the previous selection', () => {
    const before = click(click(emptySelection, 'a'), 'c', { metaKey: true });
    click(before, 'e', { shiftKey: true });
    click(before, 'a', { metaKey: true });
    assert.deepEqual(selected(before), ['a', 'c']);
});
