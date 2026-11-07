import { prefersTouchControls } from './touchControls.js';
import { isStandalonePwa } from './pwaInstall.js';

function isPortrait() {
    const type = screen.orientation?.type;
    if (type) return type.startsWith('portrait');
    return window.matchMedia('(orientation: portrait)').matches;
}

async function requestFullscreen(el) {
    const target = el || document.documentElement;
    const run =
        target.requestFullscreen?.bind(target) ||
        target.webkitRequestFullscreen?.bind(target) ||
        target.webkitEnterFullscreen?.bind(target);
    if (!run || document.fullscreenElement) return;
    await run();
}

export async function requestMobilePlayMode(canvas) {
    if (!prefersTouchControls()) return;

    try {
        await requestFullscreen(canvas || document.documentElement);
    } catch {
        try {
            await requestFullscreen(document.documentElement);
        } catch {
            /* denied or unsupported */
        }
    }

    try {
        const lock = screen.orientation?.lock;
        if (typeof lock === 'function') {
            await lock.call(screen.orientation, 'landscape');
        }
    } catch {
        /* iOS / desktop — orientation gate still prompts rotate */
    }
}

export function initMobileDisplay() {
    if (!prefersTouchControls()) return null;

    document.body.classList.add('mobile-play');

    const overlay = document.createElement('div');
    overlay.className = 'mobile-orientation-gate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mobile-rotate-title');
    overlay.innerHTML = `
        <div class="mobile-orientation-gate__card">
            <p class="eyebrow">LANDSCAPE PLEASE</p>
            <h2 id="mobile-rotate-title">Rotate your phone</h2>
            <p class="mobile-orientation-gate__copy">Cat &amp; Rats plays sideways. Turn your device to landscape to continue.</p>
            <p class="mobile-orientation-gate__hint">Tip: after you tap Play, use fullscreen if your browser offers it for fewer bars.</p>
        </div>
    `;
    document.body.appendChild(overlay);

    const sync = () => {
        const portrait = isPortrait();
        overlay.hidden = !portrait;
        document.body.classList.toggle('mobile-portrait', portrait);
    };

    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.matchMedia('(orientation: portrait)').addEventListener('change', sync);
    screen.orientation?.addEventListener?.('change', sync);

    if (isStandalonePwa()) {
        window.addEventListener(
            'load',
            () => {
                void requestMobilePlayMode();
            },
            { once: true }
        );
    }

    return { sync };
}
