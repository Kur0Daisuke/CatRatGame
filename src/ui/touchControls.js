export function prefersTouchControls() {
    return window.matchMedia('(pointer: coarse)').matches
        || window.matchMedia('(hover: none)').matches;
}

export function createTouchControls({ player, canvas, onLook, onPounce, onClimb, onSkill, onPause, getState }) {
    const root = document.createElement('div');
    root.className = 'touch-controls';
    root.hidden = true;
    root.innerHTML = `
        <button type="button" class="touch-pause" aria-label="Pause">Pause</button>
        <p class="touch-look-hint">Drag to look</p>
        <div class="touch-stick" role="application" aria-label="Move">
            <div class="touch-stick-knob"></div>
        </div>
        <div class="touch-actions">
            <button type="button" class="touch-btn" data-action="climb">TREE</button>
            <button type="button" class="touch-btn touch-hold" data-action="sneak">SNEAK</button>
            <button type="button" class="touch-btn touch-hold" data-action="run">RUN</button>
            <button type="button" class="touch-btn" data-action="pounce">POUNCE</button>
        </div>
        <button type="button" class="touch-skill" hidden>TAP</button>
    `;
    document.body.appendChild(root);

    const pauseBtn = root.querySelector('.touch-pause');
    const hint = root.querySelector('.touch-look-hint');
    const stick = root.querySelector('.touch-stick');
    const knob = root.querySelector('.touch-stick-knob');
    const actions = root.querySelector('.touch-actions');
    const climbBtn = root.querySelector('[data-action="climb"]');
    const sneakBtn = root.querySelector('[data-action="sneak"]');
    const pounceBtn = root.querySelector('[data-action="pounce"]');
    const runBtn = root.querySelector('[data-action="run"]');
    const skillBtn = root.querySelector('.touch-skill');

    let stickId = null;
    let stickActive = false;
    let wasConfused = false;
    const stickVector = { x: 0, z: 0 };
    let lookId = null;
    let lookX = 0;
    let lookY = 0;
    let runPointer = null;
    let sneakPointer = null;
    let state = emptyState();

    function emptyState() {
        return {
            showStick: false,
            showActions: false,
            showLook: false,
            showPause: false,
            showSkill: false,
            pounceReady: false,
            climbReady: false,
            perched: false
        };
    }

    function enabled() {
        return document.body.classList.contains('touch-ui');
    }

    function relabelSkillKeys() {
        const label = enabled() ? 'TAP' : 'SPACE';
        document.querySelectorAll('.pounce-qte-key').forEach((el) => {
            el.textContent = label;
        });
    }

    function endStick() {
        if (stickId !== null && stick.hasPointerCapture?.(stickId)) {
            try { stick.releasePointerCapture(stickId); } catch { /* pointer already released */ }
        }
        stickId = null;
        stickActive = false;
        stickVector.x = 0;
        stickVector.z = 0;
        knob.style.transform = 'translate(-50%, -50%)';
        stick.classList.remove('is-live');
        player.setTouchMove(0, 0);
    }

    function setRunHeld(held) {
        if (held) {
            sneakPointer = null;
            sneakBtn.classList.remove('is-held');
            player.setTouchSneak(false);
        }
        runBtn.classList.toggle('is-held', held);
        player.setTouchRun(held);
    }

    function setSneakHeld(held) {
        if (held) {
            runPointer = null;
            runBtn.classList.remove('is-held');
            player.setTouchRun(false);
        }
        sneakBtn.classList.toggle('is-held', held);
        player.setTouchSneak(held);
    }

    function releaseHolds() {
        runPointer = null;
        sneakPointer = null;
        setRunHeld(false);
        setSneakHeld(false);
    }

    function updateStick(clientX, clientY) {
        const rect = stick.getBoundingClientRect();
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height / 2;
        const radius = rect.width * 0.36;
        let dx = clientX - originX;
        let dy = clientY - originY;
        const mag = Math.hypot(dx, dy);
        if (mag > radius && mag > 0) {
            dx *= radius / mag;
            dy *= radius / mag;
        }
        knob.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
        const amount = radius > 0 ? Math.hypot(dx, dy) / radius : 0;
        const dead = 0.18;
        if (amount < dead) {
            stickVector.x = 0;
            stickVector.z = 0;
            stick.classList.remove('is-live');
        } else {
            const scaled = (amount - dead) / (1 - dead);
            const len = Math.hypot(dx, dy) || 1;
            stickVector.x = (dx / len) * scaled;
            stickVector.z = (dy / len) * scaled;
            stick.classList.add('is-live');
        }
        if (player.confuseTimer <= 0) player.setTouchMove(stickVector.x, stickVector.z);
    }

    stick.addEventListener('pointerdown', (event) => {
        if (!state.showStick || stickId !== null) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        stickId = event.pointerId;
        stickActive = true;
        try { stick.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
        updateStick(event.clientX, event.clientY);
    });
    stick.addEventListener('pointermove', (event) => {
        if (event.pointerId !== stickId) return;
        updateStick(event.clientX, event.clientY);
    });
    stick.addEventListener('pointerup', (event) => {
        if (event.pointerId === stickId) endStick();
    });
    stick.addEventListener('pointercancel', (event) => {
        if (event.pointerId === stickId) endStick();
    });

    function bindHold(button, getPointer, setPointer, setHeld) {
        button.addEventListener('pointerdown', (event) => {
            if (!state.showActions || getPointer() !== null) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.preventDefault();
            setPointer(event.pointerId);
            try { button.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
            setHeld(true);
        });
        const release = (event) => {
            if (event.pointerId !== getPointer()) return;
            setPointer(null);
            setHeld(false);
        };
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
    }

    bindHold(runBtn, () => runPointer, (id) => { runPointer = id; }, setRunHeld);
    bindHold(sneakBtn, () => sneakPointer, (id) => { sneakPointer = id; }, setSneakHeld);

    function bindTap(button, action) {
        button.addEventListener('pointerdown', (event) => {
            if (!state.showActions) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            event.preventDefault();
            button.classList.add('is-held');
            action();
        });
        const release = () => button.classList.remove('is-held');
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
    }

    bindTap(pounceBtn, () => onPounce());
    bindTap(climbBtn, () => onClimb());

    skillBtn.addEventListener('pointerdown', (event) => {
        if (!state.showSkill) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        skillBtn.classList.add('is-held');
        onSkill();
    });
    skillBtn.addEventListener('pointerup', () => skillBtn.classList.remove('is-held'));
    skillBtn.addEventListener('pointercancel', () => skillBtn.classList.remove('is-held'));

    document.querySelectorAll('.pounce-qte-overlay').forEach((overlay) => {
        overlay.addEventListener('pointerdown', (event) => {
            if (!enabled() || !state.showSkill) return;
            if (event.target.closest('.touch-skill')) return;
            event.preventDefault();
            onSkill();
        });
    });

    pauseBtn.addEventListener('pointerdown', (event) => {
        if (!state.showPause) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        try { pauseBtn.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
    });
    pauseBtn.addEventListener('pointerup', (event) => {
        if (!state.showPause) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        onPause();
    });

    canvas.addEventListener('pointerdown', (event) => {
        if (!enabled() || !state.showLook || lookId !== null) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        lookId = event.pointerId;
        lookX = event.clientX;
        lookY = event.clientY;
        try { canvas.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
    });
    canvas.addEventListener('pointermove', (event) => {
        if (event.pointerId !== lookId) return;
        const dx = event.clientX - lookX;
        const dy = event.clientY - lookY;
        lookX = event.clientX;
        lookY = event.clientY;
        if (dx === 0 && dy === 0) return;
        hint.classList.add('is-gone');
        onLook(dx, dy);
    });
    const endLook = (event) => {
        if (event.pointerId !== lookId) return;
        lookId = null;
    };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) return;
        endStick();
        releaseHolds();
        lookId = null;
    });

    function applyMode(on) {
        document.body.classList.toggle('touch-ui', on);
        relabelSkillKeys();
        if (!on) {
            endStick();
            releaseHolds();
            lookId = null;
        }
    }

    applyMode(prefersTouchControls());
    ['(pointer: coarse)', '(hover: none)'].forEach((query) => {
        window.matchMedia(query).addEventListener('change', () => applyMode(prefersTouchControls()));
    });

    document.body.addEventListener('touchmove', (event) => {
        if (!enabled()) return;
        if (event.target.closest('.main-menu, .settings, .hunt-end-overlay')) return;
        event.preventDefault();
    }, { passive: false });

    return {
        sync() {
            if (!enabled()) {
                root.hidden = true;
                return;
            }
            state = getState();
            const confused = player.confuseTimer > 0;
            if (stickActive && wasConfused && !confused && state.showStick) {
                player.setTouchMove(stickVector.x, stickVector.z);
            }
            wasConfused = confused;
            if (stickActive && !state.showStick) endStick();
            if (!state.showActions) releaseHolds();
            if (!state.showLook) lookId = null;

            const visible = state.showPause || state.showStick || state.showActions || state.showSkill;
            root.hidden = !visible;
            pauseBtn.hidden = !state.showPause;
            stick.hidden = !state.showStick;
            actions.hidden = !state.showActions;
            hint.hidden = !state.showLook || hint.classList.contains('is-gone');
            skillBtn.hidden = !state.showSkill;
            pounceBtn.classList.toggle('is-ready', state.pounceReady);
            climbBtn.classList.toggle('is-ready', state.climbReady);
            climbBtn.textContent = state.perched ? 'DOWN' : 'TREE';
        }
    };
}
