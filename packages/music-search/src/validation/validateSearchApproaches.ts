import { SearchApproachConfig } from '../types/SearchApproachConfig';
import { validateSearchApproach } from './validateSearchApproach';

/**
 * Validate array of search approaches; an empty list is invalid, because the sync refuses to run without one
 */
export const validateSearchApproaches = (approaches: any): approaches is SearchApproachConfig[] => {
    return Array.isArray(approaches) && approaches.length > 0 && approaches.every(validateSearchApproach);
};