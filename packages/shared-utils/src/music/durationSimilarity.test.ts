import { describe, expect, it } from 'vitest';
import { durationSimilarity, durationsAgree, durationsContradict, durationsDiffer } from './durationSimilarity';

describe('durationSimilarity', () => {

    it('scores identical durations as a perfect match', () => {
        expect(durationSimilarity(183_000, 183_000)).toBe(1);
    });

    it('scores 0 when either duration is missing', () => {
        expect(durationSimilarity(undefined, 183_000)).toBe(0);
        expect(durationSimilarity(183_000)).toBe(0);
        expect(durationSimilarity()).toBe(0);
    });

    it('scores 0 when a duration is zero', () => {
        expect(durationSimilarity(0, 183_000)).toBe(0);
    });

    it('keeps radio versus album variance above 0.65', () => {
        // 3:03 single against a 3:29 album cut
        expect(durationSimilarity(183_000, 209_000)).toBeGreaterThan(0.65);
    });

    it('drops a wrong-version match below 0.65', () => {
        // 3:03 orchestral cover against Faithless' 8:42 Insomnia
        expect(durationSimilarity(183_000, 522_000)).toBeLessThan(0.65);
    });

    it('is symmetric', () => {
        expect(durationSimilarity(183_000, 209_000)).toBe(durationSimilarity(209_000, 183_000));
    });

});

describe('durationsContradict', () => {

    it('flags a wrong-version pair', () => {
        expect(durationsContradict(183_000, 522_000)).toBe(true);
    });

    it('accepts radio versus album variance', () => {
        expect(durationsContradict(183_000, 209_000)).toBe(false);
    });

    it('draws the line at 0.65', () => {
        expect(durationsContradict(100_000, 160_000)).toBe(true);
        expect(durationsContradict(100_000, 150_000)).toBe(false);
    });

    it('never flags a pair with a duration missing', () => {
        expect(durationsContradict(undefined, 522_000)).toBe(false);
        expect(durationsContradict(183_000, 0)).toBe(false);
    });

});

describe('durationsAgree', () => {

    it('tells a radio edit from its extended mix', () => {
        // 3:30 radio edit against a 5:00 album mix: close enough to clear durationsContradict
        expect(durationsContradict(210_000, 300_000)).toBe(false);
        expect(durationsAgree(210_000, 300_000)).toBe(false);
    });

    it('accepts a remaster or fade a few seconds off', () => {
        expect(durationsAgree(300_000, 292_000)).toBe(true);
    });

    it('draws the line at 0.97', () => {
        expect(durationsAgree(100_000, 104_000)).toBe(false);
        expect(durationsAgree(100_000, 103_000)).toBe(true);
    });

    it('never agrees without both durations', () => {
        expect(durationsAgree(undefined, 300_000)).toBe(false);
        expect(durationsAgree(210_000, 0)).toBe(false);
    });

});

describe('durationsDiffer', () => {

    it('tells a radio edit from its extended mix', () => {
        expect(durationsDiffer(210_000, 300_000)).toBe(true);
    });

    it('accepts a remaster or fade a few seconds off', () => {
        expect(durationsDiffer(300_000, 292_000)).toBe(false);
    });

    it('draws the line at 0.97', () => {
        expect(durationsDiffer(100_000, 104_000)).toBe(true);
        expect(durationsDiffer(100_000, 103_000)).toBe(false);
    });

    it('never differs without both durations', () => {
        expect(durationsDiffer(undefined, 300_000)).toBe(false);
        expect(durationsDiffer(210_000, 0)).toBe(false);
    });

});
