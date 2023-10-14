import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { error as skError } from '@sveltejs/kit';
import oauthUrl from '../../lib/oauthUrl';
import serverId from '../../lib/serverId';

export const load: PageServerLoad = async ({ url }) => {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (error !== null && errorDescription !== null) throw skError(403, { message: errorDescription.replaceAll('+', ' '), });

    const token = await fetchToken(code);

    return {
        servers: await fetchGuilds(token),
        serverProfile: await fetchProfile(token)
    }
};

async function fetchToken(code: string | null) {
    const DISCORD_ID = env.DISCORD_ID;
    const DISCORD_SECRET = env.DISCORD_SECRET;

    try {
        const res = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                'grant_type': 'authorization_code',
                'code': code ?? '',
                'redirect_uri': oauthUrl
            }),
            headers: new Headers({
                'Authorization': 'Basic ' + btoa(`${DISCORD_ID}:${DISCORD_SECRET}`),
                'Content-Type': 'application/x-www-form-urlencoded'
            }),
        });

        const json = await res.json() as { error: string } | { access_token: string, token_type: "Bearer", expires_in: number, refresh_token: string, scope: string };
        if ('error' in json)
            throw skError(res.status, { message: json.error });
        else if (!res.ok)
            throw skError(res.status, { message: 'Unknown error' });

        return json.access_token;

    } catch (e) {
        throw skError(500, { message: "Error during OAuth2 token exchange: " + e });
    }
}

async function fetchGuilds(token: string) {
    const url = 'https://discord.com/api/users/@me/guilds';

    const res = await fetch(url, {
        method: 'GET',
        headers: new Headers({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }),
    })

    return res.json();
}

async function fetchProfile(token: string) {
    const url = `https://discord.com/api/users/@me/guilds/${serverId}/member`;

    const res = await fetch(url, {
        method: 'GET',
        headers: new Headers({
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }),
    })

    return res.json();
}