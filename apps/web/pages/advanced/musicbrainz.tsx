import Logo from "@/components/Logo";
import SpotifyNavigation from "@/components/SpotifyNavigation";
import UnmappedAlbums from "@/components/UnmappedAlbums";
import MainLayout from "@/layouts/MainLayout";
import { Container, Paper, Typography } from '@mui/material';
import { NextPage } from "next";
import Head from "next/head";

const Page: NextPage = () => {
    return (
        <>
            <Head>
                <title>
                    Not in MusicBrainz - Spotify to Plex
                </title>
            </Head>
            <MainLayout maxWidth="700px">
                <Container>
                    <Logo />
                    <SpotifyNavigation />
                    <Paper elevation={0} sx={{ p: 2, bgcolor: 'action.hover' }}>
                        <Typography variant="h4" sx={{ mt: 2, mb: 0.5 }}>Not in MusicBrainz</Typography>
                        <Typography variant="body1" sx={{ mb: 2, maxWidth: 560 }}>
                            Missing albums Lidarr cannot add because MusicBrainz has no entry for them. Import one with Harmony,
                            then give it 2-3 hours: Lidarr only sees a new MusicBrainz entry once its metadata server picks it up.
                            Until then the album shows as waiting for Lidarr; the next sync, or a retry, sends it.
                            An album marked &quot;No release status&quot; is in MusicBrainz, but Lidarr skips releases with no
                            status: set it on each release, then allow the same 2-3 hours.
                        </Typography>
                        <UnmappedAlbums />
                    </Paper>
                </Container>
            </MainLayout>
        </>
    );
};

export default Page;
