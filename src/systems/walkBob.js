/** Procedural walk shared by the cat and the dog: a roll sway plus a small hop. */
export function createWalkBob() {
    return { translationX: 0, translationY: 0, stoppedMoving: false };
}

export function applyWalkBob(bob, model, moving, delta, baseY = 0) {
    if (!bob) return;

    if (moving) {
        bob.translationX += 0.04;
        bob.translationY += 0.08;
        bob.stoppedMoving = true;
    } else if (bob.stoppedMoving) {
        bob.translationY += 0.08;
        if (Math.abs(Math.sin(bob.translationY * 0.8)) < 0.05) {
            bob.stoppedMoving = false;
        }
    }

    if (Math.sin(bob.translationX) >= 0.1 || Math.sin(bob.translationX) <= -0.1) {
        bob.translationX += 0.04;
    }

    if (!model) return;
    model.rotation.z = Math.sin(bob.translationX) * 2 * delta;
    if (!bob.stoppedMoving && !moving) {
        model.position.y = baseY;
    } else {
        model.position.y = baseY + Math.abs(Math.sin(bob.translationY * 0.8)) * 2 * delta;
    }
}
