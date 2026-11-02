const STORAGE_KEY = 'catRatGame.highScores';
const MAX_ENTRIES = 8;

function readAll() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

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
    return readAll()
        .filter((e) => typeof e.timeSeconds === 'number' && e.timeSeconds >= 0)
        .sort(compareScores)
        .slice(0, MAX_ENTRIES);
}

/**
 * @param {{ timeSeconds: number, livesLeft: number, catLabel?: string }} entry
 * @returns {number|null} 1-based rank if it made the board, else null
 */
export function addHighScore(entry) {
    const record = {
        timeSeconds: entry.timeSeconds,
        livesLeft: entry.livesLeft ?? 0,
        catLabel: entry.catLabel ?? 'Cat',
        savedAt: Date.now()
    };
    const merged = [...getHighScores(), record].sort(compareScores).slice(0, MAX_ENTRIES);
    writeAll(merged);
    const rank = merged.findIndex((e) => e.savedAt === record.savedAt);
    return rank >= 0 ? rank + 1 : null;
}

export function renderHighScoresHtml(scores = getHighScores()) {
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

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
