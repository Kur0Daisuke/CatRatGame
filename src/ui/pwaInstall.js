export function isStandalonePwa() {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        Boolean(navigator.standalone)
    );
}

function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * @param {{ onInstalled?: () => void }} [options]
 */
export function createPwaInstallPrompt(options = {}) {
    if (isStandalonePwa()) {
        return { root: null, destroy() {} };
    }

    let deferredPrompt = null;

    const root = document.createElement('div');
    root.className = 'pwa-install';
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const showIosHint = touch && isIos();

    root.innerHTML = showIosHint
        ? `
        <p class="pwa-install__label">Play as an app</p>
        <p class="pwa-install__copy">Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong> for fullscreen landscape mode.</p>
    `
        : `
        <p class="pwa-install__label">Play as an app</p>
        <p class="pwa-install__copy">Install for fullscreen landscape play without browser bars.</p>
        <button type="button" class="pwa-install__btn">Install app</button>
    `;

    if (showIosHint) {
        root.hidden = false;
        return { root, destroy() { root.remove(); } };
    }

    root.hidden = true;
    const btn = root.querySelector('.pwa-install__btn');
    const copy = root.querySelector('.pwa-install__copy');

    async function triggerInstall() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
        root.hidden = true;
        if (choice.outcome === 'accepted') options.onInstalled?.();
    }

    btn?.addEventListener('click', () => {
        void triggerInstall();
    });

    function onBeforeInstallPrompt(event) {
        event.preventDefault();
        deferredPrompt = event;
        root.hidden = false;
        if (copy) copy.textContent = 'Install for fullscreen landscape play without browser bars.';
    }

    function onInstalled() {
        deferredPrompt = null;
        root.hidden = true;
        options.onInstalled?.();
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return {
        root,
        destroy() {
            window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
            window.removeEventListener('appinstalled', onInstalled);
            root.remove();
        }
    };
}
