import { musicBrainzGet } from '../lidarr/utils/musicBrainzGet';

type ReleaseBrowseResponse = {
    releases?: { id: string; status?: string | null }[];
};

/**
 * A release group's releases when none has a status (which Lidarr's metadata leaves out), else [];
 * undefined when MusicBrainz could not be asked. One release with a status means the usual metadata lag instead.
 */
export async function getReleasesWithoutStatus(releaseGroupId: string): Promise<string[] | undefined> {
    try {
        const url = `https://musicbrainz.org/ws/2/release?release-group=${encodeURIComponent(releaseGroupId)}&fmt=json&limit=100`;
        const { data } = await musicBrainzGet<ReleaseBrowseResponse>(url);
        const releases = data?.releases ?? [];

        if (releases.length === 0 || releases.some(release => !!release.status))
            return [];

        return releases.map(release => release.id);
    } catch {
        return undefined;
    }
}
