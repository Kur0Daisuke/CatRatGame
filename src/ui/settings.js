import { debugSettings, onWireframesChange, setWireframesVisible } from '../core/debugSettings.js';

export function createSettings({ rats, onChange }) {
    const root = document.createElement('div');
    root.className = 'settings';
    root.hidden = true;
    root.innerHTML = `<section class="settings-panel" id="game-settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <p class="eyebrow">TAKE A BREATHER</p><h2 id="settings-title">Settings</h2>
        <label class="debug-toggle"><input type="checkbox" id="wireframe-toggle"> Show collision wireframes</label>
        <div class="settings-controls"><p><kbd>W A S D</kbd> Move</p><p><kbd>SHIFT</kbd> Run <kbd>CTRL</kbd> Sneak</p><p><kbd>E</kbd> Pounce <kbd>SPACE</kbd> Skill check</p><p>Stand in puddles to restore stamina.</p></div>
        <button class="resume-game" type="button">RESUME <span>ESC ↗</span></button>
        <p class="settings-help">Click the garden after resuming to capture the mouse.</p>
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
    root.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const first = root.querySelector('input');
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); resume.focus(); }
        else if (!event.shiftKey && document.activeElement === resume) { event.preventDefault(); first.focus(); }
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
