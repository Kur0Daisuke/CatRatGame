import { debugSettings, onWireframesChange, setWireframesVisible } from '../core/debugSettings.js';

export function createSettings({ rats, onChange, onRestart, onMenu }) {
    const touch = document.body.classList.contains('touch-ui');
    const controls = touch
        ? '<p>Left stick moves. Drag the garden to look.</p><p>Hold <kbd>RUN</kbd> to sprint, <kbd>SNEAK</kbd> for quiet steps</p><p><kbd>POUNCE</kbd> attacks. <kbd>TREE</kbd> climbs or hops down</p><p><kbd>TAP</kbd> in the zone for skill checks. Puddles restore stamina.</p>'
        : '<p><kbd>W A S D</kbd> Move</p><p><kbd>SHIFT</kbd> Run <kbd>C</kbd> Sneak</p><p><kbd>E</kbd> Pounce <kbd>SPACE</kbd> Skill check</p><p>Stand in puddles to restore stamina. SPACE also slips the dog.</p>';
    const help = touch
        ? 'The pause button opens this menu.'
        : 'Click the garden after resuming to capture the mouse.';
    const root = document.createElement('div');
    root.className = 'settings';
    root.hidden = true;
    root.innerHTML = `<section class="settings-panel" id="game-settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <p class="eyebrow">TAKE A BREATHER</p><h2 id="settings-title">Settings</h2>
        <label class="debug-toggle"><input type="checkbox" id="wireframe-toggle"> Show debug wireframes (rats, bush cover rings)</label>
        <div class="settings-controls">${controls}</div>
        <div class="settings-actions">
            <button class="resume-game" type="button">RESUME <span>${touch ? 'PAUSE ↗' : 'ESC ↗'}</span></button>
            <button class="settings-secondary" type="button" data-settings="restart">RESTART HUNT</button>
            <button class="settings-secondary" type="button" data-settings="menu">MAIN MENU</button>
        </div>
        <p class="settings-help">${help}</p>
    </section>`;
    document.body.appendChild(root);
    const resume = root.querySelector('button');
    let previousFocus;
    const settings = {
        get isOpen() { return !root.hidden; },
        setOpen(open) {
            if (open === settings.isOpen) return;
            root.hidden = !open;
            onChange(open);
            if (open) {
                previousFocus = document.activeElement;
                if (document.pointerLockElement) document.exitPointerLock();
                resume.focus();
            } else if (previousFocus?.isConnected) previousFocus.focus();
        }
    };
    resume.addEventListener('click', () => settings.setOpen(false));
    root.querySelector('[data-settings="restart"]').addEventListener('click', () => onRestart?.());
    root.querySelector('[data-settings="menu"]').addEventListener('click', () => onMenu?.());
    root.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const focusable = [...root.querySelectorAll('button, input')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    const wireframe = root.querySelector('input');
    wireframe.checked = debugSettings.showWireframes;
    wireframe.addEventListener('change', () => setWireframesVisible(wireframe.checked));
    onWireframesChange(visible => {
        wireframe.checked = visible;
        rats.forEach(rat => rat.setDebugVisible(visible));
    });
    return settings;
}
