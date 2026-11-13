import { errorBoundary } from "@/helpers/errors/errorBoundary";
import { GetPlexHomeUsersResponse } from "@/pages/api/plex/home-users";
import { GetSpotifyUserResponse } from "@/pages/api/spotify/users";
import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, CircularProgress, Divider, FormControl, FormLabel, IconButton, MenuItem, Modal, Select, SelectChangeEvent, Switch, TextField, Typography } from "@mui/material";
import axios from "axios";
import { enqueueSnackbar } from "notistack";
import { ChangeEvent, useCallback, useEffect, useState } from "react";

type Props = {
    readonly onClose: (reload?: boolean) => void
    readonly user: GetSpotifyUserResponse
}

export default function UserSyncSettings(props: Props) {
    const { user, onClose } = props;
    const [recentContext, setRecentContext] = useState(false);
    const [autoSync, setAutoSync] = useState(false);
    const [label, setLabel] = useState('')
    const [loading] = useState(false);
    // '' is the Plex owner's account
    const [plexHomeUser, setPlexHomeUser] = useState('')
    const [homeUsers, setHomeUsers] = useState<GetPlexHomeUsersResponse | null>(null)
    const [homeUsersFailed, setHomeUsersFailed] = useState(false)

    //////////////////////////////
    // Making changes
    //////////////////////////////
    const onLabelChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        setLabel(e.target.value)
    }, [])

    const onPlexHomeUserChange = useCallback((e: SelectChangeEvent) => {
        setPlexHomeUser(e.target.value)
    }, [])

    const onSwitchChange = useCallback((id: string) => (e: ChangeEvent<HTMLInputElement>) => {
        switch (id) {
            case "autosync":
                setAutoSync(e.target.checked)
                break;
            case "recent-context":
                setRecentContext(e.target.checked)
                break;
        }
    }, [])

    const onSaveChangesClick = useCallback(() => {

        errorBoundary(async () => {
            if (!user)
                return;

            await axios.put(`/api/spotify/users/`, {
                id: user.id,
                sync: autoSync,
                label,
                recent_context: recentContext,
                // Only when changed: checking it needs plex.tv, which must not block saving the rest
                ...((user.plex_home_user?.uuid || '') === plexHomeUser ? {} : { plex_home_user: plexHomeUser || null })
            })

            enqueueSnackbar(`[${user.name}] Changes saved`)


            onClose(true)
        })

    }, [user, autoSync, label, recentContext, plexHomeUser, onClose])

    //////////////////////////////
    // Close dialog
    //////////////////////////////
    const handleClose = useCallback((_e: unknown, reason: string) => {
        if (reason === 'closeClick')

            onClose()
    }, [onClose])

    const handleCloseClick = useCallback((e: React.MouseEvent) => {
        handleClose(e, 'closeClick')
    }, [handleClose])

    /////////////////////////////////////
    // Load item data
    /////////////////////////////////////
    useEffect(() => {

        setAutoSync(!!user.sync)
        setRecentContext(!!user.recentContext)
        setLabel(user.label || "")
        setPlexHomeUser(user.plex_home_user?.uuid || '')
    }, [user])

    useEffect(() => {
        const controller = new AbortController()
        errorBoundary(async () => {
            const result = await axios.get<GetPlexHomeUsersResponse>('/api/plex/home-users', { signal: controller.signal })
            setHomeUsers(result.data)
        }, () => {
            if (controller.signal.aborted)
                return

            setHomeUsers([])
            setHomeUsersFailed(true)
        }, true)

        return () => controller.abort()
    }, [])

    const hasChanges = (
        (user.label || "") !== label ||
        !!(Boolean(user?.sync) !== autoSync) ||
        !!(Boolean(user?.recentContext) !== recentContext) ||
        (user.plex_home_user?.uuid || '') !== plexHomeUser
    )

    return (<Modal open onClose={handleClose}>
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: 500, bgcolor: 'background.paper', p: 3, borderRadius: 1 }}>
            <IconButton size="small" onClick={handleCloseClick} sx={{ position: 'absolute', right: 8, top: 8 }}>
                <CloseIcon fontSize="small" />
            </IconButton>
            {!!loading && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 5 }}>
                <CircularProgress />
            </Box>}

            {!loading && <>
                <Typography variant="h6">Sync settings</Typography>
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body1">
                        Below you find the settings for the selected items.
                    </Typography>
                </Box>

                <FormControl sx={{ mb: 2 }}>
                    <FormLabel component="legend">Automatic sync</FormLabel>
                    <Typography variant="body2">
                        When enabled, this item will be synced automatically.
                    </Typography>
                    <Switch checked={autoSync} onChange={onSwitchChange('autosync')} color="success" />
                </FormControl>

                {!!autoSync && <>
                    <FormControl sx={{ mb: 2 }}>
                        <FormLabel component="legend">Label</FormLabel>
                        <Typography variant="body2">
                            Created playlists will get this label
                        </Typography>
                        <TextField size="small" value={label} onChange={onLabelChange} />
                    </FormControl>

                    <FormControl sx={{ mb: 2 }}>
                        <FormLabel component="legend">Recently played</FormLabel>
                        <Typography variant="body2">
                            Automatically sync playlists and albums of recently played items.
                        </Typography>
                        <Switch checked={recentContext} onChange={onSwitchChange('recent-context')} color="success"  />
                    </FormControl>
                </>
                }

                <FormControl sx={{ mb: 2 }}>
                    <FormLabel component="legend">Plex user</FormLabel>
                    <Typography variant="body2">
                        Playlists for items added from this user&apos;s library or recently played are made in this Plex Home user&apos;s account. After a change, the next sync or Update makes new copies there; the old ones stay where they are.
                    </Typography>
                    <Select size="small" value={plexHomeUser} onChange={onPlexHomeUserChange} disabled={!homeUsers} displayEmpty>
                        <MenuItem value="">
                            Plex owner (default)
                        </MenuItem>
                        {!!user.plex_home_user && !homeUsers?.some(item => item.uuid === user.plex_home_user?.uuid) &&
                            <MenuItem value={user.plex_home_user.uuid}>{user.plex_home_user.title}</MenuItem>}
                        {homeUsers?.filter(item => !item.admin).map(item => (
                            <MenuItem key={item.uuid} value={item.uuid} disabled={!item.pickable}>
                                {item.title}{item.protected ? ' (PIN not supported)' : ''}
                            </MenuItem>
                        ))}
                    </Select>
                    {!!homeUsersFailed && <Typography variant="body2" color="error">
                        Plex Home users could not be loaded.
                    </Typography>}
                </FormControl>

                <Divider sx={{ mt: 1, mb: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="contained" disabled={!hasChanges} onClick={onSaveChangesClick}>Save changes</Button>
                </Box>
            </>}
        </Box>
    </Modal>)
}