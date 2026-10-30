export class StaminaVisual {
    constructor() {
        this.meterEl = document.createElement('div');
        this.meterEl.className = 'stamina-meter';
        this.meterEl.innerHTML = `
          <div class="stamina-meter-label">Stamina</div>
          <div class="stamina-meter-track">
            <div class="stamina-meter-fill"></div>
          </div>
          <div class="stamina-meter-hint"></div>
        `;
        document.body.appendChild(this.meterEl);
        this.meterFill = this.meterEl.querySelector('.stamina-meter-fill');
        this.meterHint = this.meterEl.querySelector('.stamina-meter-hint');
    }

    update(player) {
        const max = player.staminaMax ?? 100;
        const current = player.stamina ?? 0;
        const ratio = max > 0 ? current / max : 0;

        this.meterFill.style.width = `${(ratio * 100).toFixed(1)}%`;
        const exhausted = current <= (player.runMinStamina ?? 0);
        this.meterEl.classList.toggle('stamina-meter--low', exhausted);
        this.meterEl.classList.toggle('stamina-meter--drinking', player.isDrinking);

        if (player.isDrinking) {
            this.meterHint.textContent = 'Drinking…';
        } else if (exhausted) {
            this.meterHint.textContent = 'Find a puddle';
        } else if (ratio < 0.35) {
            this.meterHint.textContent = 'Low — drink water';
        } else {
            this.meterHint.textContent = '';
        }

        this.meterFill.style.background =
            exhausted
                ? 'linear-gradient(90deg, #c45c5c, #8a3030)'
                : ratio < 0.35
                  ? 'linear-gradient(90deg, #ffe58a, #e8a838)'
                  : 'linear-gradient(90deg, #8bcc28, #cdff45)';
    }
}
