(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // ---------- Fullscreen + Crisp Canvas ----------
  function fitCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", fitCanvas);
  fitCanvas();

  // ---------- Game State ----------
  let running = false, gameOver = false;
  let lastTime = 0, spawnTimer = 0, score = 0;
  let pipes = [], particles = [];
  const gravity = 0.35, flapPower = -6.5;
  const GROUND_Y = () => window.innerHeight - 60;

  // ---------- LocalStorage Helpers ----------
  function loadLeaderboard() {
    try {
      return JSON.parse(localStorage.getItem("flappy_leaderboard_v2")) || [];
    } catch {
      return [];
    }
  }

  function saveLeaderboard(data) {
    localStorage.setItem("flappy_leaderboard_v2", JSON.stringify(data));
  }

  let leaderboard = loadLeaderboard();

  // Load saved player info (if available)
  let playerName = localStorage.getItem("flappy_player_name") || "";
  let birdColor = localStorage.getItem("flappy_bird_color") || "#ffd54f";

  // ---------- Bird ----------
  const bird = {
    x: 160,
    y: window.innerHeight / 2,
    r: 14,
    vy: 0,
    flap() {
      if (!running && !gameOver) startGame();
      if (gameOver) return;
      this.vy = flapPower;
      spawnParticles(this.x, this.y + 5);
    },
    update() {
      this.vy += gravity;
      this.y += this.vy;
      if (this.y - this.r < 0) this.y = this.r;
      if (this.y + this.r > GROUND_Y()) {
        this.y = GROUND_Y() - this.r;
        endGame();
      }
    },
    draw() {
      const g = ctx.createRadialGradient(this.x - 5, this.y - 5, 4, this.x, this.y, this.r);
      g.addColorStop(0, "#fff");
      g.addColorStop(1, birdColor);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();

      // Eye
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(this.x + 5, this.y - 5, 3, 0, Math.PI * 2);
      ctx.fill();

      // Beak
      ctx.fillStyle = "#ff7043";
      ctx.beginPath();
      ctx.moveTo(this.x + this.r, this.y);
      ctx.lineTo(this.x + this.r + 10, this.y - 4);
      ctx.lineTo(this.x + this.r + 10, this.y + 4);
      ctx.closePath();
      ctx.fill();

      // Wing
      ctx.fillStyle = "rgba(0,0,0,.15)";
      ctx.beginPath();
      ctx.ellipse(this.x - 6, this.y + 4, 8, 5 + Math.sin(Date.now()/120)*2, 0, 0, Math.PI*2);
      ctx.fill();
    }
  };

  // ---------- Particles ----------
  function spawnParticles(x, y) {
    for (let i = 0; i < 6; i++) {
      particles.push({
        x, y,
        vx: -1 + Math.random() * 2,
        vy: -1 + Math.random() * 1.5,
        life: 25 + Math.random() * 10,
        color: `hsl(${40 + Math.random() * 20}, 100%, 60%)`
      });
    }
  }

  function updateParticles() {
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = p.life / 35;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  // ---------- Pipes ----------
  function makePipe() {
    const gap = 160;
    const minTop = 60;
    const maxTop = GROUND_Y() - gap - 60;
    const top = Math.floor(minTop + Math.random() * (maxTop - minTop));
    return {
      x: window.innerWidth + 20,
      w: 80,
      top,
      gap,
      speed: 3,
      scored: false,
      color: `hsl(${100 + Math.random() * 40}, 70%, 40%)`
    };
  }

  // ---------- Input ----------
  function onPress() {
    if (gameOver) { resetGame(); return; }
    bird.flap();
  }

  window.addEventListener("keydown", e => {
    if (e.code === "Space") { e.preventDefault(); onPress(); }
    if (e.code === "KeyR") resetGame();
  });
  canvas.addEventListener("pointerdown", onPress);

  // ---------- Game Flow ----------
  function startGame() {
    if (!playerName) return showStartMenu();
    running = true;
    document.getElementById("msg").style.opacity = 0;
  }

  function endGame() {
    if (gameOver) return;
    running = false;
    gameOver = true;

    // Update leaderboard
    const existing = leaderboard.find(e => e.name === playerName);
    if (!existing || score > existing.score) {
      if (existing) existing.score = score;
      else leaderboard.push({ name: playerName, score });
    }

    // ✅ Sort by score desc, then alphabetically
    leaderboard.sort((a, b) => {
      if (b.score === a.score) {
        return a.name.localeCompare(b.name);
      }
      return b.score - a.score;
    });

    leaderboard = leaderboard.slice(0, 5);
    saveLeaderboard(leaderboard);

    const msg = document.getElementById("msg");
    msg.innerHTML = buildGameOverHTML(score, leaderboard);
    msg.style.opacity = 1;
  }

  function resetGame() {
    pipes = [];
    particles = [];
    score = 0;
    bird.vy = 0;
    bird.y = window.innerHeight / 2;
    running = false;
    gameOver = false;
    document.getElementById("score").textContent = "0";
    showStartMenu();
  }

  // ---------- Collision ----------
  function collides(b, p) {
    if (b.x + b.r < p.x || b.x - b.r > p.x + p.w) return false;
    if (b.y - b.r < p.top || b.y + b.r > p.top + p.gap) return true;
    return false;
  }

  // ---------- Drawing ----------
  function drawBackground() {
    const grd = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
    grd.addColorStop(0, `hsl(${200 + Math.sin(Date.now() / 1000) * 10}, 80%, 70%)`);
    grd.addColorStop(1, "#bfe9ff");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function drawGround() {
    const y = GROUND_Y();
    const grd = ctx.createLinearGradient(0, y, 0, y + 80);
    grd.addColorStop(0, "#558b2f");
    grd.addColorStop(1, "#33691e");
    ctx.fillStyle = grd;
    ctx.fillRect(0, y, window.innerWidth, window.innerHeight - y);
  }

  function drawPipes() {
    pipes.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, 0, p.w, p.top);
      ctx.fillRect(p.x, p.top + p.gap, p.w, window.innerHeight - (p.top + p.gap));
      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.fillRect(p.x, p.top + p.gap, p.w, 6);
    });
  }

  // ---------- Update + Render ----------
  function update(dt) {
    if (!running || gameOver) return;
    bird.update();
    updateParticles();

    spawnTimer += dt;
    if (spawnTimer > 1400) {
      pipes.push(makePipe());
      spawnTimer = 0;
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= p.speed;

      if (!p.scored && p.x + p.w < bird.x - bird.r) {
        score++;
        p.scored = true;
        document.getElementById("score").textContent = score;
      }

      if (collides(bird, p)) endGame();
      if (p.x + p.w < -10) pipes.splice(i, 1);
    }
  }

  function render() {
    drawBackground();
    drawPipes();
    drawGround();
    drawParticles();
    bird.draw();

    ctx.font = "bold 20px system-ui";
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    if (playerName) ctx.fillText(`${playerName} — ${score}`, window.innerWidth - 16, 30);
  }

  function loop(ts) {
    const dt = ts - (lastTime || ts);
    lastTime = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- UI ----------
  function leaderboardHTML(list) {
    if (!list.length) return "<div>No scores yet!</div>";
    return `<div id="lb">
      ${list.map((p, i) =>
        `<div class="row">
          <span>${["🥇","🥈","🥉","4️⃣","5️⃣"][i] || ""}</span>
          <span class="name">${p.name}</span>
          <span><b>${p.score}</b></span>
        </div>`
      ).join("")}
    </div>`;
  }

  function buildStartHTML() {
    return `
      <h1>🐥 Flipping Bird</h1>
      <div class="row">
        <label>Name</label><br>
        <input id="nameInput" type="text" placeholder="Enter your name" value="${playerName || ""}">
      </div>
      <div class="row">
        <label>Bird Color</label><br>
        <input id="colorInput" type="color" value="${birdColor}">
      </div>
      <button id="startBtn">Start Game</button>
      <div class="row" style="margin-top:14px;"><strong>🏆 Leaderboard</strong></div>
      ${leaderboardHTML(leaderboard)}
    `;
  }

  function buildGameOverHTML(score, list) {
    return `
      <h1>💀 Game Over</h1>
      <div>Score: <b>${score}</b></div>
      <div class="row" style="margin-top:14px;"><strong>🏆 Leaderboard</strong></div>
      ${leaderboardHTML(list)}
      <div class="row" style="margin-top:12px;">Press <b>R</b> or click to restart</div>
    `;
  }

  function showStartMenu() {
    const msg = document.getElementById("msg");
    msg.innerHTML = buildStartHTML();
    msg.style.opacity = 1;

    const startBtn = document.getElementById("startBtn");
    const nameInput = document.getElementById("nameInput");
    const colorInput = document.getElementById("colorInput");

    startBtn.onclick = () => {
      playerName = (nameInput.value || "").trim().substring(0, 25) || "Player";
      birdColor = colorInput.value || "#ffd54f";

      // Save preferences
      localStorage.setItem("flappy_player_name", playerName);
      localStorage.setItem("flappy_bird_color", birdColor);

      msg.style.opacity = 0;
      setTimeout(startGame, 50);
    };
  }

  // ---------- Boot ----------
  showStartMenu();
  requestAnimationFrame(loop);
})();
