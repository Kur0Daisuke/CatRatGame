import * as THREE from 'three';
import { CAT_MODELS } from '../game/player.js';

export function createMenu({ player, onStart }) {
    const root = document.createElement('main');
    root.className = 'main-menu';
    root.innerHTML = `
        <header class="menu-brand"><span class="brand-mark">C/R</span><span>CAT & RATS<small>A LITTLE HUNT. A LOT OF TROUBLE.</small></span></header>
        <section class="menu-content" aria-labelledby="menu-title">
            <p class="eyebrow">THE GARDEN IS ALIVE</p>
            <h1 id="menu-title">Quiet paws.<br><em>Big trouble.</em></h1>
            <p class="menu-intro">Pick your cat. Know your rivals. Make an entrance.</p>
            <div class="cat-picker">
                <div class="section-heading"><h2>01 / CHOOSE YOUR CAT</h2><span class="selected-cat">Original</span></div>
                <div class="cat-preview" aria-label="Selected cat model preview"></div>
                <div class="cat-options">${CAT_MODELS.map((cat, i) => `<button type="button" class="cat-option" data-cat="${cat.id}" aria-pressed="${i === 0}"><span class="coat coat--${cat.id}" aria-hidden="true"></span>${cat.label}</button>`).join('')}</div>
            </div>
            <button class="start-game" type="button" disabled><span>LOADING YOUR CAT…</span><span aria-hidden="true">↗</span></button>
            <p class="menu-status" role="status">Getting your paws ready.</p>
        </section>
        <aside class="rat-guide" aria-labelledby="guide-title">
            <p class="eyebrow">FIELD NOTES / 03 TYPES</p><h2 id="guide-title">Meet the locals.</h2>
            <article><span class="rat-number">01</span><div><h3>Dumb rat <span>THE EASY ONE</span></h3><p>Flees in a straight line. Follow quietly and land a forgiving skill check.</p></div></article>
            <article><span class="rat-number">02</span><div><h3>Scout rat <span>THE QUICK ONE</span></h3><p>Zigzags to shake you off. Get close, then be ready for a faster, narrower skill check.</p></div></article>
            <article><span class="rat-number">03</span><div><h3>Pouncer rat <span>THE BOLD ONE</span></h3><p>Jumps at you and can stun you. Watch your approach and time your pounce.</p></div></article>
            <div class="field-tip"><span>HUNTER'S TIP</span>Keep the noise down. Drink from puddles to recover stamina.</div>
        </aside>
        <footer class="menu-footer"><span><i></i> LIVE GARDEN</span><span>WASD move · SHIFT run · CTRL sneak · E pounce · SPACE skill check · ESC settings</span></footer>`;
    document.body.appendChild(root);
    const start = root.querySelector('.start-game');
    const status = root.querySelector('.menu-status');
    const buttons = [...root.querySelectorAll('[data-cat]')];
    buttons.forEach(button => { button.disabled = true; });
    const preview = new THREE.Scene();
    preview.add(new THREE.HemisphereLight(0xffffff, 0x667464, 3));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(3, 5, 4);
    preview.add(key);
    const camera = new THREE.PerspectiveCamera(35, 2.8, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    root.querySelector('.cat-preview').appendChild(renderer.domElement);
    const resize = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        if (!width || !height) return;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });
    resize.observe(root.querySelector('.cat-preview'));
    let model;
    function showPreview() {
        if (model) preview.remove(model);
        model = player.carModel.clone(true);
        model.position.set(0, 0, 0);
        model.quaternion.identity();
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length();
        model.position.sub(center);
        preview.add(model);
        camera.position.set(size * 0.5, size * 0.22, size * 0.7);
        camera.lookAt(0, 0, 0);
    }
    function ready() {
        showPreview();
        buttons.forEach(button => { button.disabled = false; });
        start.disabled = false;
        start.firstElementChild.textContent = 'LET’S HUNT';
        status.textContent = 'Your entrance? Straight from the sky.';
    }
    player.ready.then(ready).catch(() => {
        buttons.forEach(button => { button.disabled = false; });
        status.textContent = 'Cat could not load. Choose a coat to try again.';
    });
    buttons.forEach(button => button.addEventListener('click', async () => {
        buttons.forEach(item => { item.disabled = true; });
        start.disabled = true;
        status.textContent = 'Loading cat…';
        try {
            await player.setCatModel(button.dataset.cat);
            buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
            root.querySelector('.selected-cat').textContent = button.textContent;
            ready();
        } catch {
            status.textContent = 'Could not load this coat. Choose another or try again.';
            start.disabled = !player.carModel;
        } finally {
            buttons.forEach(item => { item.disabled = false; });
        }
    }));
    start.addEventListener('click', () => {
        root.hidden = true;
        resize.disconnect();
        renderer.dispose();
        onStart();
    });
    return { update(delta) {
        if (root.hidden) return;
        if (model) model.rotation.y += delta * 0.22;
        renderer.render(preview, camera);
    } };
}
