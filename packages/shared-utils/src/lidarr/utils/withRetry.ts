import { isTransientError } from './isTransientError';

/**
 * Helper to perform HTTP request with one retry attempt
 * Handles transient errors like 503 (Service Unavailable) and network issues
 */
export async function withRetry<T>(fn: () => Promise<T>, retryDelay: number = 2000) {
    try {
        return await fn();
    } catch (error) {
        // Same test the callers use to decide a failure is not an answer
        const isRetryable = isTransientError(error);

        if (isRetryable) {
            await new Promise(resolve => { setTimeout(resolve, retryDelay) });

            return fn(); // One retry attempt
        }

        throw error;
    }
}
