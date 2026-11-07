const LEADERBOARD_URL = '/api/leaderboard';
const MAX_ENTRIES = 8;

/** @type {{ timeSeconds: number, livesLeft: number, catLabel: string, savedAt?: string, id?: number }[]} */
let cachedScores = [];
/** @type {'idle' | 'loading' | 'ready' | 'error'} */
let loadState = 'idle';
let loadError = null;

/** Lower time is better; more lives breaks ties. */
export function compareScores(a, b) {
    if (a.timeSeconds !== b.timeSeconds) return a.timeSeconds - b.timeSeconds;
    return (b.livesLeft ?? 0) - (a.livesLeft ?? 0);
}

export function formatHuntTime(seconds) {
    const total = Math.max(0, seconds);
    const mins = Math.floor(total / 60);
    const secs = Math.floor(total % 60);
    const tenths = Math.floor((total % 1) * 10);
    if (mins > 0) {
        return `${mins}:${String(secs).padStart(2, '0')}.${tenths}`;
    }
    return `${secs}.${tenths}s`;
}

export function getHighScores() {
    return cachedScores
        .filter((e) => typeof e.timeSeconds === 'number' && e.timeSeconds >= 0)
        .sort(compareScores)
        .slice(0, MAX_ENTRIES);
}

export function getLeaderboardLoadState() {
    return { state: loadState, error: loadError };
}

/**
 * @returns {Promise<typeof cachedScores>}
 */
export async function loadLeaderboard() {
    loadState = 'loading';
    loadError = null;
    try {
        const res = await fetch(LEADERBOARD_URL, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
            throw new Error('Invalid response');
        }
        cachedScores = data.map(normalizeRow);
        loadState = 'ready';
        return getHighScores();
    } catch (err) {
        loadState = 'error';
        loadError = err?.message || 'unavailable';
        cachedScores = [];
        return [];
    }
}

/**
 * @param {{ timeSeconds: number, livesLeft: number, catLabel?: string }} entry
 * @returns {Promise<{ rank: number|null, scores: ReturnType<typeof getHighScores> }>}
 */
export async function submitScore(entry) {
    const res = await fetch(LEADERBOARD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            timeSeconds: entry.timeSeconds,
            livesLeft: entry.livesLeft ?? 0,
            catLabel: entry.catLabel ?? 'Cat'
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    if (Array.isArray(data.scores)) {
        cachedScores = data.scores.map(normalizeRow);
        loadState = 'ready';
        loadError = null;
    } else {
        await loadLeaderboard();
    }
    const rank = typeof data.rank === 'number' ? data.rank : null;
    return { rank, scores: getHighScores() };
}

/** @deprecated Use submitScore — kept for any stray imports */
export async function addHighScore(entry) {
    const { rank } = await submitScore(entry);
    return rank;
}

export function renderHighScoresHtml(scores = getHighScores()) {
    if (loadState === 'loading') {
        return '<p class="high-scores-empty">Loading fastest clears…</p>';
    }
    if (loadState === 'error') {
        return '<p class="high-scores-empty">Leaderboard unavailable right now. Try again from the main menu after your next hunt.</p>';
    }
    if (!scores.length) {
        return '<p class="high-scores-empty">No clears yet. Catch 30 rats before the dog costs you all nine lives.</p>';
    }
    return `<ol class="high-scores-list">${scores
        .map(
            (row, i) =>
                `<li><span class="high-scores-rank">${String(i + 1).padStart(2, '0')}</span>` +
                `<span class="high-scores-time">${formatHuntTime(row.timeSeconds)}</span>` +
                `<span class="high-scores-meta">${row.livesLeft} lives · ${escapeHtml(row.catLabel || 'Cat')}</span></li>`
        )
        .join('')}</ol>`;
}

function normalizeRow(row) {
    return {
        id: row.id,
        timeSeconds: Number(row.timeSeconds),
        livesLeft: Number(row.livesLeft),
        catLabel: String(row.catLabel || 'Cat'),
        savedAt: row.savedAt
    };
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
