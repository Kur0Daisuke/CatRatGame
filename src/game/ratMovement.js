import { clampPositionToArena, deflectDirFromArenaEdge } from '../core/collision.js';

export function moveRatOnGround(rat, dirX, dirZ, speed, delta) {
    const pos = rat.ratContainer.position;
    const deflected = deflectDirFromArenaEdge(pos.x, pos.z, dirX, dirZ);
    pos.x += deflected.x * speed * delta;
    pos.z += deflected.z * speed * delta;
    clampPositionToArena(pos);
}
