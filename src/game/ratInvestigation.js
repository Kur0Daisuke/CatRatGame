import * as THREE from 'three';
import { moveRatOnGround } from './ratMovement.js';
import { interruptRatConversation } from './ratConversation.js';

const POUNCER_SUMMON_RADIUS = 14;
const ARRIVE_DIST = 1.85;
const INVESTIGATE_DURATION = 4.8;
const CAT_ABORT_DIST = 4.25;

const CHECK_LINES = {
    scout: ['All clear… maybe.', 'Tracks here.', 'Cat was right here.'],
    pouncer: ['Nothing moving.', 'Smells like cat.', 'We are exposed.']
};

function findNearestPouncer(scout, allRats, maxDist) {
    const from = scout.ratContainer.position;
    let best = null;
    let bestDist = maxDist;
    for (const other of allRats) {
        if (other === scout || other.kind !== 'pouncer') continue;
        if (other.isConsumed || other.isPinned || other.isEngaging) continue;
        const d = from.distanceTo(other.ratContainer.position);
        if (d < bestDist) {
            bestDist = d;
            best = other;
        }
    }
    return best;
}

export function tryStartScoutInvestigation(scout, catPos, allRats) {
    if (scout.kind !== 'scout' || !scout.ratContainer) return false;
    const pouncer = findNearestPouncer(scout, allRats, POUNCER_SUMMON_RADIUS);
    if (!pouncer) return false;

    interruptRatConversation(scout);
    interruptRatConversation(pouncer);

    const point = catPos.clone();
    point.y = scout.ratContainer.position.y;

    scout.isWarning = false;
    scout.warnTargetRat = null;
    scout.isEscaping = false;
    scout.isInvestigating = true;
    scout.investigatePoint = point.clone();
    scout.investigateTimer = 0;
    scout.investigatePartner = pouncer;
    scout.investigateChatted = false;
    scout.state = 'INVESTIGATING';
    scout.ratSpeed = scout.kindConfig.scoutWarnRunSpeed ?? 1.35;
    scout.markAlerted(5);

    pouncer.isInvestigating = true;
    pouncer.investigatePoint = point.clone();
    pouncer.investigateTimer = 0;
    pouncer.investigatePartner = scout;
    pouncer.investigateChatted = false;
    pouncer.isEngaging = false;
    pouncer.pouncerJumpPhase = 'none';
    pouncer.state = 'INVESTIGATING';
    pouncer.ratSpeed = (pouncer.kindConfig.fleeSpeed ?? 1.5) * 0.88;
    pouncer.markAlerted(4);

    scout.showChatBubble('Pouncer — with me!');
    pouncer.showChatBubble('On it. Checking the spot.');
    return true;
}

function finishInvestigation(rat, catPos, flee) {
    const partner = rat.investigatePartner;
    rat.isInvestigating = false;
    rat.investigatePoint = null;
    rat.investigatePartner = null;
    rat.investigateTimer = 0;
    rat.investigateChatted = false;
    rat.state = 'IDLE';

    if (partner?.isInvestigating && partner.investigatePartner === rat) {
        partner.isInvestigating = false;
        partner.investigatePoint = null;
        partner.investigatePartner = null;
        partner.investigateTimer = 0;
        partner.investigateChatted = false;
        partner.state = 'IDLE';
        if (flee) partner.beginFlee(catPos, 'panic');
    }

    if (flee) rat.beginFlee(catPos, 'panic');
}

export function updateRatInvestigation(rat, delta, catCenter, senses) {
    if (!rat.isInvestigating || rat.state !== 'INVESTIGATING') return false;

    const point = rat.investigatePoint;
    if (!point) {
        finishInvestigation(rat, catCenter, true);
        return true;
    }

    rat.investigateTimer += delta;

    if (senses.canSee && !senses.bushHidden && senses.distance <= CAT_ABORT_DIST) {
        rat.showChatBubble(rat.kind === 'scout' ? 'Cat — go!' : 'Move!');
        finishInvestigation(rat, catCenter, true);
        return true;
    }

    const pos = rat.ratContainer.position;
    const dx = point.x - pos.x;
    const dz = point.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const cfg = rat.kindConfig;

    if (dist > ARRIVE_DIST) {
        moveRatOnGround(rat, dx / dist, dz / dist, rat.ratSpeed ?? 1.2, delta);
        rat.rotateTowards(point, cfg.turnSpeed * 1.55, delta);
    } else {
        rat.rotateTowards(point, cfg.turnSpeed * 1.2, delta);
        if (!rat.investigateChatted && rat.investigateTimer > INVESTIGATE_DURATION * 0.45) {
            rat.investigateChatted = true;
            const pool = CHECK_LINES[rat.kind] ?? CHECK_LINES.scout;
            rat.showChatBubble(pool[Math.floor(Math.random() * pool.length)]);
        }
    }

    const partner = rat.investigatePartner;
    const bothReady =
        rat.investigateTimer >= INVESTIGATE_DURATION &&
        (!partner?.isInvestigating || partner.investigateTimer >= INVESTIGATE_DURATION * 0.85);

    if (bothReady) {
        finishInvestigation(rat, catCenter, true);
    }

    return true;
}

export function getAllInvestigationPhrases() {
    const set = new Set(['Pouncer — with me!', 'On it. Checking the spot.', 'Cat — go!', 'Move!']);
    for (const lines of Object.values(CHECK_LINES)) {
        for (const line of lines) set.add(line);
    }
    return [...set];
}
