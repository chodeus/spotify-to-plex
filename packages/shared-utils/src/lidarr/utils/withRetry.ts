import { isTransientError } from './isTransientError';

/**
 * Perform an HTTP request, retrying a transient failure (503, network) up to `retries` times.
 * Each retry waits twice as long as the one before: retryDelay, 2x, 4x...
 */
export async function withRetry<T>(fn: () => Promise<T>, retryDelay: number = 2000, retries: number = 1) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (error) {
            // Same test the callers use to decide a failure is not an answer
            if (attempt >= retries || !isTransientError(error))
                throw error;

            await new Promise(resolve => { setTimeout(resolve, retryDelay * 2 ** attempt) });
        }
    }
}
