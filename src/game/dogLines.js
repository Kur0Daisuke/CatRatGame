export const DOG_GREET = [
    'Hey, little ones.',
    'Any sign of the cat?',
    'Good rats. Keep sniffing.',
    'I am hunting. Help me out.',
    'Sniff sniff. Where is that cat?'
];

export const RAT_GREET = {
    dumb: ['Hi dog!', 'Please do not step on me.', 'The cat is scary.', 'You smell friendly.'],
    scout: ['I will find the cat for you.', 'Stay put. I will report.', 'Eyes on the garden.', 'I know the way it went.'],
    pouncer: ['We hunt together.', 'I jump, you chase.', 'Point me at the cat.', 'Big teeth. I like it.']
};

export const SCOUT_SEEK_DOG = [
    'Dog! I see the cat!',
    'Hunter, I am coming to you!',
    'Found the cat — hold on!'
];

export const SCOUT_REPORT_DOG = [
    'Exact spot! The cat is there!',
    'Dog, go — that is the cat!',
    'Reporting: cat location locked!'
];

export const DOG_ACK = [
    'Good rat. I am going.',
    'I have the spot. Hunt time.',
    'Stay clear. I will catch it.'
];

export const DOG_CHASE = [
    'There you are, cat!',
    'I am coming for you!',
    'No more hiding!',
    'Got your scent!'
];

export const CAT_CHASE = [
    'The dog knows where I am!',
    'Run — it is hunting me!',
    'A dog?! Not just the rats!'
];

export const DOG_LOST = [
    'Trail went cold.',
    'The cat slipped off.',
    'Where did it go?'
];

export const DOG_CAUGHT = [
    'Got you, cat!',
    'Hold still!',
    'Mine!'
];

export const CAT_CAUGHT = [
    'It has me!',
    'Teeth! Teeth!',
    'No no no!'
];

export const DOG_ESCAPE = [
    'Oof… five seconds…',
    'You slippery cat!',
    'My head is spinning!'
];

export const CAT_ESCAPE = [
    'Got away!',
    'Not today, dog!',
    'Wriggled free!'
];

export const DOG_FAIL = [
    'Too slow, cat!',
    'Still mine!',
    'I have you!'
];

export const CAT_FAIL = [
    'It still has me!',
    'Could not slip out!',
    'The dog hangs on!'
];

export function pickLine(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
}
