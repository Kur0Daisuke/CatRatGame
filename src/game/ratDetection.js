import {

    computePerceivedDecibels,

    canRatHearCat,

    HEARING_THRESHOLD,

    PANIC_HEARD_DB

} from '../systems/catSound.js';

import { isPointInVisionConeFromYaw } from './ratVision.js';

import { getRatKindConfig } from './ratConfig.js';

import { nearestAvoidSpot } from './ratIntel.js';



/**

 * Unified cat sensing: vision cone, hearing (distance + loudness), and proximity.

 */

export function senseCat(rat, playerEntity, now) {

    const cfg = rat.kindConfig ?? getRatKindConfig(rat.kind);

    const ratPos = rat.ratContainer.position;

    const eyePos = rat._worldPosition ?? ratPos;

    const catCenter = playerEntity.aerialSphere.center;

    const distance = ratPos.distanceTo(catCenter);

    const catHiddenInBush = playerEntity.bushCoverActive === true;
    const catHiddenInTree = playerEntity.isTreePerched === true;
    const catConcealed = catHiddenInBush || catHiddenInTree;



    const sourceDecibels = playerEntity.soundDecibel ?? 0;

    const perceivedDecibels = computePerceivedDecibels(sourceDecibels, distance);

    const hearThreshold = HEARING_THRESHOLD / cfg.hearingSensitivity;

    const canHear =

        canRatHearCat(perceivedDecibels, distance, sourceDecibels) &&

        perceivedDecibels >= hearThreshold;



    const visionRange = cfg.visionRange + 0.35;

    const headingYaw = rat.headingYaw ?? 0;



    let canSee = false;

    if (!catConcealed && distance <= visionRange + 0.5) {

        canSee = isPointInVisionConeFromYaw(

            eyePos,

            headingYaw,

            catCenter,

            visionRange,

            cfg.visionHalfAngleDeg

        );

        if (!canSee && distance <= cfg.proximityRange + 0.65) {

            canSee = isPointInVisionConeFromYaw(

                eyePos,

                headingYaw,

                catCenter,

                visionRange + 0.25,

                Math.max(cfg.visionHalfAngleDeg, 58)

            );

        }

    }



    const proximity =
        !catConcealed &&
        distance <= cfg.proximityRange &&
        (canSee || (canHear && perceivedDecibels >= hearThreshold + 4));



    const avoidInfo = nearestAvoidSpot(rat.avoidSpots, ratPos, now);

    const avoidNear =

        avoidInfo &&

        avoidInfo.distance < Math.max(cfg.proximityRange * 1.2, 5);



    return {

        distance,

        perceivedDecibels,

        sourceDecibels,

        canHear,

        canSee,

        bushHidden: catConcealed,

        proximity,

        avoidNear,

        avoidInfo

    };

}



export function threatLevelFromSenses(rat, senses, directCollision) {

    const cfg = rat.kindConfig ?? getRatKindConfig(rat.kind);

    if (directCollision) return 1;

    if (senses.bushHidden) {
        let level = 0;
        if (senses.canHear && senses.perceivedDecibels >= cfg.panicHearingDb + 8) level += 0.12;
        return Math.min(0.22, level);
    }

    let level = 0;

    if (senses.canSee) level += 0.62;

    if (senses.proximity) level += 0.38;

    if (senses.canHear && senses.perceivedDecibels >= cfg.panicHearingDb) level += 0.45;

    else if (senses.canHear && senses.perceivedDecibels >= cfg.alertHearingDb) level += 0.22;

    if (senses.avoidNear) level += 0.4;



    if (rat.kind === 'dumb') {

        if (senses.canSee && senses.distance <= cfg.proximityRange + 0.35) level += 0.18;

        level *= 0.58;

        if (senses.canHear && senses.perceivedDecibels < cfg.panicHearingDb) level *= 0.68;

    }

    if (rat.kind === 'scout' && senses.canSee && !rat.isWarning) level += 0.15;

    if (rat.kind === 'pouncer') {

        level -= 0.18;

        if (senses.canSee && senses.distance <= (cfg.engageRange ?? 4.5)) level *= 0.42;

        else if (senses.canSee || senses.canHear) level *= 0.75;

    }



    return Math.min(1, Math.max(0, level));

}



export function shouldFleeNow(rat, senses, threatLevel, directCollision) {

    const cfg = rat.kindConfig ?? getRatKindConfig(rat.kind);

    if (directCollision) return true;



    if (rat.kind === 'scout') {

        const fleeDist = cfg.scoutFleeDist ?? 3.15;

        if (senses.distance <= fleeDist && (senses.canSee || senses.proximity)) return true;

        if (senses.perceivedDecibels >= PANIC_HEARD_DB && senses.canHear) return true;

        if (senses.avoidNear && threatLevel >= 0.55) return true;

        return rat.threatMeter >= 1;

    }



    if (rat.kind === 'pouncer') {

        if (rat.isEngaging || rat.isInvestigating) return false;

        if (directCollision) return true;

        const fleeDist = cfg.braveFleeMaxDist ?? 1.45;

        if (senses.distance <= fleeDist && senses.proximity) return true;

        if (

            senses.perceivedDecibels >= PANIC_HEARD_DB + 6 &&

            senses.canHear &&

            senses.distance < 2.4

        ) {

            return true;

        }

        if (rat.threatMeter >= 1.4) return true;

        return false;

    }



    if (threatLevel >= 0.92) return true;

    if (senses.canSee && rat.kind !== 'dumb') return threatLevel >= 0.48;

    if (senses.canSee && rat.kind === 'dumb' && senses.distance <= cfg.proximityRange + 0.5) {

        return rat.threatMeter >= 0.82;

    }

    if (senses.canSee && rat.kind === 'dumb' && senses.distance <= cfg.visionRange) {

        return rat.threatMeter >= 0.95;

    }

    if (senses.perceivedDecibels >= PANIC_HEARD_DB && senses.canHear) {

        if (rat.kind === 'dumb' && senses.distance > cfg.proximityRange + 0.8) {

            return rat.threatMeter >= 1;

        }

        return true;

    }

    if (senses.avoidNear && threatLevel >= 0.35) return true;

    return rat.threatMeter >= 1;

}



/** Cat has this pouncer in pounce aim and is charging E. */

export function shouldPouncerBreakCatAim(rat, playerEntity, senses) {

    if (rat.kind !== 'pouncer') return false;

    if (rat.isEngaging || rat.isPinned || rat.isEscaping) return false;

    if (playerEntity.pounceAimRat !== rat) return false;

    const charge = playerEntity.pounceAimCharge ?? 0;

    if (charge < 0.08) return false;

    if (senses.bushHidden) return false;

    if (senses.distance > 3.2) return false;

    return senses.canSee || senses.proximity;

}


