import { afterEach, describe, expect, it } from 'vitest';
import { schedule } from 'node-cron';
import { ScheduledTask } from 'node-cron';

// The cron strings the scheduler uses, checked against the zone they resolve in.
// supervisord used to pin TZ=UTC for this program, so "0 2 * * *" fired at 10:00
// in Australia/Perth. That was invisible until a sync ran at the wrong hour.
const started: ScheduledTask[] = [];

const nextRunIn = (expression: string, timezone: string) => {
    const task = schedule(expression, () => { /* never runs in this test */ }, { timezone });
    started.push(task);
    const next = task.getNextRun();
    expect(next).not.toBeNull();

    return new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(next!);
};

afterEach(() => { for (const task of started.splice(0)) task.destroy() });

describe('schedule timezones', () => {

    it('fires the daily jobs at their stated local hour in Perth', () => {
        expect(nextRunIn('0 2 * * *', 'Australia/Perth')).toBe('02:00');
        expect(nextRunIn('0 3 * * *', 'Australia/Perth')).toBe('03:00');
        expect(nextRunIn('0 4 * * *', 'Australia/Perth')).toBe('04:00');
    });

    it('fires at the stated hour in whatever zone it is given', () => {
        expect(nextRunIn('0 2 * * *', 'UTC')).toBe('02:00');
        expect(nextRunIn('0 2 * * *', 'America/New_York')).toBe('02:00');
        expect(nextRunIn('0 2 * * *', 'Europe/Amsterdam')).toBe('02:00');
    });

    // The regression itself: a Perth cron resolved in UTC lands 8 hours out
    it('shows the bug it guards against', () => {
        const utcTask = schedule('0 2 * * *', () => { /* never runs in this test */ }, { timezone: 'UTC' });
        started.push(utcTask);
        const inPerth = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).format(utcTask.getNextRun()!);

        expect(inPerth).toBe('10:00');
    });
});
