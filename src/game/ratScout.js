import { scoutShareCatIntel, scoutTellRat } from './ratIntel.js';
import { moveRatOnGround } from './ratMovement.js';
import { interruptRatConversation } from './ratConversation.js';

/** Nearest rat to run toward when warning the colony (prefer dumb rats). */
export function findScoutWarnTarget(scout, allRats) {
    const from = scout.ratContainer.position;
    let best = null;
    let bestScore = Infinity;
    for (const other of allRats) {
        if (other === scout || other.isConsumed || other.isPinned) continue;
        if (other.kind === 'scout') continue;
        const dx = other.ratContainer.position.x - from.x;
        const dz = other.ratContainer.position.z - from.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.5) continue;
        const kindBias = other.kind === 'dumb' ? 0.55 : 0.85;
        const score = dist * kindBias;
        if (score < bestScore) {
            bestScore = score;
            best = other;
        }
    }
    if (!best) {
        for (const other of allRats) {
            if (other === scout || other.isConsumed || other.isPinned) continue;
            const dist = from.distanceTo(other.ratContainer.position);
            if (dist < bestScore) {
                bestScore = dist;
                best = other;
            }
        }
    }
    return best;
}

export function startScoutWarning(scout, catCenter, allRats, now) {
    interruptRatConversation(scout);
    const cfg = scout.kindConfig;
    scout.isWarning = true;
    scout.warningTimer = 0;
    scout.warningBroadcastTimer = 0;
    scout.warnTargetRat = findScoutWarnTarget(scout, allRats);
    scout.state = 'WARNING';
    scout.ratSpeed = cfg.scoutWarnRunSpeed ?? 1.35;
    scoutShareCatIntel(scout, catCenter, allRats, cfg.avoidSpotTtl, now, cfg.scoutTellRadius ?? 8);
    scout.scoutBroadcastTimer = cfg.sightBroadcastInterval;
    scout.showChatBubble(scout.scoutTopic);
}

export function updateScoutWarning(scout, delta, catCenter, allRats, now, senses) {
    const cfg = scout.kindConfig;

    if (senses.bushHidden) {
        scout.isWarning = false;
        scout.warnTargetRat = null;
        if (scout.state === 'WARNING') scout.state = 'IDLE';
        scout.threatMeter = Math.max(0, (scout.threatMeter ?? 0) - 0.35);
        return 'continue';
    }

    scout.warningTimer += delta;
    scout.warningBroadcastTimer -= delta;
    scout.scoutBroadcastTimer = Math.max(0, scout.scoutBroadcastTimer - delta);

    if (!scout.warnTargetRat || scout.warnTargetRat.isConsumed || scout.warnTargetRat.isPinned) {
        scout.warnTargetRat = findScoutWarnTarget(scout, allRats);
    }

    if (scout.scoutBroadcastTimer <= 0) {
        scoutShareCatIntel(scout, catCenter, allRats, cfg.avoidSpotTtl, now, cfg.scoutTellRadius ?? 8);
        scout.scoutBroadcastTimer = cfg.sightBroadcastInterval;
    }

    if (scout.warningBroadcastTimer <= 0) {
        scout.warningBroadcastTimer = 0.7;
        scout.showChatBubble(scout.scoutTopic);
    }

    const fleeDist = cfg.scoutFleeDist ?? 3.15;
    if (senses.distance <= fleeDist) {
        scout.isWarning = false;
        scout.warnTargetRat = null;
        return 'flee';
    }

    const targetRat = scout.warnTargetRat;
    if (!targetRat?.ratContainer) {
        scout.isWarning = false;
        return 'flee';
    }

    const targetPos = targetRat.ratContainer.position;
    const ratPos = scout.ratContainer.position;
    const dx = targetPos.x - ratPos.x;
    const dz = targetPos.z - ratPos.z;
    const len = Math.hypot(dx, dz);

    if (len > 0.2) {
        moveRatOnGround(scout, dx / len, dz / len, scout.ratSpeed, delta);
        scout.rotateTowards(targetPos, cfg.turnSpeed * 1.6, delta);
        scoutShareCatIntel(scout, catCenter, allRats, cfg.avoidSpotTtl * 0.85, now, cfg.scoutTellRadius ?? 8);
    }

    const reachedAlly = len < 2.2;
    const timedOut = scout.warningTimer > (cfg.scoutWarnMaxDuration ?? 7);
    if (reachedAlly || timedOut) {
        scoutTellRat(scout, targetRat, catCenter, cfg.avoidSpotTtl, now);
        scoutShareCatIntel(
            scout,
            catCenter,
            allRats,
            cfg.avoidSpotTtl,
            now,
            cfg.scoutWarnTellRadius ?? 4.5
        );
        if (reachedAlly) scout.showChatBubble(scout.scoutTopic);
        scout.isWarning = false;
        scout.warnTargetRat = null;
        return 'flee';
    }

    return 'continue';
}

export function handleScoutIntel(scout, senses, catCenter, allRats, now) {
    if (scout.kind !== 'scout' || scout.isWarning || scout.isEscaping || scout.isPinned) return;
    const cfg = scout.kindConfig;

    if (senses.canSee && !senses.bushHidden && scout.scoutBroadcastTimer <= 0) {
        scoutShareCatIntel(scout, catCenter, allRats, cfg.avoidSpotTtl, now, cfg.scoutTellRadius ?? 8);
        scout.scoutBroadcastTimer = cfg.sightBroadcastInterval;
    }

    const loudEnough =
        !senses.bushHidden &&
        senses.canHear &&
        senses.perceivedDecibels >= cfg.alertHearingDb &&
        (senses.sourceDecibels ?? 0) > 12;
    if (loudEnough && scout.scoutHearBroadcastTimer <= 0) {
        scout.updateGuessPosition(catCenter, scout.visionSphere.center, senses.perceivedDecibels);
        scoutShareCatIntel(
            scout,
            scout.guessedPosition,
            allRats,
            cfg.avoidSpotTtl * 0.7,
            now,
            (cfg.scoutTellRadius ?? 8) * 0.65
        );
        scout.scoutHearBroadcastTimer = cfg.hearBroadcastInterval;
    }
}
