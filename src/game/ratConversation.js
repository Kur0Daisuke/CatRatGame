import * as THREE from 'three';
import { applyTerrainPose } from '../core/collision.js';
import { moveRatOnGround } from './ratMovement.js';
import {
    isCouncilThreatenedByCat,
    scatterCouncilMembers
} from './ratCouncilResponse.js';

export const RAT_KIND_DEBUG_COLOR = {
    dumb: 0x44dd88,
    scout: 0x5599ff,
    pouncer: 0xff8833
};

const MEET_DISTANCE = 2.45;
const JOIN_DISTANCE = 4.8;
const CIRCLE_RADIUS = 1.05;
const MIN_DURATION = 5.5;
const MAX_DURATION = 11;
const LINE_INTERVAL_MIN = 2.2;
const LINE_INTERVAL_MAX = 3.8;

const CHAT = {
    dumb: {
        general: [
            'Found a crumb!',
            'Is that rain?',
            'My whiskers are tingling…',
            'Nice patch of dirt.',
            'Anyone seen the cat? …anyone?'
        ],
        pair_dumb: ['Share the crumb?', 'You smell like cheese.', 'Let us nap here.'],
        pair_scout: ['You always paranoid.', 'Is the cat real?', 'Tell me again about the fence.'],
        pair_pouncer: ['Stop flexing.', 'You jump too much.', 'Guard me? …please?'],
        group: ['Circle up!', 'Safety in numbers.', 'Did someone say food?']
    },
    scout: {
        general: [
            'Perimeter clear… I think.',
            'Wind shifted — cat smell?',
            'I will check the bushes.',
            'Report: all quiet. For now.'
        ],
        pair_dumb: ['Stay alert, cousin.', 'Cat tracks that way.', 'Do not wander off.'],
        pair_scout: ['Swap patrol routes?', 'Heard something by the gate.', 'Eyes up, sister.'],
        pair_pouncer: ['You jump, I watch.', 'Cover me while I scout.', 'Do not stun the dumb ones.'],
        group: ['Gather round — briefing!', 'Cat was spotted earlier.', 'Spread the word!']
    },
    pouncer: {
        general: [
            'Leg day.',
            'I could take the cat.',
            'This dumb rat owes me.',
            'Stretching… then pounce.'
        ],
        pair_dumb: ['Stay close. I got you.', 'Stop squeaking so loud.', 'Eat faster.'],
        pair_scout: ['Your intel better be good.', 'Point me at the cat.', 'Less chat, more jump.'],
        pair_pouncer: ['Race you to the fence.', 'Bet I stun it first.', 'Sync leap on three?'],
        group: ['Form up!', 'Who wants a demo jump?', 'Nobody panic — unless cat.']
    }
};

export function getAllConversationPhrases() {
    const set = new Set();
    for (const kind of Object.keys(CHAT)) {
        const block = CHAT[kind];
        for (const key of Object.keys(block)) {
            for (const line of block[key]) set.add(line);
        }
    }
    return [...set];
}

const _center = new THREE.Vector3();
const _slot = new THREE.Vector3();
const conversations = [];
let nextConversationId = 1;

const PANIC_ON_EAT = {
    dumb: ['NOOO!', 'Run! RUN!', 'We are dead!', 'Cat got one!'],
    scout: ['Abort! Cat!', 'Scatter — now!', 'It is eating!'],
    pouncer: ['Not on my watch!', 'Back off, cat!', 'Everyone flee!']
};

function canSocialize(rat) {
    if (!rat?.ratModel || rat.isConsumed || rat.isPinned) return false;
    if (rat.isEscorting || rat.isBeingEscorted) return false;
    if (rat.isEscaping || rat.isEngaging || rat.isWarning || rat.isInvestigating) return false;
    if (rat.threatMeter > 0.42 || rat.isAlerted) return false;
    if (rat.conversationId != null) return true;
    return rat.state === 'IDLE' || rat.state === 'WALKING' || rat.state === 'TURNING' || rat.state === 'CHATTING';
}

function pickLine(speaker, members) {
    const block = CHAT[speaker.kind] ?? CHAT.dumb;
    const others = members.filter((m) => m !== speaker);
    if (members.length >= 3) {
        const pool = block.group;
        return pool[Math.floor(Math.random() * pool.length)];
    }
    if (others.length === 0) {
        const pool = block.general;
        return pool[Math.floor(Math.random() * pool.length)];
    }
    const other = others[0];
    const key =
        other.kind === 'dumb'
            ? 'pair_dumb'
            : other.kind === 'scout'
              ? 'pair_scout'
              : 'pair_pouncer';
    const pool = block[key] ?? block.general;
    return pool[Math.floor(Math.random() * pool.length)];
}

function computeCenter(members) {
    _center.set(0, 0, 0);
    for (const m of members) {
        _center.add(m.ratContainer.position);
    }
    _center.multiplyScalar(1 / members.length);
    return _center.clone();
}

function gatherMembers(seedRats, allRats) {
    const center = computeCenter(seedRats);
    const members = new Map();
    for (const r of seedRats) members.set(r, true);
    for (const r of allRats) {
        if (!canSocialize(r) || members.has(r)) continue;
        if (r.conversationId != null) continue;
        const d = r.ratContainer.position.distanceTo(center);
        if (d <= JOIN_DISTANCE) members.set(r, true);
    }
    return [...members.keys()];
}

function leaveConversation(rat) {
    rat.conversationId = null;
    rat.conversationSlot = 0;
    if (rat.state === 'CHATTING') {
        rat.state = 'IDLE';
        rat.idleTimer = 0;
    }
}

function dissolveConversation(conv) {
    for (const r of conv.members) leaveConversation(r);
    const idx = conversations.indexOf(conv);
    if (idx >= 0) conversations.splice(idx, 1);
}

function startConversation(members) {
    if (members.length < 2) return;
    const id = nextConversationId++;
    const center = computeCenter(members);
    const conv = {
        id,
        members,
        center,
        elapsed: 0,
        duration: MIN_DURATION + Math.random() * (MAX_DURATION - MIN_DURATION),
        nextLineIn: 0.8 + Math.random() * 1.2,
        speakerIndex: 0
    };
    conversations.push(conv);
    members.forEach((rat, i) => {
        rat.conversationId = id;
        rat.conversationSlot = i;
        rat.state = 'CHATTING';
        rat.hideChat?.();
    });
}

function layoutCircle(conv, delta) {
    const n = conv.members.length;
    conv.center.copy(computeCenter(conv.members));
    const angleStep = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
        const rat = conv.members[i];
        if (!rat.ratContainer) continue;
        const angle = angleStep * i + conv.elapsed * 0.08;
        _slot.set(
            conv.center.x + Math.sin(angle) * CIRCLE_RADIUS,
            conv.center.y,
            conv.center.z + Math.cos(angle) * CIRCLE_RADIUS
        );
        const pos = rat.ratContainer.position;
        const dx = _slot.x - pos.x;
        const dz = _slot.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.08) {
            const speed = Math.min(1.15, dist * 2.2);
            moveRatOnGround(rat, dx / dist, dz / dist, speed, delta);
        }
        rat.rotateTowards(conv.center, rat.kindConfig.turnSpeed * 1.35, delta);
        applyTerrainPose(rat.ratContainer, rat.headingYaw, 0, delta);
    }
}

function tryStartNewConversations(allRats) {
    for (let i = 0; i < allRats.length; i++) {
        const a = allRats[i];
        if (!canSocialize(a) || a.conversationId != null) continue;
        for (let j = i + 1; j < allRats.length; j++) {
            const b = allRats[j];
            if (!canSocialize(b) || b.conversationId != null) continue;
            const dist = a.ratContainer.position.distanceTo(b.ratContainer.position);
            if (dist > MEET_DISTANCE) continue;
            const members = gatherMembers([a, b], allRats);
            if (members.length >= 2) {
                startConversation(members);
                return;
            }
        }
    }
}

export function updateRatConversations(allRats, delta, catPos = null) {
    for (let c = conversations.length - 1; c >= 0; c--) {
        const conv = conversations[c];
        conv.members = conv.members.filter((r) => !r.isConsumed && r.ratContainer);
        if (conv.members.length < 2) {
            dissolveConversation(conv);
            continue;
        }

        if (catPos && isCouncilThreatenedByCat(conv, catPos)) {
            const members = [...conv.members];
            dissolveConversation(conv);
            scatterCouncilMembers(members, catPos, allRats);
            continue;
        }

        const broken = conv.members.some(
            (r) =>
                !canSocialize(r) ||
                r.conversationId !== conv.id ||
                r.threatMeter > 0.5 ||
                r.isEscaping ||
                r.isEngaging ||
                r.isWarning ||
                r.isInvestigating ||
                r.isEscorting ||
                r.isBeingEscorted
        );
        if (broken || conv.elapsed >= conv.duration) {
            dissolveConversation(conv);
            continue;
        }

        conv.elapsed += delta;
        layoutCircle(conv, delta);

        conv.nextLineIn -= delta;
        if (conv.nextLineIn <= 0) {
            conv.nextLineIn = LINE_INTERVAL_MIN + Math.random() * (LINE_INTERVAL_MAX - LINE_INTERVAL_MIN);
            const speaker = conv.members[conv.speakerIndex % conv.members.length];
            conv.speakerIndex += 1;
            if (speaker?.showChatBubble) {
                const line = pickLine(speaker, conv.members);
                speaker.showChatBubble(line);
                speaker.isSpeaking = true;
            }
        }
    }

    if (conversations.length < Math.ceil(allRats.length / 6)) {
        tryStartNewConversations(allRats);
    }
}

export function interruptRatConversation(rat) {
    if (rat.conversationId == null) return;
    const conv = conversations.find((c) => c.id === rat.conversationId);
    if (conv) dissolveConversation(conv);
    else leaveConversation(rat);
}

/** Dissolve the victim's circle chat and return former members (if any). */
export function dissolveConversationForVictim(victim) {
    if (!victim || victim.conversationId == null) return [];
    const conv = conversations.find((c) => c.id === victim.conversationId);
    if (!conv) {
        leaveConversation(victim);
        return [];
    }
    const members = [...conv.members];
    dissolveConversation(conv);
    return members;
}

export function getAllEatPanicPhrases() {
    const set = new Set();
    for (const lines of Object.values(PANIC_ON_EAT)) {
        for (const line of lines) set.add(line);
    }
    return [...set];
}
