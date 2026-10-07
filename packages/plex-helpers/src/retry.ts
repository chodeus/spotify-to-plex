import { AxiosResponse } from 'axios';
import { describeHttpError } from '@spotify-to-plex/http-client/describeHttpError';
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

        console.error(`Plex request failed (${describeHttpError(error)}), retrying`);

        // Wait before retry
        await createDelay(retryDelay);

        // One more attempt
        return request();
    }
}

