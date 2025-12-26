import { state } from '../state.js';

export class JumperGame {
  constructor(container, controller) {
    this.container = container;
    this.controller = controller;
    
    this.area = container.querySelector("#jumper-area");
    this.player = container.querySelector("#player");
    
    this.platStart = container.querySelector("#plat-start");
    this.platChoice = container.querySelector("#plat-choice");
    this.platEnd = container.querySelector("#plat-end");
    this.goalDoor = container.querySelector("#goal-door");
    
    this.qText = container.querySelector("#q-text");
    this.optGrid = container.querySelector("#options-grid");

    this.btnLeft = container.querySelector("#btn-left");
    this.btnRight = container.querySelector("#btn-right");
    this.btnJump = container.querySelector("#btn-jump");

    // Physique
    this.x = 20; this.y = 80; this.vx = 0; this.vy = 0;
    
    this.GRAVITY = 0.6;       
    this.THRUST = 1.0;        
    this.MAX_V_SPEED = 4;     
    this.MOVE_SPEED = 0.55;    
    this.FRICTION = 0.85;     

    this.keys = { left: false, right: false, jump: false };
    this.onGround = true;

    this.colors = [
      { name: "red", hex: "#ef4444" },
      { name: "green", hex: "#22c55e" },
      { name: "orange", hex: "#f97316" },
      { name: "blue", hex: "#3b82f6" }
    ];

    // Images
    this.imgJumper = '/images/jumper.png';
    this.imgJetpack = '/images/jetpack.png';

    this.bindControls();
  }

  loadQuestion(q) {
    this.currentQ = q;
    this.qText.textContent = q.q;
    
    const shuffledOptions = [...q.options].sort(() => 0.5 - Math.random());
    this.optGrid.innerHTML = "";
    this.correctColorIndex = -1;

    shuffledOptions.forEach((opt, idx) => {
      if (idx > 3) return; 
      const colorObj = this.colors[idx];
      const el = document.createElement("div");
      el.className = `opt-badge opt-${colorObj.name}`;
      el.textContent = opt;
      this.optGrid.appendChild(el);

      if (opt === q.a) this.correctColorIndex = idx;
    });

    this.resetPosition();
    if (!this.animId) this.loop();
  }

  resetPosition() {
    this.x = 20; this.y = 80; this.vx = 0; this.vy = 0;
    this.onGround = true;
    this.goalDoor.classList.remove('door-visible');
    this.draw();
  }

  bindControls() {
    const handleKey = (e, isDown) => {
        if(this.controller.getState().isLocked) return;
        if(e.key === "ArrowLeft") this.keys.left = isDown;
        if(e.key === "ArrowRight") this.keys.right = isDown;
        if(e.code === "Space" || e.key === "ArrowUp") this.keys.jump = isDown;
    };
    document.addEventListener("keydown", e => handleKey(e, true));
    document.addEventListener("keyup", e => handleKey(e, false));

    const bindBtn = (btn, key) => {
      if(!btn) return;
      const start = (e) => { e.preventDefault(); this.keys[key] = true; };
      const end = (e) => { e.preventDefault(); this.keys[key] = false; };
      btn.addEventListener("mousedown", start);
      btn.addEventListener("touchstart", start);
      btn.addEventListener("mouseup", end);
      btn.addEventListener("touchend", end);
      btn.addEventListener("mouseleave", end);
    };
    bindBtn(this.btnLeft, "left");
    bindBtn(this.btnRight, "right");
    bindBtn(this.btnJump, "jump");
  }

  loop() {
    // Pause Globale
    if (state.isGlobalPaused || this.controller.getState().isLocked) {
      this.animId = requestAnimationFrame(() => this.loop());
      return;
    }
    this.update();
    this.draw();
    this.animId = requestAnimationFrame(() => this.loop());
  }

  update() {
    // Horizontal
    if (this.keys.left) this.vx -= this.MOVE_SPEED;
    if (this.keys.right) this.vx += this.MOVE_SPEED;
    
    if (!this.keys.left && !this.keys.right) {
        if (this.onGround) this.vx *= 0.5; else this.vx *= this.FRICTION;
        if (Math.abs(this.vx) < 0.1) this.vx = 0;
    }
    if (this.vx > 3) this.vx = 3; if (this.vx < -3) this.vx = -3;
    this.x += this.vx;

    if (this.x < 0) { this.x = 0; this.vx = 0; }
    if (this.x > this.area.offsetWidth - 40) { this.x = this.area.offsetWidth - 40; this.vx = 0; }

    // Vertical
    this.vy -= this.GRAVITY;
    if (this.keys.jump) this.vy += this.THRUST; 
    if (this.vy > this.MAX_V_SPEED) this.vy = this.MAX_V_SPEED;
    this.y += this.vy;
    
    const maxY = this.area.offsetHeight - 40;
    if (this.y > maxY) { this.y = maxY; this.vy = -0.5; }

    // Collisions
    this.onGround = false; 
    const platforms = [
      { el: this.platStart, type: 'safe' },
      { el: this.platChoice, type: 'choice' },
      { el: this.platEnd, type: 'safe' }
    ];

    if (this.vy <= 0) { 
      platforms.forEach(p => {
        if(!p.el) return;
        const rect = p.el.getBoundingClientRect();
        const areaRect = this.area.getBoundingClientRect();
        
        const platLeft = rect.left - areaRect.left;
        const platRight = rect.right - areaRect.left;
        const platTop = areaRect.bottom - rect.top; 

        if (this.x + 30 > platLeft && this.x + 10 < platRight) {
          if (this.y <= platTop && this.y + 20 >= platTop) {
            
            // COULEUR
            if (p.type === 'choice') {
              const width = platRight - platLeft;
              const segmentWidth = width / 4;
              const playerCenter = (this.x + 20) - platLeft;
              const segmentIndex = Math.floor(playerCenter / segmentWidth);

              if (segmentIndex !== this.correctColorIndex) return; // Tombe
              this.goalDoor.classList.add('door-visible');
            }

            this.y = platTop;
            this.vy = 0;
            this.onGround = true; 
          }
        }
      });
    }

    // Mort
    if (this.y < -50) {
      this.controller.notifyWrongAnswer("Tombé !");
      this.resetPosition();
    }

    // Victoire
    if (this.goalDoor.classList.contains('door-visible')) {
        const doorRect = this.goalDoor.getBoundingClientRect();
        const areaRect = this.area.getBoundingClientRect();
        const doorLeft = doorRect.left - areaRect.left;
        const doorRight = doorRect.right - areaRect.left;
        const doorBottom = areaRect.bottom - doorRect.bottom;

        if (this.x + 30 > doorLeft && this.x + 10 < doorRight && this.y <= doorBottom + 60 && this.y >= doorBottom) {
          this.controller.notifyCorrectAnswer();
          this.resetPosition();
        }
    }
  }

  draw() {
    this.player.style.left = this.x + "px";
    this.player.style.bottom = this.y + "px";
    
    const bgUrl = this.onGround ? this.imgJumper : this.imgJetpack;
    this.player.style.backgroundImage = `url('${bgUrl}')`;

    if (this.vx > 0.1) this.player.style.transform = "scaleX(1)";
    else if (this.vx < -0.1) this.player.style.transform = "scaleX(-1)";
  }
}