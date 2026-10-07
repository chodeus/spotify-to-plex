import { AxiosResponse } from 'axios';
import { httpStatusOf } from '@spotify-to-plex/http-client/httpStatusOf';
import { isRetryable } from '@spotify-to-plex/http-client/isRetryable';
import { RetryConfig } from './RetryConfig';
import { createDelay } from './utils/createDelay';

/**
 * Handles a single retry attempt for HTTP requests
 */
export async function handleOneRetryAttempt<T = any>(
    request: () => Promise<AxiosResponse<T>>,
    config: RetryConfig = {}
): Promise<AxiosResponse<T>> {
    const { retryDelay = 2000 } = config;

    try {
        return await request();
    } catch (error) {
        if (!isRetryable(error))
            throw error;

        // Never log the error itself: its request config carries the X-Plex-Token header
        console.error(`Plex request failed (${httpStatusOf(error) ?? (error instanceof Error ? error.message : 'no response')}), retrying`);

        // Wait before retry
        await createDelay(retryDelay);

        // One more attempt
        return request();
    }
}

