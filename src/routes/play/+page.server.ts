import type { Actions, PageServerLoad } from './$types';
import type { Box } from '$lib/bingo';
import type postgres from 'postgres';

export const load: PageServerLoad = async ({ parent, locals }) => {
    const { sql } = locals;
    const data = await parent();

    //Pulls the most recent card for the user with the provided token
    const ownCard = await sql`
        SELECT b.id, b.text, b.about_discord_id
        FROM box b
        INNER JOIN box_in_card bc ON b.id=bc.box_id
        INNER JOIN card c ON bc.card_owner_discord_id=c.owner_discord_id AND bc.card_round_number=c.round_number
        INNER JOIN discord_user u ON bc.card_owner_discord_id=u.discord_id
        WHERE c.round_number=(SELECT MAX(round_number) FROM card) AND u.token=${data.token ?? ''};
    ` as Box[];

    ownCard.splice(12, 0, { about_discord_id: null, id: NaN, text: 'image:/kekw.png', creator_discord_id: '' });

    return {
        users: data.users,
        token: data.token,
        cards: ownCard
    };
};

export const actions = {
    startNewRound: async ({ request, locals }) => {
        const { sql } = locals;

        const formData = await request.formData();
        const token = formData.get('token') ?? null;
        const winners = formData.get('winners') ?? { toString: () => '' };

        const { admin } = (await sql`
            SELECT admin
            FROM discord_user
            WHERE token=${token === null ? null : token.toString()}
            LIMIT 1
        `)[0] as { admin: boolean };

        if (admin) {
            await saveWinners(sql, winners.toString())
            await startRound(sql)
        };
    },
} satisfies Actions;

async function saveWinners(sql: postgres.Sql<Record<string, never>>, winnersStr: string) {
    if (winnersStr === '') return;
    const winners = winnersStr.split(';');

    for (const winner of winners) {
        await sql`
            INSERT INTO discord_user_wins_round (discord_user_discord_id, round_number)
            VALUES (${winner}, (SELECT MAX(id) FROM round)); 
        `
    }

}

async function startRound(sql: postgres.Sql<Record<string, never>>) {
    console.log(typeof sql)
}