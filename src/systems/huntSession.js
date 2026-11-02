import { addHighScore, formatHuntTime } from './highScores.js';

export const START_LIVES = 9;
export const RATS_TO_WIN = 30;

export function createHuntSession({ onEnd, getCatLabel }) {
    let active = false;
    let ended = false;
    let elapsed = 0;
    let lives = START_LIVES;
    let totalRats = 0;
    let ratsRemaining = 0;

    const timerEl = document.createElement('div');
    timerEl.className = 'pounce-score hud-stat--timer';
    timerEl.textContent = 'Time 0.0s';

    const livesEl = document.createElement('div');
    livesEl.className = 'pounce-score hud-stat--lives';
    livesEl.textContent = `Lives ${START_LIVES}`;

    const overlayEl = document.createElement('div');
    overlayEl.className = 'hunt-end-overlay';
    overlayEl.hidden = true;
    overlayEl.innerHTML = `
        <div class="hunt-end-card" role="dialog" aria-labelledby="hunt-end-title">
            <p class="eyebrow" id="hunt-end-eyebrow">HUNT OVER</p>
            <h2 id="hunt-end-title">Title</h2>
            <p class="hunt-end-detail"></p>
            <div class="hunt-end-actions">
                <button type="button" class="hunt-end-retry">Try again</button>
                <button type="button" class="hunt-end-menu">Main menu</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlayEl);

    const titleEl = overlayEl.querySelector('#hunt-end-title');
    const eyebrowEl = overlayEl.querySelector('#hunt-end-eyebrow');
    const detailEl = overlayEl.querySelector('.hunt-end-detail');
    const retryBtn = overlayEl.querySelector('.hunt-end-retry');
    const menuBtn = overlayEl.querySelector('.hunt-end-menu');

    let retryHandler = null;
    let menuHandler = null;

    retryBtn.addEventListener('click', () => {
        overlayEl.hidden = true;
        retryHandler?.();
    });
    menuBtn.addEventListener('click', () => {
        overlayEl.hidden = true;
        menuHandler?.();
    });

    function syncHud() {
        timerEl.textContent = `Time ${formatHuntTime(elapsed)}`;
        livesEl.textContent = `Lives ${lives}`;
    }

    function begin(total) {
        active = true;
        ended = false;
        elapsed = 0;
        lives = START_LIVES;
        totalRats = total;
        ratsRemaining = total;
        overlayEl.hidden = true;
        syncHud();
    }

    function reset() {
        active = false;
        ended = false;
        elapsed = 0;
        lives = START_LIVES;
        totalRats = 0;
        ratsRemaining = 0;
        overlayEl.hidden = true;
        syncHud();
    }

    function update(delta) {
        if (!active || ended) return;
        elapsed += delta;
        syncHud();
    }

    function ratsCaught() {
        return Math.max(0, totalRats - ratsRemaining);
    }

    function setRatsRemaining(count) {
        ratsRemaining = count;
        if (!active || ended) return;
        if (ratsCaught() >= RATS_TO_WIN) finish('win');
    }

    function loseLifeFromDog() {
        if (!active || ended) return;
        lives = Math.max(0, lives - 1);
        syncHud();
        if (lives <= 0) finish('lives');
    }

    function finish(reason) {
        if (ended) return;
        ended = true;
        active = false;
        syncHud();

        let rank = null;
        if (reason === 'win') {
            rank = addHighScore({
                timeSeconds: elapsed,
                livesLeft: lives,
                catLabel: getCatLabel?.() ?? 'Cat'
            });
            const caught = ratsCaught();
            eyebrowEl.textContent = 'YARD CLEARED';
            titleEl.textContent = `${RATS_TO_WIN} rats — hunt complete.`;
            detailEl.textContent =
                rank != null
                    ? `${caught} caught in ${formatHuntTime(elapsed)} · ${lives} lives left · Rank #${rank} on the board.`
                    : `${caught} caught in ${formatHuntTime(elapsed)} · ${lives} lives left.`;
        } else {
            eyebrowEl.textContent = 'HUNT OVER';
            titleEl.textContent = reason === 'lives' ? 'The dog got the last of your lives.' : 'Time is up.';
            const caught = ratsCaught();
            detailEl.textContent =
                reason === 'lives'
                    ? `You caught ${caught} of ${RATS_TO_WIN} needed (${totalRats} on the map) in ${formatHuntTime(elapsed)}.`
                    : `You caught ${caught} of ${RATS_TO_WIN} needed.`;
        }

        overlayEl.hidden = false;
        if (document.pointerLockElement) document.exitPointerLock();
        onEnd?.({ reason, elapsed, lives, ratsRemaining, totalRats, rank });
    }

    return {
        timerEl,
        livesEl,
        begin,
        reset,
        update,
        setRatsRemaining,
        loseLifeFromDog,
        isActive: () => active && !ended,
        isEnded: () => ended,
        getElapsed: () => elapsed,
        getLives: () => lives,
        setHandlers({ onRetry, onMenu }) {
            retryHandler = onRetry;
            menuHandler = onMenu;
        },
        hideOverlay() {
            overlayEl.hidden = true;
            ended = false;
        }
    };
}
