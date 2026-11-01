import * as THREE from 'three';

const _away = new THREE.Vector3();

/**
 * Per-rat cat-avoidance spots (from scout intel or pouncer alarm). Each entry expires on its own timer.
 */
export function createAvoidanceList() {
    return [];
}

export function addAvoidSpot(list, x, z, ttlSeconds, now) {
    list.push({
        x,
        z,
        expiresAt: now + ttlSeconds
    });
}

export function pruneAvoidSpots(list, now) {
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].expiresAt <= now) list.splice(i, 1);
    }
}

export function nearestAvoidSpot(list, ratPos, now) {
    pruneAvoidSpots(list, now);
    let best = null;
    let bestDist = Infinity;
    for (const spot of list) {
        const d = Math.hypot(spot.x - ratPos.x, spot.z - ratPos.z);
        if (d < bestDist) {
            bestDist = d;
            best = spot;
        }
    }
    return best ? { spot: best, distance: bestDist } : null;
}

export function addCatAvoidSpot(rat, x, z, ttlSeconds, now) {
    if (!rat?.avoidSpots || rat.isConsumed) return;
    addAvoidSpot(rat.avoidSpots, x, z, ttlSeconds, now);
}

/**
 * Scout shares cat position only with rats close enough to be warned (not the whole map).
 */
export function scoutShareCatIntel(scout, catPos, allRats, ttlSeconds, now, tellRadius = 8) {
    if (!scout?.ratContainer) return;
    addCatAvoidSpot(scout, catPos.x, catPos.z, ttlSeconds, now);

    const sx = scout.ratContainer.position.x;
    const sz = scout.ratContainer.position.z;
    const radius = Math.max(1.5, tellRadius);

    for (const other of allRats) {
        if (other === scout || other.isConsumed || other.isPinned) continue;
        const ox = other.ratContainer.position.x;
        const oz = other.ratContainer.position.z;
        const nearScout = Math.hypot(ox - sx, oz - sz);
        if (nearScout > radius) continue;

        addCatAvoidSpot(other, catPos.x, catPos.z, ttlSeconds, now);
        other.informedByScout = scout;

        const close = nearScout <= radius * 0.45;
        if (close) {
            other.threatMeter = Math.max(other.threatMeter ?? 0, 0.38 + (1 - nearScout / radius) * 0.35);
            if (other.kind === 'dumb') other.markAlerted?.(2.2);
        }
    }
}

/** Direct tell when scout reaches a specific rat. */
export function scoutTellRat(scout, targetRat, catPos, ttlSeconds, now) {
    if (!scout || !targetRat) return;
    addCatAvoidSpot(scout, catPos.x, catPos.z, ttlSeconds, now);
    addCatAvoidSpot(targetRat, catPos.x, catPos.z, ttlSeconds, now);
    targetRat.informedByScout = scout;
    targetRat.threatMeter = Math.max(targetRat.threatMeter ?? 0, 0.55);
    if (targetRat.kind === 'dumb') targetRat.markAlerted?.(3);
}

/** Pouncer: warn only rats within notify radius. */
export function alertRatsNearPouncer(pouncer, catPos, ttlSeconds, now) {
    const cfg = pouncer.kindConfig;
    const radius = cfg.notifyRadius ?? 7;
    const allRats = pouncer.getAllRats?.() ?? [];
    for (const other of allRats) {
        if (other === pouncer || other.isConsumed || other.isPinned) continue;
        const dist = pouncer.ratContainer.position.distanceTo(other.ratContainer.position);
        if (dist > radius) continue;
        addCatAvoidSpot(other, catPos.x, catPos.z, ttlSeconds, now);
        other.receiveNeighborAlarm?.(catPos, dist, now);
    }
}

/** Nudge a wander target away from active avoid spots. */
export function steerDestinationFromAvoidance(list, ratPos, destination, now, strength = 1) {
    pruneAvoidSpots(list, now);
    if (list.length === 0) return destination;

    _away.set(0, 0, 0);
    for (const spot of list) {
        const dx = ratPos.x - spot.x;
        const dz = ratPos.z - spot.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.4) continue;
        const weight = strength / Math.max(dist, 2.5);
        _away.x += (dx / dist) * weight;
        _away.z += (dz / dist) * weight;
    }

    if (_away.lengthSq() < 1e-6) return destination;
    _away.normalize();
    destination.x += _away.x * 2.2;
    destination.z += _away.z * 2.2;
    return destination;
}
