import * as THREE from 'three';
import { interruptRatConversation } from './ratConversation.js';
import { beginPouncerEngage } from './ratPouncer.js';
import { moveRatOnGround } from './ratMovement.js';

const CAT_COUNCIL_DIST = 7.5;
const CAT_MEMBER_DIST = 5.2;
const ESCORT_LEASH = 2.35;
const ESCORT_MIN_CAT_DIST = 11;
const ESCORT_DURATION = 9;

const SCOUT_ESCORT_LINES = [
    'Move — I have you!',
    'Stay on my tail!',
    'Cat incoming — follow me!',
    'This way, cousin — hurry!'
];

const DUMB_ESCORT_LINES = [
    'Wait for me!',
    'Scout — slow down!',
    'Is the cat behind us?!',
    'I am scared!'
];

const POUNCER_STALL_LINES = [
    'Cat stays here.',
    'Not one step closer.',
    'I will hold the line.',
    'You want a jump? Come get it.'
];

function findNearestFreeDumb(fromRat, allRats, taken, maxDist) {
    const from = fromRat.ratContainer.position;
    let best = null;
    let bestD = maxDist;
    for (const r of allRats) {
        if (r.kind !== 'dumb' || taken.has(r)) continue;
        if (r.isConsumed || r.isPinned) continue;
        const d = from.distanceTo(r.ratContainer.position);
        if (d < bestD) {
            bestD = d;
            best = r;
        }
    }
    return best;
}

export function getAllCouncilResponsePhrases() {
    return [...SCOUT_ESCORT_LINES, ...DUMB_ESCORT_LINES, ...POUNCER_STALL_LINES];
}

function computeConvCenter(members) {
    const c = new THREE.Vector3(0, 0, 0);
    for (const m of members) c.add(m.ratContainer.position);
    c.multiplyScalar(1 / members.length);
    return c;
}

export function isCouncilThreatenedByCat(conv, catPos) {
    if (!conv?.members?.length) return false;
    const center = computeConvCenter(conv.members);
    if (center.distanceTo(catPos) <= CAT_COUNCIL_DIST) return true;
    return conv.members.some(
        (m) => m.ratContainer && m.ratContainer.position.distanceTo(catPos) <= CAT_MEMBER_DIST
    );
}

export function startScoutEscort(scout, dumb, catPos) {
    if (!scout?.ratContainer || !dumb?.ratContainer) return;
    interruptRatConversation(scout);
    interruptRatConversation(dumb);

    scout.isEscorting = true;
    scout.escortPartner = dumb;
    scout.escortTimer = 0;
    scout.state = 'ESCORTING';
    scout.isEscaping = false;
    scout.isWarning = false;
    scout.markAlerted(6);
    scout.threatMeter = 0.85;

    dumb.isBeingEscorted = true;
    dumb.escortLeader = scout;
    dumb.state = 'ESCORTED';
    dumb.isEscaping = false;
    dumb.threatMeter = 1;

    scout.showChatBubble(SCOUT_ESCORT_LINES[Math.floor(Math.random() * SCOUT_ESCORT_LINES.length)]);
    dumb.showChatBubble(DUMB_ESCORT_LINES[Math.floor(Math.random() * DUMB_ESCORT_LINES.length)]);

    const scoutPos = scout.ratContainer.position;
    const away = scoutPos.clone().sub(catPos);
    away.y = 0;
    if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    away.normalize();
    scout._escortDir = away;
}

export function startPouncerStall(pouncer, catPos) {
    if (!pouncer?.ratContainer) return;
    interruptRatConversation(pouncer);
    pouncer.isEscorting = false;
    pouncer.isBeingEscorted = false;
    pouncer.isEscaping = false;
    pouncer.threatMeter = 0;
    pouncer.pouncerEngageCooldown = 0;
    pouncer.showChatBubble(POUNCER_STALL_LINES[Math.floor(Math.random() * POUNCER_STALL_LINES.length)]);
    beginPouncerEngage(pouncer, catPos);
}

export function scatterCouncilMembers(members, catPos, allRats) {
    const alive = members.filter((m) => m.ratContainer && !m.isConsumed && !m.isPinned);
    const scouts = alive.filter((m) => m.kind === 'scout');
    const pouncers = alive.filter((m) => m.kind === 'pouncer');
    const dumbs = alive.filter((m) => m.kind === 'dumb');
    const takenDumb = new Set();

    for (const scout of scouts) {
        let dumb =
            dumbs.find((d) => !takenDumb.has(d)) ??
            findNearestFreeDumb(scout, allRats, takenDumb, 7);
        if (dumb) {
            takenDumb.add(dumb);
            startScoutEscort(scout, dumb, catPos);
        } else {
            scout.beginFlee(catPos, 'sight');
        }
    }

    for (const pouncer of pouncers) {
        startPouncerStall(pouncer, catPos);
    }

    for (const dumb of dumbs) {
        if (!takenDumb.has(dumb)) dumb.beginFlee(catPos, 'panic');
    }
}

export function updateScoutEscort(scout, delta, catPos) {
    if (!scout.isEscorting || !scout.escortPartner?.ratContainer) {
        scout.isEscorting = false;
        return false;
    }

    const dumb = scout.escortPartner;
    if (dumb.isConsumed || dumb.isPinned) {
        scout.isEscorting = false;
        scout.escortPartner = null;
        dumb.isBeingEscorted = false;
        dumb.escortLeader = null;
        scout.state = 'IDLE';
        scout.beginFlee(catPos, 'sight');
        return true;
    }

    scout.escortTimer += delta;
    const scoutPos = scout.ratContainer.position;
    const cfg = scout.kindConfig;
    let dir = scout._escortDir;
    if (!dir) {
        dir = scoutPos.clone().sub(catPos);
        dir.y = 0;
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
        dir.normalize();
        scout._escortDir = dir;
    }

    const jitter = Math.sin(scout.escortTimer * 4.2) * 0.22;
    const moveX = dir.x * Math.cos(jitter) - dir.z * Math.sin(jitter);
    const moveZ = dir.x * Math.sin(jitter) + dir.z * Math.cos(jitter);
    const speed = (cfg.fleeSpeed ?? 1.6) * 1.05;
    moveRatOnGround(scout, moveX, moveZ, speed, delta);
    scout.rotateTowards(scoutPos.clone().add(dir), cfg.turnSpeed * 1.7, delta);

    const dumbPos = dumb.ratContainer.position;
    const toLeaderX = scoutPos.x - dumbPos.x;
    const toLeaderZ = scoutPos.z - dumbPos.z;
    const toLen = Math.hypot(toLeaderX, toLeaderZ);
    if (toLen > ESCORT_LEASH) {
        moveRatOnGround(dumb, toLeaderX / toLen, toLeaderZ / toLen, cfg.fleeSpeed * 0.95, delta);
    } else {
        moveRatOnGround(dumb, moveX, moveZ, (dumb.kindConfig.fleeSpeed ?? 1) * 0.88, delta);
    }
    dumb.rotateTowards(scoutPos, dumb.kindConfig.turnSpeed * 1.4, delta);

    if (scout.escortTimer > 2.8 && Math.random() < 0.004) {
        scout.showChatBubble(SCOUT_ESCORT_LINES[Math.floor(Math.random() * SCOUT_ESCORT_LINES.length)]);
    }

    const catDist = scoutPos.distanceTo(catPos);
    if (catDist >= ESCORT_MIN_CAT_DIST || scout.escortTimer >= ESCORT_DURATION) {
        scout.isEscorting = false;
        scout.escortPartner = null;
        dumb.isBeingEscorted = false;
        dumb.escortLeader = null;
        scout.state = 'IDLE';
        dumb.state = 'IDLE';
        scout.threatMeter = Math.max(0, scout.threatMeter - 0.4);
        dumb.threatMeter = Math.max(0, dumb.threatMeter - 0.5);
    }

    return true;
}

export function onCatAttacksRat(victim, catPos, allRats) {
    if (!victim || victim.conversationId == null) return;
    const convId = victim.conversationId;
    const allies = allRats.filter(
        (r) => r.conversationId === convId && r !== victim && !r.isConsumed && !r.isPinned
    );
    victim.conversationId = null;
    victim.conversationSlot = 0;
    if (allies.length === 0) return;
    for (const r of allies) {
        r.conversationId = null;
        r.conversationSlot = 0;
    }
    scatterCouncilMembers(allies, catPos, allRats);
}
