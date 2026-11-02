import { scoutShareCatIntel, scoutTellRat } from './ratIntel.js';
import { moveRatOnGround } from './ratMovement.js';
import { interruptRatConversation } from './ratConversation.js';
import { getHuntDog } from './huntDog.js';
import { SCOUT_REPORT_DOG, SCOUT_SEEK_DOG, pickLine } from './dogLines.js';

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

function warnTargetPosition(target) {
    return target?.container?.position || target?.ratContainer?.position || null;
}

export function startScoutWarning(scout, catCenter, allRats, now) {
    interruptRatConversation(scout);
    const cfg = scout.kindConfig;
    const dog = getHuntDog();
    scout.isWarning = true;
    scout.warningTimer = 0;
    scout.warningBroadcastTimer = 0;
    scout.warnsDog = !!(dog?.container);
    scout.warnTargetRat = scout.warnsDog ? dog : findScoutWarnTarget(scout, allRats);
    scout.dogReport = { x: catCenter.x, z: catCenter.z };
    scout.state = 'WARNING';
    scout.ratSpeed = scout.warnsDog ? 2.7 : (cfg.scoutWarnRunSpeed ?? 1.35);
    scoutShareCatIntel(scout, catCenter, allRats, cfg.avoidSpotTtl, now, cfg.scoutTellRadius ?? 8);
    scout.scoutBroadcastTimer = cfg.sightBroadcastInterval;
    scout.showChatBubble(scout.warnsDog ? pickLine(SCOUT_SEEK_DOG) : scout.scoutTopic);
}

export function updateScoutWarning(scout, delta, catCenter, allRats, now, senses) {
    const cfg = scout.kindConfig;

    if (senses.bushHidden) {
        scout.isWarning = false;
        scout.warnTargetRat = null;
        scout.warnsDog = false;
        if (scout.state === 'WARNING') scout.state = 'IDLE';
        scout.threatMeter = Math.max(0, (scout.threatMeter ?? 0) - 0.35);
        return 'continue';
    }

    if (senses.canSee) {
        scout.dogReport = { x: catCenter.x, z: catCenter.z };
    }

    scout.warningTimer += delta;
    scout.warningBroadcastTimer -= delta;
    scout.scoutBroadcastTimer = Math.max(0, scout.scoutBroadcastTimer - delta);

    if (!scout.warnsDog && (!scout.warnTargetRat || scout.warnTargetRat.isConsumed || scout.warnTargetRat.isPinned)) {
        scout.warnTargetRat = findScoutWarnTarget(scout, allRats);
    }

    if (scout.scoutBroadcastTimer <= 0) {
        scoutShareCatIntel(scout, catCenter, allRats, cfg.avoidSpotTtl, now, cfg.scoutTellRadius ?? 8);
        scout.scoutBroadcastTimer = cfg.sightBroadcastInterval;
    }

    if (scout.warningBroadcastTimer <= 0) {
        scout.warningBroadcastTimer = 0.7;
        scout.showChatBubble(scout.warnsDog ? pickLine(SCOUT_SEEK_DOG) : scout.scoutTopic);
    }

    const fleeDist = cfg.scoutFleeDist ?? 3.15;
    if (senses.distance <= fleeDist) {
        scout.isWarning = false;
        scout.warnTargetRat = null;
        scout.warnsDog = false;
        return 'flee';
    }

    const targetRat = scout.warnTargetRat;
    const targetPos = warnTargetPosition(targetRat);
    if (!targetPos) {
        const wasDog = scout.warnsDog;
        scout.isWarning = false;
        scout.warnTargetRat = null;
        scout.warnsDog = false;
        return wasDog ? 'done' : 'flee';
    }
    const ratPos = scout.ratContainer.position;
    const dx = targetPos.x - ratPos.x;
    const dz = targetPos.z - ratPos.z;
    const len = Math.hypot(dx, dz);

    if (len > 0.2) {
        moveRatOnGround(scout, dx / len, dz / len, scout.ratSpeed, delta);
        scout.rotateTowards(targetPos, cfg.turnSpeed * 1.6, delta);
        scoutShareCatIntel(scout, catCenter, allRats, cfg.avoidSpotTtl * 0.85, now, cfg.scoutTellRadius ?? 8);
    }

    const reachDist = scout.warnsDog ? 2.15 : 2.2;
    const maxDuration = scout.warnsDog ? 36 : (cfg.scoutWarnMaxDuration ?? 7);
    const reachedAlly = len < reachDist;
    const timedOut = scout.warningTimer > maxDuration;
    if (reachedAlly || timedOut) {
        if (scout.warnsDog) {
            const report = scout.dogReport || { x: catCenter.x, z: catCenter.z };
            if ((reachedAlly || len < 5) && targetRat?.receiveCatReport) {
                targetRat.receiveCatReport(report);
                scout.showChatBubble(pickLine(SCOUT_REPORT_DOG));
            }
            scout.isWarning = false;
            scout.warnTargetRat = null;
            scout.warnsDog = false;
            return 'done';
        }
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
