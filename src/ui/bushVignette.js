/**
 * Full-screen edge vignette while latched in bush cover.
 */
export function createBushVignette() {
    const el = document.createElement('div');
    el.className = 'bush-sneak-vignette';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);

    let display = 0;

    return {
        update(player, delta, active) {
            const latched = player?.bushCoverActive ?? false;
            const target = active && latched ? Math.min(1, Math.max(0, player?.bushBlend ?? 0)) : 0;
            const follow = 1 - Math.exp(-5 * delta);
            display += (target - display) * follow;

            if (!active || display < 0.012) {
                el.style.opacity = '0';
                el.style.display = 'none';
                return;
            }

            const t = display;
            const clearPct = (36 + t * 6).toFixed(1);
            const midPct = (68 + t * 4).toFixed(1);
            const edgeAlpha = (0.32 + t * 0.58).toFixed(3);
            const midAlpha = (0.1 + t * 0.22).toFixed(3);

            el.style.display = 'block';
            el.style.opacity = (0.68 + t * 0.32).toFixed(3);
            el.style.background = `radial-gradient(
                circle at 50% 44%,
                transparent 0%,
                transparent ${clearPct}%,
                rgba(0, 16, 10, ${midAlpha}) ${midPct}%,
                rgba(0, 0, 0, ${edgeAlpha}) 100%
            )`;
        }
    };
}
