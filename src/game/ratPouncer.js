import { moveRatOnGround } from './ratMovement.js';
import { interruptRatConversation } from './ratConversation.js';

const FEINT_LINES = ['Psyche!', 'Wrong way!', 'Over here!', 'Too slow!'];
const REENGAGE_LINES = ['Again!', 'Come get me!', 'Not done!'];
const JUKE_LINES = ['Dodge this!', 'Ha!'];

export function canPouncerEngage(senses, dist, cfg) {
    const range = cfg.engageRange ?? 4.5;
    if (dist > range || dist < 0.95) return false;
    if (senses.canSee) return true;
    return senses.proximity && dist <= (cfg.engageProximityDist ?? 2.85);
}

export function beginPouncerEngage(rat, catPos) {
    const cfg = rat.kindConfig;
    if (rat.kind !== 'pouncer' || rat.isEngaging || rat.pouncerEngageCooldown > 0) return false;

    interruptRatConversation(rat);

    rat.isEngaging = true;
    rat.isEscaping = false;
    rat.engageTimer = 0;
    rat.leapTimer = 0;
    rat.pouncerJumpPhase = 'circle';
    rat.state = 'ENGAGING';
    rat.pouncerCircleSign = Math.random() < 0.5 ? 1 : -1;
    rat.feintSign = rat.pouncerCircleSign;
    rat._feintConfusedApplied = false;
    rat.hasStunnedCat = false;
    rat.circleStalkTimer = 0;
    rat.bandHoldTimer = 0;
    rat.windupCommitted = false;
    rat.threatMeter = Math.max(0, rat.threatMeter - 0.35);
    if (rat.ratModel) {
        rat.ratModel.rotation.z = 0;
        rat.ratModel.scale.set(0.15, 0.15, 0.15);
    }
    void catPos;
    return true;
}

function applyConfuseFromFeint(playerEntity, cfg, scale = 1) {
    if (!playerEntity?.confuse) return;
    const dur = (cfg.confuseDuration ?? 1.15) * scale;
    const str = (cfg.confuseOnFeint ?? 0.85) * scale;
    playerEntity.confuse(dur, str);
}

function pouncerHitsCat(rat, playerEntity) {
    if (!rat?.collisionSphere || !playerEntity?.collisionSphere) return false;
    return rat.collisionSphere.intersectsSphere(playerEntity.collisionSphere);
}

function leapBand(cfg, dist) {
    const minD = cfg.leapMinDist ?? 2.15;
    const maxD = cfg.leapMaxDist ?? 3.65;
    return dist >= minD && dist <= maxD;
}

function orbitBand(cfg, dist) {
    const minD = (cfg.leapMinDist ?? 2.15) - 0.12;
    const maxD = (cfg.leapMaxDist ?? 3.65) + 0.15;
    return dist >= minD && dist <= maxD;
}

function tryHitCatEffects(rat, playerEntity, cfg) {
    if (!pouncerHitsCat(rat, playerEntity)) return false;

    if (!rat.hasStunnedCat && playerEntity.stun) {
        playerEntity.stun(cfg.stunDuration);
        rat.hasStunnedCat = true;
    }

    if (!rat._feintConfusedApplied) {
        rat._feintConfusedApplied = true;
        applyConfuseFromFeint(playerEntity, cfg, 1);
        rat.showChatBubble(FEINT_LINES[Math.floor(Math.random() * FEINT_LINES.length)]);
        if (rat.pouncerJumpPhase === 'leap' || rat.pouncerJumpPhase === 'windup') {
            rat.pouncerJumpPhase = 'feint';
            rat.engageTimer = 0;
            rat.feintSign = rat.pouncerCircleSign * (Math.random() < 0.5 ? 1 : -1);
        }
    }
    return true;
}

export function updatePouncerEngage(rat, delta, catPos, playerEntity, senses) {
    const cfg = rat.kindConfig;
    const loseSightDist = (cfg.engageRange ?? 5) + 2.4;
    if (
        !senses.canSee &&
        rat.pouncerJumpPhase === 'circle' &&
        senses.distance > loseSightDist
    ) {
        cancelPouncerEngage(rat);
        return;
    }

    rat.engageTimer += delta;
    const ratPos = rat.ratContainer.position;
    const dist = ratPos.distanceTo(catPos);

    const toCatX = catPos.x - ratPos.x;
    const toCatZ = catPos.z - ratPos.z;
    const toLen = Math.hypot(toCatX, toCatZ) || 1;
    const toCatNormX = toCatX / toLen;
    const toCatNormZ = toCatZ / toLen;

    if (rat.pouncerJumpPhase === 'circle') {
        rat.circleStalkTimer = (rat.circleStalkTimer ?? 0) + delta;
        if (orbitBand(cfg, dist)) {
            rat.bandHoldTimer = (rat.bandHoldTimer ?? 0) + delta;
        } else {
            rat.bandHoldTimer = Math.max(0, (rat.bandHoldTimer ?? 0) - delta * 1.5);
        }

        const sign = rat.pouncerCircleSign;
        const tangentX = -toCatNormZ * sign;
        const tangentZ = toCatNormX * sign;
        const orbit = ((cfg.leapMinDist ?? 2.15) + (cfg.leapMaxDist ?? 3.65)) * 0.5;
        const minLeap = cfg.leapMinDist ?? 2.15;
        const maxLeap = cfg.leapMaxDist ?? 3.65;
        let pull = 0;
        if (dist > maxLeap + 0.2) pull = 0.38;
        else if (dist > orbit + 0.25) pull = 0.18;
        else if (dist < minLeap) pull = -0.55;
        else if (dist < orbit - 0.2) pull = -0.22;
        const moveX = tangentX + toCatNormX * pull;
        const moveZ = tangentZ + toCatNormZ * pull;
        const mLen = Math.hypot(moveX, moveZ) || 1;
        moveRatOnGround(rat, moveX / mLen, moveZ / mLen, cfg.stalkSpeed, delta);
        rat.rotateTowards(catPos, cfg.turnSpeed, delta);

        if (rat.ratModel) {
            rat.ratModel.position.y = 0.1;
        }

        const stalkReady = rat.circleStalkTimer >= (cfg.stalkDuration ?? 0.55);

        if (stalkReady && leapBand(cfg, dist) && (rat.bandHoldTimer ?? 0) >= 0.12) {
            tryHitCatEffects(rat, playerEntity, cfg);
            if (rat.pouncerJumpPhase === 'feint') return;
            rat.pouncerJumpPhase = 'windup';
            rat.engageTimer = 0;
            rat.windupCommitted = leapBand(cfg, dist);
            rat.showChatBubble(rat.pouncerTopic);
        }
        return;
    }

    if (rat.pouncerJumpPhase === 'feint') {
        const sign = rat.feintSign ?? rat.pouncerCircleSign;
        const tangentX = -toCatNormZ * sign;
        const tangentZ = toCatNormX * sign;
        const awayX = -toCatNormX * 0.35;
        const awayZ = -toCatNormZ * 0.35;
        const moveX = tangentX * 0.85 + awayX;
        const moveZ = tangentZ * 0.85 + awayZ;
        const mLen = Math.hypot(moveX, moveZ) || 1;
        moveRatOnGround(rat, moveX / mLen, moveZ / mLen, cfg.burstSpeed * 0.72, delta);
        rat.rotateTowards(catPos, cfg.turnSpeed * 1.35, delta);

        if (rat.ratModel) {
            const hop = Math.sin(rat.engageTimer * 14) * 0.08;
            rat.ratModel.position.y = 0.1 + hop;
        }

        if (rat.engageTimer >= (cfg.feintDuration ?? 0.48)) {
            rat.pouncerJumpPhase = 'circle';
            rat.engageTimer = 0;
            rat.pouncerCircleSign *= -1;
            rat.circleStalkTimer = Math.max(0, (rat.circleStalkTimer ?? 0) - (cfg.stalkDuration ?? 0.55) * 0.35);
        }
        return;
    }

    if (rat.pouncerJumpPhase === 'windup') {
        if (!rat.windupCommitted && !leapBand(cfg, dist)) {
            rat.pouncerJumpPhase = 'circle';
            rat.engageTimer = 0;
            return;
        }
        rat.windupCommitted = true;
        rat.rotateTowards(catPos, cfg.turnSpeed * 1.15, delta);
        if (rat.ratModel) {
            const t = rat.engageTimer / Math.max(cfg.windupDuration, 0.01);
            const coil = Math.sin(Math.min(t, 1) * Math.PI) * 0.12;
            rat.ratModel.position.y = 0.1 - coil * 0.15;
        }

        if (rat.engageTimer >= cfg.windupDuration) {
            rat.pouncerJumpPhase = 'leap';
            rat.leapTimer = 0;
            rat._feintConfusedApplied = false;
        }
        tryHitCatEffects(rat, playerEntity, cfg);
        return;
    }

    if (rat.pouncerJumpPhase === 'leap') {
        rat.leapTimer += delta;
        const t = rat.leapTimer / cfg.jumpDuration;
        moveRatOnGround(rat, toCatNormX, toCatNormZ, cfg.burstSpeed * (1 - t * 0.35), delta);
        rat.rotateTowards(catPos, cfg.turnSpeed * 1.25, delta);

        if (rat.ratModel) {
            const height = Math.sin(Math.min(t, 1) * Math.PI) * cfg.jumpHeight;
            rat.ratModel.position.y = 0.1 + Math.max(0, height);
        }

        tryHitCatEffects(rat, playerEntity, cfg);

        if (t >= 1 || (t > 0.42 && pouncerHitsCat(rat, playerEntity))) {
            finishPouncerEngage(rat, catPos, senses, playerEntity);
        }
    }
}

export function cancelPouncerEngage(rat) {
    rat.isEngaging = false;
    rat.pouncerJumpPhase = 'none';
    rat.state = 'IDLE';
    rat.idleTimer = 0;
    if (rat.ratModel) {
        rat.ratModel.position.y = 0.1;
        rat.ratModel.rotation.z = 0;
    }
}

export function finishPouncerEngage(rat, catPos, senses, playerEntity) {
    const cfg = rat.kindConfig;
    if (rat.ratModel) {
        rat.ratModel.position.y = 0.1;
        rat.ratModel.rotation.z = 0;
    }

    const dist = rat.ratContainer.position.distanceTo(catPos);
    const minLeap = cfg.leapMinDist ?? 2.15;
    const inBand = leapBand(cfg, dist);
    const stillInFight =
        senses?.canSee &&
        dist <= (cfg.engageRange ?? 5) + 0.6 &&
        Math.random() < (cfg.reengageChance ?? 0.65);

    if (stillInFight && (inBand || dist >= minLeap)) {
        rat.isEngaging = true;
        rat.pouncerJumpPhase = 'circle';
        rat.engageTimer = 0;
        rat.circleStalkTimer = inBand ? (cfg.stalkDuration ?? 0.55) * 0.45 : 0;
        rat.bandHoldTimer = inBand ? 0.2 : 0;
        rat.windupCommitted = false;
        rat.pouncerEngageCooldown = cfg.engageCooldown * 0.35;
        rat.threatMeter = 0;
        rat.state = 'ENGAGING';
        rat.showChatBubble(REENGAGE_LINES[Math.floor(Math.random() * REENGAGE_LINES.length)]);
        void playerEntity;
        return;
    }

    if (senses?.canSee && dist < minLeap) {
        rat.isEngaging = true;
        rat.pouncerJumpPhase = 'circle';
        rat.engageTimer = 0;
        rat.circleStalkTimer = 0;
        rat.bandHoldTimer = 0;
        rat.windupCommitted = false;
        rat.state = 'ENGAGING';
        rat.pouncerEngageCooldown = cfg.engageCooldown * 0.25;
        void playerEntity;
        return;
    }

    rat.isEngaging = false;
    rat.pouncerJumpPhase = 'none';
    rat.pouncerEngageCooldown = cfg.engageCooldown;

    const ratPos = rat.ratContainer.position;
    const toCatX = catPos.x - ratPos.x;
    const toCatZ = catPos.z - ratPos.z;
    const toLen = Math.hypot(toCatX, toCatZ) || 1;
    const tangentX = (-toCatZ / toLen) * rat.pouncerCircleSign;
    const tangentZ = (toCatX / toLen) * rat.pouncerCircleSign;
    rat.currentEscapeDir.set(tangentX, 0, tangentZ).normalize();

    rat.isEscaping = true;
    rat.state = 'ESCAPING';
    rat.escapeTimer = 0;
    rat.escapeDelay = cfg.fleeDelay;
    rat.escapeDuration = cfg.braveRetreatDuration ?? cfg.fleeDuration;
    rat.ratSpeed = cfg.fleeSpeed * 0.92;
    rat.markAlerted(1.5);
    rat.threatMeter = Math.max(0, rat.threatMeter - 0.5);
}

export function getAllPouncerTauntPhrases() {
    return [...FEINT_LINES, ...REENGAGE_LINES, ...JUKE_LINES, 'Fake-out!'];
}
