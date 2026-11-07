function applyVisualViewportVars() {
    const root = document.documentElement;
    const vv = window.visualViewport;
    if (vv) {
        root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
        root.style.setProperty('--vv-left', `${vv.offsetLeft}px`);
        root.style.setProperty('--vv-width', `${vv.width}px`);
        root.style.setProperty('--vv-height', `${vv.height}px`);
    } else {
        root.style.setProperty('--vv-top', '0px');
        root.style.setProperty('--vv-left', '0px');
        root.style.setProperty('--vv-width', '100vw');
        root.style.setProperty('--vv-height', '100dvh');
    }
}

export function refreshVisualViewportLayout() {
    applyVisualViewportVars();
}

export function bindVisualViewportLayout() {
    applyVisualViewportVars();
    window.addEventListener('resize', applyVisualViewportVars);
    window.visualViewport?.addEventListener('resize', applyVisualViewportVars);
    window.visualViewport?.addEventListener('scroll', applyVisualViewportVars);
}
