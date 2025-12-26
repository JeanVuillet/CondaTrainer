import { state } from '../state.js';

export class StarshipGame {
  constructor(container, controller) {
    this.container = container;
    this.controller = controller;

    this.gameArea = container.querySelector("#starship-game-area");
    this.ship = container.querySelector("#ship");
    this.questionElement = container.querySelector("#question");

    // Boutons
    this.btnLeft = container.querySelector("#btn-left");
    this.btnRight = container.querySelector("#btn-right");
    this.btnFire = container.querySelector("#btn-fire");

    this.missiles = [];
    this.answers = [];
    this.currentQuestion = null;
    this.animationFrameId = null;
    
    this.isLeftPressed = false;
    this.isRightPressed = false;

    // --- IMAGES (Chemins absolus) ---
    // On s'assure que le vaisseau a la bonne image
    if(this.ship) {
        this.ship.style.backgroundImage = "url('/images/ship.png')";
    }

    // --- REGLAGES JEU ---
    this.FALL_DURATION = 24000; 
    this.READING_TIME = 3000;   

    this.bindControls();
  }

  loadQuestion(question) {
    this.currentQuestion = question;
    this.questionElement.textContent = question.q;
    
    // Reset complet avant nouvelle question
    this.clearObjects();
    
    // Lancement
    this.spawnAnswers();
    if (!this.animationFrameId) {
        this.gameLoop();
    }
  }

  bindControls() {
    // --- CLAVIER ---
    const keyHandler = (e, isDown) => {
      if (this.controller.getState().isLocked) return;
      if (e.key === "ArrowLeft") this.isLeftPressed = isDown;
      if (e.key === "ArrowRight") this.isRightPressed = isDown;
      if (isDown && (e.code === "Space" || e.key === "ArrowUp")) {
        e.preventDefault();
        this.shoot();
      }
    };

    document.addEventListener("keydown", (e) => keyHandler(e, true));
    document.addEventListener("keyup", (e) => keyHandler(e, false));

    // --- TACTILE / SOURIS ---
    const bindBtn = (btn, action) => {
        if(!btn) return;
        const start = (e) => { e.preventDefault(); action(true); };
        const end = (e) => { e.preventDefault(); action(false); };
        btn.addEventListener("mousedown", start);
        btn.addEventListener("touchstart", start);
        btn.addEventListener("mouseup", end);
        btn.addEventListener("touchend", end);
        btn.addEventListener("mouseleave", end);
    };

    bindBtn(this.btnLeft, (v) => this.isLeftPressed = v);
    bindBtn(this.btnRight, (v) => this.isRightPressed = v);
    
    // Tir (Click simple)
    const fire = (e) => { e.preventDefault(); if(!this.controller.getState().isLocked) this.shoot(); };
    if(this.btnFire) {
        this.btnFire.addEventListener("mousedown", fire);
        this.btnFire.addEventListener("touchstart", fire);
    }
  }

  moveShip(delta) {
    if(!this.ship) return;
    const currentLeft = parseFloat(this.ship.style.left) || (this.gameArea.offsetWidth / 2);
    const newLeft = currentLeft + delta;
    const maxLeft = this.gameArea.offsetWidth; 
    const safeLeft = Math.max(30, Math.min(maxLeft - 30, newLeft));
    this.ship.style.left = safeLeft + "px";
  }

  shoot() {
    if (this.missiles.length > 5) return;

    const missile = document.createElement("div");
    missile.className = "missile";
    
    // Positionnement
    const shipLeftVal = parseFloat(this.ship.style.left);
    missile.style.left = shipLeftVal + "px"; 
    
    // Calcul position bas (CSS style ou offset)
    const shipBottom = 90; // Valeur fixe définie dans le CSS
    missile.style.bottom = (shipBottom + 50) + "px"; 

    this.gameArea.appendChild(missile);
    this.missiles.push(missile);
  }

  spawnAnswers() {
    const opts = this.currentQuestion.options;
    const n = opts.length;
    const now = performance.now();

    opts.forEach((opt, index) => {
      const answerEl = document.createElement("div");
      answerEl.className = "falling-answer";
      
      const lanePercent = ((index + 1) / (n + 1)) * 100;
      answerEl.style.left = lanePercent + "%";
      answerEl.style.top = "0px"; 
      answerEl.textContent = opt;
      answerEl.dataset.isCorrect = (opt === this.currentQuestion.a) ? "true" : "false";
      
      answerEl.dataset.startTime = now + this.READING_TIME + (Math.random() * 1500); 
      answerEl.dataset.speed = (this.gameArea.offsetHeight) / (this.FALL_DURATION / 16); 

      this.gameArea.appendChild(answerEl);
      this.answers.push(answerEl);
    });
  }

  gameLoop() {
    // Vérification Pause Globale ou Verrouillage
    if (state.isGlobalPaused || this.controller.getState().isLocked) {
        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
        return; 
    }
    this.updateState();
    this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
  }

  updateState() {
    const now = performance.now();
    const shipTop = this.ship.offsetTop; 

    // 1. Mouvement
    const SHIP_SPEED = 8; 
    if (this.isLeftPressed) this.moveShip(-SHIP_SPEED);
    if (this.isRightPressed) this.moveShip(SHIP_SPEED);

    // 2. Réponses
    const safeBottomLimit = this.gameArea.offsetHeight - 85;

    for (let i = this.answers.length - 1; i >= 0; i--) {
      const ans = this.answers[i];
      const startTime = parseFloat(ans.dataset.startTime);
      
      if (now > startTime) {
        const speed = parseFloat(ans.dataset.speed);
        const currentTop = parseFloat(ans.style.top) || 0;
        const newTop = currentTop + speed; 
        ans.style.top = newTop + "px";

        // ECHEC : La bonne réponse dépasse le vaisseau
        if (newTop > shipTop && ans.dataset.isCorrect === "true" && !ans.dataset.passed) {
            ans.dataset.passed = "true"; 
            this.handleLevelFail(); 
            return;
        }

        if (newTop > safeBottomLimit) {
            ans.remove();
            this.answers.splice(i, 1);
        }
      }
    }

    // 3. Missiles & Collisions
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      let bottom = parseFloat(m.style.bottom);
      bottom += 8; 
      m.style.bottom = bottom + "px";

      const mRect = m.getBoundingClientRect();
      let hit = false;

      for (let j = this.answers.length - 1; j >= 0; j--) {
        const ans = this.answers[j];
        const aRect = ans.getBoundingClientRect();

        if (
          mRect.right > aRect.left &&
          mRect.left < aRect.right &&
          mRect.top < aRect.bottom &&
          mRect.bottom > aRect.top
        ) {
          hit = true;
          this.handleCollision(ans);
          ans.remove();
          this.answers.splice(j, 1);
          break; 
        }
      }

      if (hit || bottom > this.gameArea.offsetHeight) {
        m.remove();
        this.missiles.splice(i, 1);
      }
    }
  }

  handleCollision(answerEl) {
    const isCorrect = answerEl.dataset.isCorrect === "true";
    if (isCorrect) {
        this.resetAnimation(false); 
        this.controller.notifyCorrectAnswer();
    } else {
        this.resetAnimation();
        // Le contrôleur gère la perte de vie, on lui envoie juste l'info
        this.controller.notifyWrongAnswer("Mauvaise réponse !");
    }
  }

  handleLevelFail() {
    this.resetAnimation();
    this.controller.notifyWrongAnswer("Tu as raté la bonne réponse !");
  }

  clearObjects() {
    this.answers.forEach(a => a.remove());
    this.missiles.forEach(m => m.remove());
    this.answers = [];
    this.missiles = [];
    this.isLeftPressed = false;
    this.isRightPressed = false;
  }

  resetAnimation(fullClear = true) {
    if (fullClear) this.clearObjects();
  }
}