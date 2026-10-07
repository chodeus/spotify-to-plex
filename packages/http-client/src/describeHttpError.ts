import { httpStatusOf } from './httpStatusOf';

/** What to log for a failed request: never the error itself, whose config carries tokens and API keys. */
export function describeHttpError(error: unknown) {
    const status = httpStatusOf(error);
    if (status)
        return `HTTP ${status}`;

    return error instanceof Error ? error.message : 'no response';
}
