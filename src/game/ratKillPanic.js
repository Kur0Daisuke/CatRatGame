import * as THREE from 'three';
import { interruptRatConversation, dissolveConversationForVictim } from './ratConversation.js';
import { scatterCouncilMembers } from './ratCouncilResponse.js';
import { cancelPouncerEngage } from './ratPouncer.js';
import { addCatAvoidSpot } from './ratIntel.js';

const PANIC_RADIUS = 11;
const GROUP_CLUSTER_DIST = 4.25;

const NEARBY_KILL = {
    dumb: ['They got one!', 'Run! RUN!', 'The cat killed!', 'Scatter!'],
    scout: ['Fall back — now!', 'Death nearby — move!', 'We are exposed!'],
    pouncer: ['Regroup later — go!', 'Not staying here!', 'Cat fed — flee!']
};

const GROUP_KILL = ['Together — run!', 'Stay close!', 'Do not stop!'];

export function getAllKillPanicPhrases() {
    const set = new Set(GROUP_KILL);
    for (const lines of Object.values(NEARBY_KILL)) {
        for (const line of lines) set.add(line);
    }
    return [...set];
}

function clusterNearbyRats(rats, maxDist) {
    const remaining = rats.slice();
    const clusters = [];

    while (remaining.length > 0) {
        const cluster = [];
        const queue = [remaining.shift()];
        while (queue.length > 0) {
            const r = queue.pop();
            if (!r?.ratContainer || cluster.includes(r)) continue;
            cluster.push(r);
            for (let i = remaining.length - 1; i >= 0; i--) {
                const o = remaining[i];
                if (!o?.ratContainer) continue;
                const d = r.ratContainer.position.distanceTo(o.ratContainer.position);
                if (d <= maxDist) {
                    queue.push(o);
                    remaining.splice(i, 1);
                }
            }
        }
        if (cluster.length) clusters.push(cluster);
    }
    return clusters;
}

function panicLine(rat) {
    const pool = NEARBY_KILL[rat.kind] ?? NEARBY_KILL.dumb;
    return pool[Math.floor(Math.random() * pool.length)];
}

function prepRatForPanic(rat, catPos) {
    interruptRatConversation(rat);
    cancelPouncerEngage(rat);
    rat.isInvestigating = false;
    rat.isEscorting = false;
    rat.isBeingEscorted = false;
    rat.escortPartner = null;
    rat.escortLeader = null;
    rat.threatMeter = 1;
    rat.markAlerted?.(7);
    const now = rat.worldTime ?? 0;
    addCatAvoidSpot(rat, catPos.x, catPos.z, 16, now);
}

function fleeIndividual(rat, catPos) {
    prepRatForPanic(rat, catPos);
    rat.showChatBubble(panicLine(rat));
    rat.beginFlee(catPos, 'panic');
}

function fleeGroup(cluster, catPos, allRats) {
    const scouts = cluster.filter((r) => r.kind === 'scout');
    const pouncers = cluster.filter((r) => r.kind === 'pouncer');
    if (scouts.length > 0 || pouncers.length > 0) {
        for (const r of cluster) prepRatForPanic(r, catPos);
        scatterCouncilMembers(cluster, catPos, allRats);
        return;
    }

    const center = new THREE.Vector3();
    for (const r of cluster) center.add(r.ratContainer.position);
    center.multiplyScalar(1 / cluster.length);

    const away = center.clone().sub(catPos);
    away.y = 0;
    if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    away.normalize();

    cluster.forEach((rat, i) => {
        prepRatForPanic(rat, catPos);
        rat.showChatBubble(
            i === 0
                ? GROUP_KILL[Math.floor(Math.random() * GROUP_KILL.length)]
                : panicLine(rat)
        );
        rat.beginFlee(catPos, 'panic');
        const spread = (i - (cluster.length - 1) * 0.5) * 0.32;
        rat.currentEscapeDir.copy(away).applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
    });
}

/** When a rat is killed/eaten: nearby rats panic-flee in clusters or alone. */
export function triggerKillPanic(victim, catPos, allRats) {
    if (!victim?.ratContainer) return;

    const killPos = victim.ratContainer.position.clone();
    const handled = new Set();

    const convMembers = dissolveConversationForVictim(victim);
    if (convMembers.length > 0) {
        const survivors = convMembers.filter(
            (m) => m !== victim && !m.isConsumed && !m.isPinned && m.ratContainer
        );
        if (survivors.length > 0) {
            for (const r of survivors) prepRatForPanic(r, catPos);
            scatterCouncilMembers(survivors, catPos, allRats);
            survivors.forEach((r) => handled.add(r));
        }
    }

    const nearby = [];
    for (const rat of allRats) {
        if (rat === victim || handled.has(rat)) continue;
        if (!rat.ratContainer || rat.isConsumed || rat.isPinned) continue;
        if (rat.ratContainer.position.distanceTo(killPos) > PANIC_RADIUS) continue;
        nearby.push(rat);
    }

    const clusters = clusterNearbyRats(nearby, GROUP_CLUSTER_DIST);
    for (const cluster of clusters) {
        if (cluster.length >= 2) {
            fleeGroup(cluster, catPos, allRats);
        } else if (cluster[0]) {
            fleeIndividual(cluster[0], catPos);
        }
    }
}
