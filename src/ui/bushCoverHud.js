/**
 * HUD chip when the cat is latched in bush cover (player.bushCoverActive).
 */
export function createBushCoverHud() {
    const el = document.createElement('div');
    el.className = 'pounce-score hud-stat--bush';
    el.textContent = 'In bush';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');

    return {
        el,
        update(player) {
            const active = player?.isDeployed && player.bushCoverActive;
            el.hidden = !active;
            el.classList.toggle('hud-stat--bush-active', !!active);
            if (active) {
                el.setAttribute('aria-label', 'Hidden in bush');
            } else {
                el.removeAttribute('aria-label');
            }
        }
    };
}
