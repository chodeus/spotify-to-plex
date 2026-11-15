/* eslint-disable @eslint-react/no-missing-component-display-name */
import { errorBoundary } from "@/helpers/errors/errorBoundary";
import { GetSpotifyTrackByIdResponse } from "@/pages/api/spotify/tracks/[id]";
import { CheckCircle, Close, Block } from "@mui/icons-material";
import { Box, CircularProgress, Divider, Typography } from "@mui/material";
import type { PlexTrack } from "@spotify-to-plex/plex-music-search/types/PlexTrack";
import type { SearchQuery, SearchResponse } from "@spotify-to-plex/plex-music-search/types/SearchResponse";
import axios from "axios";
import { forwardRef, Fragment, useCallback, useImperativeHandle, useState } from "react";

type TrackAnalyzerHandles = {
    readonly analyze: (trackId: string, type: 'plex' | 'tidal' | 'slskd') => void
}

function getRoundedSimilarity(value: number) {
    return `${Math.round(value * 100)}%`
}

type MatchScoreProps = {
    readonly label: string;
    readonly score: NonNullable<PlexTrack["matching"]>["title"];
}

function MatchScore(props: MatchScoreProps) {
    const { label, score } = props;

    return (
        <Box sx={{ width: "160px" }}>
            <Typography variant="body1"><strong>{label}</strong></Typography>
            <Typography variant="body2">Match: {score.match ? "Yes" : "No"}</Typography>
            <Typography variant="body2">Contains: {score.contains ? "Yes" : "No"}</Typography>
            <Typography variant="body2">Similarity: {getRoundedSimilarity(score.similarity)}</Typography>
        </Box>
    );
}

const TrackAnalyzer = forwardRef<TrackAnalyzerHandles, unknown>((_props, ref) => {

    const [loading, setLoading] = useState(false)
    const [trackLoading, setTrackLoading] = useState(false)
    const [track, setTrack] = useState<GetSpotifyTrackByIdResponse>()
    const [searchResponse, setSearchResponse] = useState<SearchResponse & { allowedExtensions?: string[] }>()

    useImperativeHandle(ref, () => ({
        analyze: (trackId: string, type: 'plex' | 'tidal' | 'slskd') => {
            analyzeTrack(trackId, type)
        }
    }))

    const analyzeTrack = useCallback((trackId: string, type: 'plex' | 'tidal' | 'slskd') => {

        errorBoundary(async () => {
            setTrackLoading(true)
            setLoading(true)

            setTrack(undefined)
            setSearchResponse(undefined)

            // First load the Spotify track data
            const trackResult = await axios.get<GetSpotifyTrackByIdResponse>(`/api/spotify/tracks/${trackId}`)
            setTrack(trackResult.data)
            setTrackLoading(false)

            // Then analyze with the specified service
            let analyzeEndpoint: string;
            if (type === 'plex') {
                analyzeEndpoint = '/api/plex/analyze';
            } else if (type === 'tidal') {
                analyzeEndpoint = '/api/tidal/analyze';
            } else {
                analyzeEndpoint = '/api/slskd/analyze';
            }

            const analyzeResult = await axios.post(analyzeEndpoint, {
                item: trackResult.data
            })

            setSearchResponse(analyzeResult.data)
            setLoading(false)
        }, () => {
            setTrackLoading(false)
            setLoading(false)
        })
    }, [])

    // Check if a file extension is in the allowed list
    const isExtensionAllowed = (filename: string, allowedExtensions?: string[]) => {
        if (!allowedExtensions || allowedExtensions.length === 0) return true;

        const ext = filename.split('.').pop()
            ?.toLowerCase() || '';
        const normalizedAllowed = allowedExtensions.map(e => e.toLowerCase().replace(/^\./, ''));

        return normalizedAllowed.includes(ext);
    }

    return (
        <Box>
            {Boolean(trackLoading || loading) && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 5 }}>
                    <CircularProgress />
                </Box>
            )}

            {Boolean(!trackLoading && !loading && track && searchResponse) && (
                <>
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle1" sx={{ mb: 1 }}>
                            Track Being Searched
                        </Typography>
                        <Divider sx={{ mt: 1, mb: 2 }} />
                        <Typography
                            variant="body1"
                            sx={{
                                mb: 1
                            }}>
                            <strong>{track?.title}</strong>
                        </Typography>
                        <Box sx={{ flex: 1, display: 'flex' }}>
                            <Typography variant="body2" sx={{ width: '60px' }}>
                                <strong>Artists</strong>
                            </Typography>
                            <Typography variant="body2" sx={{ flex: 1 }}>
                                {track?.artists.join(', ')}
                            </Typography>
                        </Box>
                        <Box sx={{ flex: 1, display: 'flex' }}>
                            <Typography variant="body2" sx={{ width: '60px' }}>
                                <strong>Album</strong>
                            </Typography>
                            <Typography variant="body2" sx={{ flex: 1 }}>
                                {track?.album}
                            </Typography>
                        </Box>
                        {track?.duration_ms ? <Box sx={{ flex: 1, display: 'flex' }}>
                            <Typography variant="body2" sx={{ width: '60px' }}>
                                <strong>Duration</strong>
                            </Typography>
                            <Typography variant="body2" sx={{ flex: 1 }}>
                                {Math.floor(track.duration_ms / 60_000)}:{String(Math.floor((track.duration_ms % 60_000) / 1000)).padStart(2, '0')}
                            </Typography>
                        </Box> : null}
                    </Box>

                    <Divider sx={{ mt: 1 }} />

                    {searchResponse?.queries?.map((query: SearchQuery, index: number) => {

                        const prevApproach = searchResponse?.queries?.[index - 1]?.approach;
                        const isNewSection = prevApproach !== query.approach;

                        const results = query.result || [];

                        return (
                            <Fragment key={`query-${index}`}>

                                {!!isNewSection &&
                                    <Typography
                                        variant="body1"
                                        sx={{
                                            mb: 1,
                                            mt: 3
                                        }}>
                                        Search Approach: <strong>{query.approach}</strong>
                                    </Typography>
                                }
                                <Box sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }} >
                                    <Typography variant="h6" sx={{ mb: 1, fontSize: "1.2em" }}>{query.title}</Typography>
                                    <Box sx={{ flex: 1, display: 'flex' }}>
                                        <Typography variant="body2" sx={{ width: '60px' }}>
                                            <strong>Artist</strong>
                                        </Typography>
                                        <Typography variant="body2" sx={{ flex: 1 }}>
                                            {query.artist}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ flex: 1, display: 'flex' }}>
                                        <Typography variant="body2" sx={{ width: '60px' }}>
                                            <strong>Album</strong>
                                        </Typography>
                                        <Typography variant="body2" sx={{ flex: 1 }}>
                                            {query.album}
                                        </Typography>
                                    </Box>
                                </Box>

                                {results.length > 0 &&
                                    <Box sx={{ mb: 1, p: 1, ml: 4 }} >

                                        {results.map((result: PlexTrack) => {

                                            const { id: resultId, title, artist, album, src, matching, duration_ms: resultDuration } = result;

                                            if (!matching)
                                                return null;

                                            const { isMatchingApproach, title: titleScore, artist: artistScore, artistInTitle, artistWithTitle, album: albumScore, duration: durationScore } = matching;
                                            const extensionAllowed = isExtensionAllowed(src || '', searchResponse?.allowedExtensions);

                                            // Determine icon: Block if extension not allowed, otherwise check/close based on match
                                            const getStatusIcon = () => {
                                                if (!extensionAllowed) {
                                                    return <Block sx={{ fontSize: "1.2em", color: "error.main" }} titleAccess="Extension not in allowed list" />;
                                                }

                                                if (isMatchingApproach) {
                                                    return <CheckCircle sx={{ fontSize: "1.2em", color: "success.main" }} />;
                                                }

                                                return <Close sx={{ fontSize: "1.2em", color: "error.main" }} />;
                                            };

                                            return <Box key={`result-${resultId}`} sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }} >
                                                <Box >
                                                    <Typography variant="h6" sx={{ mb: 1, fontSize: "1.2em", display: "flex", alignItems: "center", gap: 1 }} >
                                                        {getStatusIcon()}
                                                        {title}
                                                        {!extensionAllowed && (
                                                            <Typography component="span" sx={{ fontSize: "0.7em", color: "error.main", ml: 1 }}>
                                                                (extension not allowed)
                                                            </Typography>
                                                        )}
                                                    </Typography>
                                                    <Box sx={{ flex: 1, display: 'flex' }}>
                                                        <Typography variant="body2" sx={{ width: '60px' }}>
                                                            <strong>Artists</strong>
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ flex: 1 }}>
                                                            {artist?.title || ''}
                                                        </Typography>
                                                    </Box>
                                                    {!!album &&
                                                        <Box sx={{ flex: 1, display: 'flex' }}>
                                                            <Typography variant="body2" sx={{ width: '60px' }}>
                                                                <strong>Album</strong>
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ flex: 1 }}>
                                                                {album?.title || ''}
                                                            </Typography>
                                                        </Box>
                                                    }
                                                    {!!src &&
                                                        <Box sx={{ flex: 1, display: 'flex' }}>
                                                            <Typography variant="body2" sx={{ width: '60px' }}>
                                                                <strong>File</strong>
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ flex: 1, wordBreak: 'break-all', fontSize: '0.75rem', color: 'text.secondary' }}>
                                                                {src}
                                                            </Typography>
                                                        </Box>
                                                    }
                                                    {resultDuration ? <Box sx={{ flex: 1, display: 'flex' }}>
                                                        <Typography variant="body2" sx={{ width: '60px' }}>
                                                            <strong>Duration</strong>
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ flex: 1 }}>
                                                            {Math.floor(resultDuration / 60_000)}:{String(Math.floor((resultDuration % 60_000) / 1000)).padStart(2, '0')}
                                                        </Typography>
                                                    </Box> : null}
                                                </Box>
                                                <Divider sx={{ mt: 1, mb: 1, borderColor: "black" }} />
                                                <Box sx={{ display: 'flex', mt: 1 }}>
                                                    <MatchScore label="Title" score={titleScore} />
                                                    <MatchScore label="Artist" score={artistScore} />
                                                    <MatchScore label="Artist in Title" score={artistInTitle} />
                                                    <MatchScore label="Artist with Title" score={artistWithTitle} />
                                                    <MatchScore label="Album" score={albumScore} />
                                                    {durationScore ? <Box sx={{ width: "160px" }}>
                                                        <Typography variant="body1"><strong>Duration</strong></Typography>
                                                        <Typography variant="body2">Available: {durationScore.available ? "Yes" : "No"}</Typography>
                                                        <Typography variant="body2">Similarity: {durationScore.available ? getRoundedSimilarity(durationScore.similarity) : "N/A"}</Typography>
                                                    </Box> : null}
                                                </Box>
                                            </Box>
                                        })}
                                    </Box>
                                }

                            </Fragment>
                        );
                    })}
                </>
            )}
        </Box>
    );
})

export default TrackAnalyzer;