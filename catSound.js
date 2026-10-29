import * as THREE from 'three';

export const HEARING_THRESHOLD = 28;
export const ALERT_HEARD_DB = 38;
export const PANIC_HEARD_DB = 56;
export const ATTENUATION_FACTOR = 40;

/**
 * Source loudness at the cat (dB). Walk is usually quiet with occasional louder steps; run is loud.
 */
export function computeCatSourceDecibels(player, timeSeconds) {
    const moving = player.isMoving || player.leapActive;

    if (!moving) {
        return 6 + Math.sin(timeSeconds * 1.6) * 2;
    }

    if (player.leapActive) {
        return 72 + Math.sin(timeSeconds * 24) * 6;
    }

    if (player.isRunning) {
        const stomp = 0.88 + 0.12 * Math.abs(Math.sin(timeSeconds * 16));
        return 86 + stomp * 14;
    }

    if (player.isSneaking) {
        const step = Math.abs(Math.sin(timeSeconds * 4.2));
        return 14 + step * 10;
    }

    const stepPhase = timeSeconds * 5.2;
    const foot = Math.abs(Math.sin(stepPhase));
    let db = 22 + foot * 12;
    if (foot > 0.94) {
        db += 14 + Math.random() * 10;
    }
    return db;
}

export function computePerceivedDecibels(sourceDb, distance) {
    return Math.max(
        sourceDb - ATTENUATION_FACTOR * Math.log10(Math.max(distance, 0.2)),
        0
    );
}

/** Approximate distance at which a given source level reaches the hearing threshold. */
export function hearingRangeFromSourceDb(sourceDb) {
    if (sourceDb <= HEARING_THRESHOLD) return 0.35;
    const ratio = (sourceDb - HEARING_THRESHOLD) / ATTENUATION_FACTOR;
    return Math.pow(10, ratio);
}

export function canRatHearCat(perceivedDecibels, distance, sourceDecibels) {
    if (perceivedDecibels < HEARING_THRESHOLD) return false;
    const maxRange = hearingRangeFromSourceDb(sourceDecibels);
    return distance <= maxRange + 0.5;
}

export function dbToVisualRadius(sourceDb) {
    const range = hearingRangeFromSourceDb(sourceDb);
    return THREE.MathUtils.clamp(range * 0.55, 0.25, 14);
}

export function dbToMeterFill(sourceDb) {
    return THREE.MathUtils.clamp((sourceDb - 5) / 95, 0, 1);
}
