import * as THREE from 'three';

/** Short world-space line, same idea as the rat chat sprites. */
export class SpeechBubble {
    constructor(parent, { y = 0.9, color = '#f4e2b8' } = {}) {
        this.parent = parent;
        this.y = y;
        this.color = color;
        this.textures = new Map();
        this.sprite = null;
        this.timer = null;
    }

    setHeight(y) {
        this.y = y;
        if (this.sprite) this.sprite.position.y = y;
    }

    say(text, seconds = 2.8) {
        if (!text || !this.parent) return;
        this.hide();
        const material = new THREE.SpriteMaterial({
            map: this.textureFor(text),
            transparent: true,
            depthWrite: false
        });
        this.sprite = new THREE.Sprite(material);
        this.sprite.scale.set(1.7, 0.85, 1);
        this.sprite.position.set(0, this.y, 0);
        this.parent.add(this.sprite);
        this.timer = setTimeout(() => this.hide(), seconds * 1000);
    }

    hide() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.sprite) {
            this.parent.remove(this.sprite);
            this.sprite.material.dispose();
            this.sprite = null;
        }
    }

    textureFor(text) {
        const cached = this.textures.get(text);
        if (cached) return cached;
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = this.color;
        context.beginPath();
        if (context.roundRect) context.roundRect(8, 18, 240, 84, 16);
        else context.rect(8, 18, 240, 84);
        context.fill();
        context.strokeStyle = '#ffffff';
        context.lineWidth = 4;
        context.stroke();
        context.fillStyle = '#1a120c';
        context.font = `bold ${text.length > 28 ? 13 : 15}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 128, 60, 220);
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        this.textures.set(text, texture);
        return texture;
    }
}
