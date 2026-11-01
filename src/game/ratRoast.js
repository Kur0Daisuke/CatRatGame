const ROAST_LINES = {
    dumb: [
        'Ha! Missed!',
        'Clumsy cat!',
        'You need nine lives for that aim.',
        'Too slow, whiskers!'
    ],
    scout: [
        'Skill issue.',
        'My grandma pounces better.',
        'Logged: cat = bad.',
        'Try again — you will miss again.'
    ],
    pouncer: [
        'Weak leap.',
        'You call that a pounce?',
        'I have seen fleas jump higher.',
        'Embarrassing.'
    ]
};

export function getAllRoastPhrases() {
    const set = new Set();
    for (const lines of Object.values(ROAST_LINES)) {
        for (const line of lines) set.add(line);
    }
    return [...set];
}

export function releaseAfterMiss(rat, catPos) {
    rat.isPinned = false;
    rat.isFlipping = false;
    rat.flipProgress = 0;
    rat.isEscaping = false;
    if (rat.ratModel) {
        rat.ratModel.rotation.x = 0;
        rat.ratModel.position.y = 0.1;
    }
    rat.hasStunnedCat = false;

    const pool = ROAST_LINES[rat.kind] ?? ROAST_LINES.dumb;
    const line = pool[Math.floor(Math.random() * pool.length)];
    rat.state = 'ROASTING';
    rat.roastTimer = 1.35;
    rat.roastFleeFrom = catPos.clone();
    rat.showChatBubble(line);
}

export function updateRoast(rat, delta) {
    if (rat.state !== 'ROASTING') return false;
    rat.roastTimer -= delta;
    if (rat.roastTimer > 0) return true;

    const fleeFrom = rat.roastFleeFrom;
    rat.roastFleeFrom = null;
    rat.state = 'IDLE';
    if (fleeFrom) rat.beginFlee(fleeFrom, 'panic');
    return true;
}
