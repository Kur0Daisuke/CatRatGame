/** Scouts deliver cat reports to the yard dog through this. */
let huntDog = null;

export function setHuntDog(dog) {
    huntDog = dog;
}

export function getHuntDog() {
    return huntDog;
}
