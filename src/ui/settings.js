import { CAT_MODELS } from '../game/player.js';
import { debugSettings, onWireframesChange, setWireframesVisible } from '../core/debugSettings.js';

export function createSettings({ player, rats }) {
    const root = document.createElement('div');
    root.className = 'settings';
    root.innerHTML = `
        <button class="settings-button" type="button" aria-expanded="false" aria-controls="game-settings">
            <span aria-hidden="true">⚙</span> Settings
        </button>
        <section class="settings-panel" id="game-settings" aria-labelledby="settings-title" hidden>
            <h2 id="settings-title">Settings</h2>
            <label class="settings-label" for="cat-model">Cat model</label>
            <select id="cat-model">${CAT_MODELS.map((model) => `<option value="${model.id}">${model.label}</option>`).join('')}</select>
            <label class="debug-toggle">
                <input type="checkbox" id="wireframe-toggle" />
                Show collision wireframes
            </label>
            <p class="settings-status" role="status" hidden></p>
            <p class="settings-help">Esc to close · H to toggle wireframes</p>
        </section>
    `;
    document.body.appendChild(root);
    const button = root.querySelector('button');
    const panel = root.querySelector('section');
    const select = root.querySelector('select');
    const wireframe = root.querySelector('input');
    const status = root.querySelector('[role="status"]');
    const settings = {
        get isOpen() { return !panel.hidden; },
        setOpen(open) {
            panel.hidden = !open;
            button.setAttribute('aria-expanded', String(open));
            player.setControlsBlocked(open);
            if (open && document.pointerLockElement) document.exitPointerLock();
            if (!open && root.contains(document.activeElement)) button.focus();
        }
    };
    button.addEventListener('click', () => settings.setOpen(panel.hidden));
    document.addEventListener('keydown', (event) => {
        if (event.code === 'Escape' && settings.isOpen) {
            event.preventDefault();
            settings.setOpen(false);
        }
    });
    document.addEventListener('pointerdown', (event) => {
        if (settings.isOpen && !root.contains(event.target)) settings.setOpen(false);
    });
    select.addEventListener('change', async () => {
        select.disabled = true;
        status.hidden = false;
        status.textContent = 'Loading cat…';
        try {
            await player.setCatModel(select.value);
            status.hidden = true;
        } catch (error) {
            select.value = player.catModelId;
            status.textContent = 'Could not load this cat. Please try again.';
            console.error(error);
        } finally {
            select.disabled = false;
        }
    });
    wireframe.checked = debugSettings.showWireframes;
    wireframe.addEventListener('change', () => setWireframesVisible(wireframe.checked));
    onWireframesChange((visible) => {
        wireframe.checked = visible;
        rats.forEach((rat) => rat.setDebugVisible(visible));
    });
    return settings;
}
