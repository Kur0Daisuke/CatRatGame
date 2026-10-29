const listeners = new Set();

export const debugSettings = {
    showWireframes: false
};

export function setWireframesVisible(visible) {
    debugSettings.showWireframes = visible;
    listeners.forEach((fn) => fn(visible));
}

export function onWireframesChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
