(function () {
  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const cursor = document.getElementById("cursor");

  const ROPE_A_Y = 60;
  const ROPE_B_Y = 180;
  const isMobile = window.innerWidth < 768;
  const ropeX0 = isMobile ? 15 : 30;

  // Simple helper utilities
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function lerpColor(c1, c2, t) {
    return [
      Math.round(lerp(c1[0], c2[0], t)),
      Math.round(lerp(c1[1], c2[1], t)),
      Math.round(lerp(c1[2], c2[2], t)),
    ];
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Define two simple ropes as arrays of segment "densities" (arbitrary units)
  // Higher numbers mean visually denser (darker) sections
  const ropeA = [0.4, 1.6, 0.8, 1.2, 0.6, 1.8, 0.9, 1.1];
  const ropeB = [1.2, 0.7, 1.4, 0.5, 1.9, 0.8, 1.1, 0.6];

  // ----- Interaction: clickable ends with simple context menu -----
  const state = {
    ropes: [
      { left: { mode: "none" }, right: { mode: "none" } },
      { left: { mode: "none" }, right: { mode: "none" } },
    ],
  };

  // ----- Simple burn simulation -----
  const TOTAL_SINGLE_END_TIME_MIN = 60;

  function normalizeSegments(times) {
    const sum = times.reduce((a, b) => a + b, 0);
    if (sum === 0) return times.slice();
    const scale = TOTAL_SINGLE_END_TIME_MIN / sum;
    return times.map((t) => t * scale);
  }

  const profile = [normalizeSegments(ropeA), normalizeSegments(ropeB)];

  function createRopeState(idx) {
    const n = profile[idx].length;
    return {
      leftActive: false,
      rightActive: false,
      leftIndex: 0,
      rightIndex: n - 1,
      leftConsumed: 0, // [0, L]
      rightConsumed: 0,
      completed: false,
    };
  }

  const sim = {
    ropes: [createRopeState(0), createRopeState(1)],
    running: false,
    lastTs: null,
    elapsedMinutes: 0,
  };

  let notified45 = false;

  function resetSim() {
    sim.ropes[0] = createRopeState(0);
    sim.ropes[1] = createRopeState(1);
    sim.running = false;
    sim.lastTs = null;
    sim.elapsedMinutes = 0;
    updateClock();
    notified45 = false;
    const t = document.getElementById("toast45");
    if (t) t.style.display = "none";
  }

  function light(ropeIdx, side) {
    const r = sim.ropes[ropeIdx];
    if (r.completed) return;
    if (side === "left" || side === "both") r.leftActive = true;
    if (side === "right" || side === "both") r.rightActive = true;
  }

  function anyActiveEnds() {
    return (
      sim.ropes[0].leftActive ||
      sim.ropes[0].rightActive ||
      sim.ropes[1].leftActive ||
      sim.ropes[1].rightActive
    );
  }

  function stepRope(ropeIdx, dtMinutes) {
    const r = sim.ropes[ropeIdx];
    if (r.completed) return;
    const times = profile[ropeIdx];
    const n = times.length;
    const L = 1 / n; // segment length

    // advance left
    if (r.leftActive && r.leftIndex <= r.rightIndex) {
      const segTime = times[r.leftIndex];
      const speed = L / segTime; // length per minute
      r.leftConsumed += speed * dtMinutes;
      while (r.leftConsumed >= L && r.leftIndex < r.rightIndex) {
        r.leftConsumed -= L;
        r.leftIndex += 1;
      }
    }

    // advance right
    if (r.rightActive && r.rightIndex >= r.leftIndex) {
      const segTime = times[r.rightIndex];
      const speed = L / segTime;
      r.rightConsumed += speed * dtMinutes;
      while (r.rightConsumed >= L && r.rightIndex > r.leftIndex) {
        r.rightConsumed -= L;
        r.rightIndex -= 1;
      }
    }

    // completion check
    if (
      r.leftIndex > r.rightIndex ||
      (r.leftIndex === r.rightIndex && r.leftConsumed + r.rightConsumed >= L)
    ) {
      r.completed = true;
      r.leftActive = false;
      r.rightActive = false;
      onRopeComplete(ropeIdx);
    }
  }

  function onRopeComplete(doneIdx) {
    const other = doneIdx === 0 ? 1 : 0;
    // Trigger any waiting ends on the other rope
    ["left", "right"].forEach((side) => {
      if (state.ropes[other][side].mode === "wait") {
        state.ropes[other][side].mode = "now";
        light(other, side);
      }
    });
  }

  function drawRope(y, segments, label) {
    const width = canvas.clientWidth - ropeX0 * 2; // draw in CSS pixels
    const x0 = ropeX0;
    const height = 40;

    // Background rail
    roundRect(ctx, x0, y, width, height, 8);
    ctx.fillStyle = "#0a0f14";
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Draw density segments across the rope width
    const n = segments.length;
    const segW = width / n;
    let x = x0;
    for (let i = 0; i < n; i++) {
      const d = clamp(segments[i], 0, 2);
      // map density to a slate-ish gradient range
      const c = lerpColor([51, 65, 85], [148, 163, 184], clamp(d / 1.6, 0, 1));
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.9)`;
      ctx.fillRect(x, y, segW, height);
      x += segW;
    }

    // Label
    ctx.fillStyle = "#9aa7b2";
    ctx.font = "16px Arial";
    ctx.textAlign = "left";
    ctx.fontStretch = "normal";
    ctx.fillText(label, x0, y - 10);

    // Burn progress and flames
    const idx = label === "Rope A" ? 0 : 1;
    drawBurnProgress(x0, y, width, height, idx);

    // End markers
    const cy = y + height / 2;
    drawEndMarker(x0, cy, getEndMode(idx, "left"));
    drawEndMarker(x0 + width, cy, getEndMode(idx, "right"));
  }

  function render() {
    syncCanvasToCssSize();
    // Clear using CSS pixel coords (transform set to DPR)
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    drawRope(ROPE_A_Y, ropeA, "Rope A");
    drawRope(ROPE_B_Y, ropeB, "Rope B");
    updateClock();
  }

  render();

  window.addEventListener("resize", render);

  function getEndMode(ropeIdx, side) {
    const m = state.ropes[ropeIdx][side].mode;
    return m === "now" || m === "wait" ? m : "none";
  }

  function drawEndMarker(x, y, mode) {
    const r = 10;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (mode === "now") ctx.fillStyle = "#ffb14f"; // accent-2
    else if (mode === "wait") ctx.fillStyle = "#4fb3ff"; // accent
    else ctx.fillStyle = "#475569"; // muted slate
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1f2937";
    ctx.stroke();
  }

  function drawBurnProgress(x0, y, width, height, ropeIdx) {
    const r = sim.ropes[ropeIdx];
    const times = profile[ropeIdx];
    const n = times.length;
    const L = 1 / n;

    const leftFrac = Math.min(r.leftIndex * L + Math.min(r.leftConsumed, L), 1);
    const rightFrac = Math.min(
      (n - 1 - r.rightIndex) * L + Math.min(r.rightConsumed, L),
      1
    );

    // Burnt overlays (draw from left and right separately)
    if (leftFrac > 0) {
      ctx.fillStyle = "rgba(15,20,26,0.9)";
      ctx.fillRect(x0, y, width * leftFrac, height);
    }
    if (rightFrac > 0) {
      ctx.fillStyle = "rgba(15,20,26,0.9)";
      ctx.fillRect(
        x0 + width - width * rightFrac,
        y,
        width * rightFrac,
        height
      );
    }

    // Flames
    if (!r.completed) {
      if (r.leftActive) {
        const lx = x0 + (r.leftIndex * L + Math.min(r.leftConsumed, L)) * width;
        drawFlame(lx, y + height / 2);
      }
      if (r.rightActive) {
        const rx =
          x0 +
          width -
          ((n - 1 - r.rightIndex) * L + Math.min(r.rightConsumed, L)) * width;
        drawFlame(rx, y + height / 2);
      }
    }
  }

  function drawFlame(x, y) {
    ctx.save();
    ctx.translate(x, y);
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    grd.addColorStop(0, "rgba(255,225,130,1)");
    grd.addColorStop(0.6, "rgba(255,153,0,0.9)");
    grd.addColorStop(1, "rgba(255,120,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function geomForRope(ropeIdx) {
    const y = ropeIdx === 0 ? ROPE_A_Y : ROPE_B_Y;
    const x0 = ropeX0;
    const width = canvas.clientWidth - ropeX0 * 2; // CSS pixels
    const height = 40;
    const cy = y + height / 2;
    return { x0, width, height, y, cy, leftX: x0, rightX: x0 + width };
  }

  function hitTestEnd(mx, my) {
    const R = 16; // hit radius
    for (let ropeIdx = 0; ropeIdx < 2; ropeIdx++) {
      const g = geomForRope(ropeIdx);
      const ends = [
        { side: "left", x: g.leftX, y: g.cy },
        { side: "right", x: g.rightX, y: g.cy },
      ];
      for (const e of ends) {
        const dx = mx - e.x;
        const dy = my - e.y;
        if (dx * dx + dy * dy <= R * R)
          return { ropeIdx, side: e.side, x: e.x, y: e.y };
      }
    }
    return null;
  }

  function canvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    // Return CSS pixel coordinates so they match drawing space
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    return { x, y, clientX: evt.clientX, clientY: evt.clientY };
  }

  function syncCanvasToCssSize() {
    const dpr = 1;
    const cssW = Math.max(1, Math.round(canvas.clientWidth));
    const cssH = Math.max(1, Math.round(canvas.clientHeight));
    const bufW = Math.round(cssW * dpr);
    const bufH = Math.round(cssH * dpr);
    if (canvas.width !== bufW || canvas.height !== bufH) {
      console.log("syncing canvas to css size", bufW, bufH, dpr, cssW, cssH);
      canvas.width = bufW;
      canvas.height = bufH;
    }
    // Draw using CSS pixel coordinates (keeps text size consistent on mobile)
    if (isMobile) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function ensureMenu() {
    let el = document.getElementById("ctxMenu");
    if (el) return el;
    el = document.createElement("div");
    el.id = "ctxMenu";
    el.style.position = "fixed";
    el.style.zIndex = "1000";
    el.style.background = "#151a22";
    el.style.border = "1px solid #232a33";
    el.style.borderRadius = "8px";
    el.style.padding = "6px";
    el.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";
    el.style.display = "none";
    document.body.appendChild(el);
    return el;
  }

  function openMenu(px, py, ropeIdx, side) {
    const el = ensureMenu();
    el.innerHTML = "";

    function addBtn(label, handler) {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.display = "block";
      b.style.width = "100%";
      b.style.textAlign = "left";
      b.style.margin = "4px 0";
      b.style.background = "#1b222c";
      b.style.color = "#e8edf2";
      b.style.border = "1px solid #2a3441";
      b.style.borderRadius = "6px";
      b.style.padding = isMobile ? "4px 5px" : "8px 10px";
      b.style.cursor = "pointer";
      b.onclick = () => {
        handler();
        closeMenu();
        cursor.style.display = "none";
      };
      el.appendChild(b);
    }

    addBtn("Fire", () => {
      state.ropes[ropeIdx][side].mode = "now";
      if (sim.running) light(ropeIdx, side);
      render();
    });
    addBtn("Fire when other completes", () => {
      state.ropes[ropeIdx][side].mode = "wait";
      render();
    });
    addBtn("Clear", () => {
      state.ropes[ropeIdx][side].mode = "none";
      render();
    });

    const isLeftBtn = px < window.innerWidth / 2;
    if (isLeftBtn) {
      el.style.left = `${px + 8}px`;
    } else {
      el.style.right = `${window.innerWidth - px + 8}px`;
      el.style.left = "auto";
    }
    el.style.top = `${py + 8}px`;
    el.style.display = "block";

    // Close on outside click
    setTimeout(() => {
      const onDoc = (e) => {
        if (!el.contains(e.target)) {
          closeMenu();
          document.removeEventListener("mousedown", onDoc);
        }
      };
      document.addEventListener("mousedown", onDoc);
    }, 0);
  }

  function closeMenu() {
    const el = document.getElementById("ctxMenu");
    if (el) {
      el.style.display = "none";
      el.style.left = "auto";
      el.style.right = "auto";
    }
  }

  canvas.addEventListener("click", (evt) => {
    const { x, y, clientX, clientY } = canvasCoords(evt);
    const hit = hitTestEnd(x, y);
    if (hit) {
      openMenu(clientX, clientY, hit.ropeIdx, hit.side);
    }
  });

  canvas.addEventListener("mousemove", (evt) => {
    const { clientX, clientY, x, y } = canvasCoords(evt);
    const hit = hitTestEnd(x, y);
    if (hit) {
      canvas.style.cursor = "none";
      cursor.style.left = `${clientX - 5}px`;
      cursor.style.top = `${clientY - 10}px`;
      cursor.style.display = "block";
    } else {
      canvas.style.cursor = "auto";
      cursor.style.display = "none";
    }
  });

  // Reset clears end modes
  const resetBtn = document.getElementById("reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      state.ropes[0].left.mode = "none";
      state.ropes[0].right.mode = "none";
      state.ropes[1].left.mode = "none";
      state.ropes[1].right.mode = "none";
      resetSim();
      playPauseBtn.textContent = "Run";
      closeMenu();
      render();
    });
  }

  // --- Wire Run/Pause/Step ---
  const playPauseBtn = document.getElementById("playPause");
  const stepBtn = document.getElementById("step");

  function applySelections() {
    // Light any ends marked "now"
    [0, 1].forEach((idx) => {
      ["left", "right"].forEach((side) => {
        if (state.ropes[idx][side].mode === "now") {
          light(idx, side);
        }
      });
    });
  }

  function tick(ts) {
    if (!sim.running) return;
    if (sim.lastTs == null) {
      sim.lastTs = ts;
      requestAnimationFrame(tick);
      return;
    }
    const dtSec = (ts - sim.lastTs) / 1000;
    sim.lastTs = ts;

    // Speed: minutes per real second. 1 => 60m sim completes in 60s real time
    const SPEED_MINUTES_PER_SECOND = 1;
    const dtMin = clamp(dtSec * SPEED_MINUTES_PER_SECOND, 0, 0.25);

    stepRope(0, dtMin);
    stepRope(1, dtMin);
    sim.elapsedMinutes += dtMin;

    render();

    // stop if nothing is burning
    if (!anyActiveEnds()) {
      sim.running = false;
      playPauseBtn.textContent = "Run";
      checkSuccess();
      return;
    }
    requestAnimationFrame(tick);
  }

  function checkSuccess() {
    const el = document.getElementById("simTime");
    if (!notified45 && el.textContent === "45:00" && !sim.running) {
      notified45 = true;
      showSuccess();
    }
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener("click", () => {
      if (!sim.running) {
        // first start: apply selections
        applySelections();
        if (!anyActiveEnds()) {
          // If nothing selected to burn now, do nothing
          return;
        }
        sim.running = true;
        playPauseBtn.textContent = "Pause";
        requestAnimationFrame(tick);
      } else {
        sim.running = false;
        playPauseBtn.textContent = "Run";
      }
    });
  }

  if (stepBtn) {
    stepBtn.addEventListener("click", () => {
      if (sim.running) return;
      applySelections();
      if (!anyActiveEnds()) return;
      const dt = 0.02;
      stepRope(0, dt);
      stepRope(1, dt);
      sim.elapsedMinutes += dt;
      render();
    });
  }

  // --- Clock UI ---
  function pad(n, w) {
    return String(n).padStart(w, "0");
  }
  function formatTime(mins) {
    const m = Math.floor(mins);
    const rem = (mins - m) * 60;
    const s = Math.floor(rem);
    if (s === 59) {
      return `${m + 1}:00`;
    }
    return `${m}:${pad(s, 2)}`;
  }
  function updateClock() {
    const el = document.getElementById("simTime");
    if (el) {
      const text = formatTime(sim.elapsedMinutes);
      el.textContent = text;
    }
  }

  function showSuccess() {
    let host = document.getElementById("toast45");
    host.style.display = "flex";
    setTimeout(() => {
      const el = document.getElementById("toast45");
      if (el) el.style.display = "none";
    }, 5500);
  }
})();
