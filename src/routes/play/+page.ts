import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import type User from '$lib/userType';

export const load: PageLoad = async ({ parent, fetch }) => {
    const id = (await parent()).id;

    let user: User | null | { error: string } = null;
    if (browser) {
        const res = await fetch('/api/me', {
            headers: new Headers({ 'Authorization': `Bearer ${id}` }),
        });

        user = await res.json() as User | { error: string };

        if (!res.ok && 'error' in user) throw error(res.status, { message: await user.error });
    }


    return {
        user
    };
};