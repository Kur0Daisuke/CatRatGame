const MAX_ENTRIES = 8;
const MIN_TIME_SECONDS = 3;
const MAX_TIME_SECONDS = 3600;
const MAX_CAT_LABEL_LEN = 64;

export type LeaderboardEntry = {
    timeSeconds: number;
    livesLeft: number;
    catLabel: string;
};

export type LeaderboardRow = LeaderboardEntry & {
    id: number;
    savedAt: string;
};

export function validateScoreBody(body: unknown): LeaderboardEntry | { error: string } {
    if (!body || typeof body !== 'object') {
        return { error: 'Invalid JSON body' };
    }
    const { timeSeconds, livesLeft, catLabel } = body as Record<string, unknown>;

    if (typeof timeSeconds !== 'number' || !Number.isFinite(timeSeconds)) {
        return { error: 'timeSeconds must be a finite number' };
    }
    if (timeSeconds < MIN_TIME_SECONDS || timeSeconds >= MAX_TIME_SECONDS) {
        return { error: `timeSeconds must be between ${MIN_TIME_SECONDS} and ${MAX_TIME_SECONDS}` };
    }

    if (typeof livesLeft !== 'number' || !Number.isInteger(livesLeft)) {
        return { error: 'livesLeft must be an integer' };
    }
    if (livesLeft < 0 || livesLeft > 9) {
        return { error: 'livesLeft must be between 0 and 9' };
    }

    let label = typeof catLabel === 'string' ? catLabel.trim() : 'Cat';
    if (!label) label = 'Cat';
    if (label.length > MAX_CAT_LABEL_LEN) {
        label = label.slice(0, MAX_CAT_LABEL_LEN);
    }

    return { timeSeconds, livesLeft, catLabel: label };
}

export function compareScores(a: LeaderboardEntry, b: LeaderboardEntry): number {
    if (a.timeSeconds !== b.timeSeconds) return a.timeSeconds - b.timeSeconds;
    return (b.livesLeft ?? 0) - (a.livesLeft ?? 0);
}

export function rankInTopList(
    top: Array<{ id: number; timeSeconds: number; livesLeft: number }>,
    insertedId: number
): number | null {
    const idx = top.findIndex((row) => row.id === insertedId);
    return idx >= 0 ? idx + 1 : null;
}

export { MAX_ENTRIES };
