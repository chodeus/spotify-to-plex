import { errorBoundary } from "@/helpers/errors/errorBoundary";
import { OpenInNew, Refresh, Search, Visibility, VisibilityOff } from "@mui/icons-material";
import { Alert, Box, Button, Chip, CircularProgress, FormControlLabel, IconButton, Link, Stack, Switch, Tooltip, Typography } from "@mui/material";
import type { UnmappedAlbum } from "@spotify-to-plex/shared-types/lidarr/UnmappedAlbum";
import { harmonyImportUrl, musicBrainzSearchUrl } from "@spotify-to-plex/shared-utils/musicbrainz/importLinks";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import type { GetUnmappedAlbumsResponse } from "../../pages/api/lidarr/unmapped";
import BMoment from "./BMoment";

type RetryResult = { success: boolean; message: string };

type RowProps = {
    readonly album: UnmappedAlbum;
    readonly busy: boolean;
    readonly result?: RetryResult;
    readonly onRetry: (album: UnmappedAlbum) => void;
    readonly onDismiss: (album: UnmappedAlbum) => void;
};

function UnmappedAlbumRow(props: RowProps) {
    const { album, busy, result, onRetry, onDismiss } = props;
    const harmony = harmonyImportUrl(album.spotify_album_id);

    const handleRetry = useCallback(() => {
        onRetry(album);
    }, [album, onRetry]);

    const handleDismiss = useCallback(() => {
        onDismiss(album);
    }, [album, onDismiss]);

    return (
        <Box sx={{ py: 1, px: 1.5, mb: 0.5, borderRadius: 1, bgcolor: 'action.hover', opacity: album.dismissed ? 0.6 : 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {album.artist_name} - {album.album_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        First seen <BMoment date={album.first_seen} format="D MMM YYYY" />
                        {' · '}checked <BMoment date={album.last_checked} variant="from-now" />
                        {album.attempts > 1 && ` · ${album.attempts} checks`}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
                    {!!harmony && (
                        <Button
                            size="small"
                            variant="contained"
                            component={Link}
                            href={harmony}
                            target="_blank"
                            rel="noopener noreferrer"
                            endIcon={<OpenInNew fontSize="small" />}
                        >
                            Import with Harmony
                        </Button>
                    )}
                    <Tooltip title="Search MusicBrainz first, in case it is already there under another name">
                        <IconButton size="small" component={Link} href={musicBrainzSearchUrl(album.artist_name, album.album_name)} target="_blank" rel="noopener noreferrer">
                            <Search fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Check MusicBrainz again and send to Lidarr if found">
                        <span>
                            <IconButton size="small" disabled={busy} onClick={handleRetry}>
                                {busy ? <CircularProgress size={18} /> : <Refresh fontSize="small" />}
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title={album.dismissed ? 'Restore' : 'Dismiss: not importing this one'}>
                        <span>
                            <IconButton size="small" disabled={busy} onClick={handleDismiss}>
                                {album.dismissed ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>
            </Stack>
            {!!result && (
                <Chip size="small" sx={{ mt: 0.75 }} color={result.success ? 'success' : 'warning'} label={result.message} />
            )}
        </Box>
    );
}

export default function UnmappedAlbums() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<GetUnmappedAlbumsResponse | null>(null);
    const [showDismissed, setShowDismissed] = useState(false);
    const [busy, setBusy] = useState<Set<string>>(() => new Set());
    const [results, setResults] = useState<Map<string, RetryResult>>(() => new Map());

    const fetchAlbums = useCallback(async () => {
        await errorBoundary(async () => {
            const result = await axios.get<GetUnmappedAlbumsResponse>('/api/lidarr/unmapped', { params: showDismissed ? { all: 1 } : {} });
            setData(result.data);
            setLoading(false);
        });
    }, [showDismissed]);

    useEffect(() => {
        fetchAlbums();
    }, [fetchAlbums]);

    const setBusyFor = useCallback((id: string, on: boolean) => {
        setBusy(prev => {
            const next = new Set(prev);
            if (on)
                next.add(id);
            else
                next.delete(id);

            return next;
        });
    }, []);

    const retry = useCallback(async (album: UnmappedAlbum) => {
        setBusyFor(album.spotify_album_id, true);
        try {
            // send-album answers a miss with 404 and a message; show it on the row rather than as an error dialog
            const result = await axios.post<RetryResult>('/api/lidarr/send-album', {
                spotify_album_id: album.spotify_album_id,
                artist_name: album.artist_name,
                album_name: album.album_name
            }, { validateStatus: () => true });
            const body = result.data ?? { success: false, message: `HTTP ${result.status}` };
            setResults(prev => new Map(prev).set(album.spotify_album_id, { success: !!body.success, message: body.message }));
            await fetchAlbums();
        } finally {
            setBusyFor(album.spotify_album_id, false);
        }
    }, [fetchAlbums, setBusyFor]);

    const dismiss = useCallback(async (album: UnmappedAlbum) => {
        setBusyFor(album.spotify_album_id, true);
        await errorBoundary(async () => {
            await axios.patch('/api/lidarr/unmapped', { spotify_album_id: album.spotify_album_id, dismissed: !album.dismissed });
            await fetchAlbums();
        });
        setBusyFor(album.spotify_album_id, false);
    }, [fetchAlbums, setBusyFor]);

    const onRetry = useCallback((album: UnmappedAlbum) => {
        retry(album);
    }, [retry]);

    const onDismiss = useCallback((album: UnmappedAlbum) => {
        dismiss(album);
    }, [dismiss]);

    const onReload = useCallback(() => {
        fetchAlbums();
    }, [fetchAlbums]);

    const onToggleDismissed = useCallback((_e: unknown, checked: boolean) => {
        setShowDismissed(checked);
    }, []);

    if (loading)
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>;

    const albums = data?.albums ?? [];
    const plural = albums.length === 1 ? '' : 's';
    const hiddenCount = !showDismissed && data?.dismissed ? ` (${data.dismissed} dismissed)` : '';

    return (
        <Box>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {albums.length} album{plural}{hiddenCount}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <FormControlLabel control={<Switch size="small" checked={showDismissed} onChange={onToggleDismissed} />} label={<Typography variant="body2">Show dismissed</Typography>} />
                    <Button size="small" startIcon={<Refresh />} onClick={onReload}>Reload</Button>
                </Stack>
            </Stack>

            {albums.length === 0 && (
                <Alert severity="success">
                    Every album the Lidarr sync looked up was found in MusicBrainz. Albums it cannot map are listed here after the next Lidarr sync.
                </Alert>
            )}
            {albums.map(album => (
                <UnmappedAlbumRow key={album.spotify_album_id} album={album} busy={busy.has(album.spotify_album_id)} result={results.get(album.spotify_album_id)} onRetry={onRetry} onDismiss={onDismiss} />
            ))}
        </Box>
    );
}
