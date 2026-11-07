import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import {
    MAX_ENTRIES,
    compareScores,
    rankInTopList,
    validateScoreBody,
    type LeaderboardRow
} from './_shared/leaderboard';

const STORE_NAME = 'cat-rat-leaderboard';
const BLOB_KEY = 'scores';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function getLeaderboardStore() {
    return getStore({ name: STORE_NAME, consistency: 'strong' });
}

async function loadScores(): Promise<LeaderboardRow[]> {
    const store = getLeaderboardStore();
    const data = await store.get(BLOB_KEY, { type: 'json' });
    if (!Array.isArray(data)) return [];
    return data
        .filter((row) => row && typeof row.timeSeconds === 'number')
        .map((row) => ({
            id: Number(row.id) || Date.now(),
            timeSeconds: Number(row.timeSeconds),
            livesLeft: Number(row.livesLeft),
            catLabel: String(row.catLabel || 'Cat'),
            savedAt: typeof row.savedAt === 'string' ? row.savedAt : new Date().toISOString()
        }));
}

async function saveScores(scores: LeaderboardRow[]) {
    const store = getLeaderboardStore();
    await store.setJSON(BLOB_KEY, scores);
}

function topScores(scores: LeaderboardRow[]) {
    return [...scores].sort(compareScores).slice(0, MAX_ENTRIES);
}

async function handleGet() {
    try {
        const rows = topScores(await loadScores());
        return Response.json(rows, { headers: JSON_HEADERS });
    } catch (err) {
        console.error('leaderboard GET failed', err);
        return Response.json({ error: 'Failed to load leaderboard' }, { status: 500, headers: JSON_HEADERS });
    }
}

async function handlePost(req: Request) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: JSON_HEADERS });
    }

    const parsed = validateScoreBody(body);
    if ('error' in parsed) {
        return Response.json({ error: parsed.error }, { status: 400, headers: JSON_HEADERS });
    }

    try {
        const inserted: LeaderboardRow = {
            id: Date.now(),
            timeSeconds: parsed.timeSeconds,
            livesLeft: parsed.livesLeft,
            catLabel: parsed.catLabel,
            savedAt: new Date().toISOString()
        };

        const merged = topScores([...(await loadScores()), inserted]);
        await saveScores(merged);

        const rank = rankInTopList(merged, inserted.id);

        return Response.json(
            {
                rank,
                scores: merged
            },
            { status: 201, headers: JSON_HEADERS }
        );
    } catch (err) {
        console.error('leaderboard POST failed', err);
        return Response.json({ error: 'Failed to save score' }, { status: 500, headers: JSON_HEADERS });
    }
}

export default async function handler(req: Request, _context: Context) {
    if (req.method === 'GET') return handleGet();
    if (req.method === 'POST') return handlePost(req);
    return new Response('Method not allowed', { status: 405 });
}

export const config: Config = {
    path: '/api/leaderboard',
    method: ['GET', 'POST']
};
