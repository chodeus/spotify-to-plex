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
                            then use retry to send it to Lidarr - Lidarr&apos;s metadata server can take a few days to pick up new entries.
                        </Typography>
                        <UnmappedAlbums />
                    </Paper>
                </Container>
            </MainLayout>
        </>
    );
};

export default Page;
