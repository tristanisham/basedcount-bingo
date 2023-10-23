import type { Actions, PageServerLoad } from './$types';
import type { Box } from '$lib/bingo';
import type postgres from 'postgres';
import { checkBingo } from './bingo';
import { sendBoxAnnouncement } from './discord';
import type { User } from '$lib/user';

export const load: PageServerLoad = async ({ parent, locals }) => {
    const { sql } = locals;
    const data = await parent();

    //Pulls the most recent card for the user with the provided token
    const ownCard = await sql`
        SELECT id, text, about_discord_id, checked
        FROM v_box_in_card
        WHERE token=${data.token ?? ''}
        ORDER BY position ASC;
    ` as BoxCheckable[];

    ownCard.splice(12, 0, { about_discord_id: null, id: NaN, text: 'image:/kekw.png', creator_discord_id: '', checked: true });

    return {
        users: data.users,
        token: data.token,
        cards: ownCard
    };
};

export const actions = {
    check: async ({ request, locals }) => {
        const { sql } = locals;

        const formData = await request.formData();
        const token = formData.get('token');
        const boxId = formData.get('box');
        const url = formData.get('url');
        const valueField = formData.get('value') ?? { toString: () => '' };
        const value = valueField.toString() === 'true' ? true : false;

        if (token === null || boxId === null) return;
        if (Number.isNaN(Number.parseInt(boxId.toString()))) return; //KEKW can't be unchecked

        const tokenStr = token.toString();
        const boxIdStr = boxId.toString();
        const urlStr = url === null ? null : url.toString();
        if (value) {
            if (urlStr === null) return; //Ticking a box requires a URL to be specified

            await sql`
                INSERT INTO checks (discord_user_discord_id, box_id, card_owner_discord_id, card_round_number, time, url)
                SELECT discord_id, ${boxIdStr}, discord_id, (SELECT MAX(id) FROM round), NOW(), ${urlStr}
                FROM discord_user
                WHERE token=${tokenStr}
            `;

            const box = (await sql`
                SELECT *
                FROM box
                WHERE id=${boxIdStr}
            `)[0] as Box;

            const user = (await sql`
                SELECT *
                FROM discord_user
                WHERE token=${tokenStr}
            `)[0] as User;

            await sendBoxAnnouncement(box, urlStr, user.discord_id, user.image as string, user.name);
        } else {
            await sql`
                DELETE FROM checks
                WHERE discord_user_discord_id = (SELECT discord_id FROM discord_user WHERE token=${tokenStr})
                AND box_id=${boxIdStr}
                AND card_owner_discord_id = (SELECT discord_id FROM discord_user WHERE token=${tokenStr})
                AND card_round_number=(SELECT MAX(id) FROM round);
            `;
        }
        
        await checkBingo(sql, tokenStr);
    },
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
    await sql`
        DO $$
            DECLARE
            user_record discord_user%ROWTYPE;
            new_round_number INTEGER;
            BEGIN
            INSERT INTO round DEFAULT VALUES;
            
            SELECT MAX(id) INTO new_round_number FROM round;
            
            FOR user_record IN SELECT * FROM discord_user
            LOOP      
                INSERT INTO card (owner_discord_id, round_number)
                VALUES (user_record.discord_id, new_round_number);
                
                INSERT INTO box_in_card (box_id, card_owner_discord_id, card_round_number)
                SELECT id, user_record.discord_id, new_round_number
                FROM box
                WHERE about_discord_id IS DISTINCT FROM user_record.discord_id
                ORDER BY RANDOM()
                LIMIT 24;
            END LOOP;
        END $$;
    `;
}

export interface BoxCheckable extends Box {
    checked: boolean;
}