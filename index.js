(function () {
  const canvas = document.getElementById("view");
  const ctx = canvas.getContext("2d");
  const cursor = document.getElementById("cursor");

  const ROPE_A_Y = 60;
  const ROPE_B_Y = 180;
  const isMobile = window.innerWidth < 768;
  const ropeX0 = isMobile ? 15 : 30;
  const BRAID_STEP = 20; // increase to widen braid segments along the rope
  const SHOW_DENSITY_TINT = false; // set true to show per-segment burn-speed tint

  // --- i18n (EN/RU) ---
  const i18n = {
    en: {
      title: "Two Ropes Puzzle",
      seoTitle: "Two Ropes Puzzle — Measure 45 Minutes",
      intro:
        'You have a lighter and two ropes. Each rope takes 60 minutes to burn from end to end. The ropes do not burn evenly, so you cannot assume that X percent of the rope burns in X percent of the time.\n<p class="mt-2">Find a way to burn the ropes so you measure 45 minutes.</p>',
      timeLabel: "Simulation time:",
      timeNote: "1 minute is equal to 60 seconds.",
      run: "Run",
      pause: "Pause",
      reset: "Reset",
      legendDensity: "uneven density",
      legendBurnt: "burnt",
      legendFlame: "flame",
      toggleLabel: "RU",
      ropeA: "Rope A",
      ropeB: "Rope B",
      seoDescription:
        "You have a lighter and two ropes that burn unevenly. Use them to measure exactly 45 minutes. Interactive rope-burning puzzle.",
    },
    ru: {
      title: "Задача про две верёвки",
      seoTitle: "Задача про две верёвки — отмерьте 45 минут",
      intro:
        'У вас есть зажигалка и две верёвки. Каждая верёвка сгорает за 60 минут от конца до конца. Верёвки горят неравномерно, поэтому нельзя считать, что X верёвки сгорает за X времени.\n<p class="mt-2">Найдите способ сжечь верёвки так, чтобы отмерить 45 минут.</p>',
      timeLabel: "Время симуляции:",
      timeNote: "1 минута равна 60 секундам.",
      run: "Старт",
      pause: "Пауза",
      reset: "Сброс",
      legendDensity: "неравномерная плотность",
      legendBurnt: "сгорело",
      legendFlame: "пламя",
      toggleLabel: "EN",
      ropeA: "Верёвка A",
      ropeB: "Верёвка B",
      seoDescription:
        "У вас есть зажигалка и две неравномерно горящие верёвки. Используйте их, чтобы точно отмерить 45 минут. Интерактивная головоломка.",
    },
  };

  function getLang() {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "ru") return saved;
    const nav = (navigator.language || "en").toLowerCase();
    return nav.startsWith("ru") ? "ru" : "en";
  }
  let lang = getLang();

  function applyI18n() {
    const t = i18n[lang];
    const title = document.getElementById("title");
    if (title) title.textContent = t.title;
    // Update document title and meta descriptions for UX (note: for SEO/OG best done server-side)
    document.title = t.seoTitle || t.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", t.seoDescription || "");
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", t.seoTitle || t.title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", t.seoDescription || "");
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute("content", t.seoTitle || t.title);
    const twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute("content", t.seoDescription || "");
    const intro = document.getElementById("intro");
    if (intro) intro.innerHTML = t.intro;
    const timeLabel = document.getElementById("timeLabel");
    if (timeLabel) timeLabel.textContent = t.timeLabel;
    const timeNote = document.getElementById("timeNote");
    if (timeNote) timeNote.textContent = t.timeNote;
    const runLabel = document.getElementById("runLabel");
    if (runLabel) runLabel.textContent = sim.running ? t.pause : t.run;
    const resetLabel = document.getElementById("resetLabel");
    if (resetLabel) resetLabel.textContent = t.reset;
    const legendDensity = document.getElementById("legendDensity");
    if (legendDensity && legendDensity.lastChild)
      legendDensity.lastChild.textContent = t.legendDensity;
    const legendBurnt = document.getElementById("legendBurnt");
    if (legendBurnt && legendBurnt.lastChild)
      legendBurnt.lastChild.textContent = t.legendBurnt;
    const legendFlame = document.getElementById("legendFlame");
    if (legendFlame && legendFlame.lastChild)
      legendFlame.lastChild.textContent = t.legendFlame;
    const langLabel = document.getElementById("langLabel");
    if (langLabel) langLabel.textContent = t.toggleLabel;
  }

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

  // ----- VECTORS (ported) ----- //
  function multiplyVector(v, scalar) {
    return { x: v.x * scalar, y: v.y * scalar };
  }
  function getVector(a, b) {
    return { x: b.x - a.x, y: b.y - a.y };
  }
  function addVectors(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  // ----- MATH (ported) ----- //
  function getPointOnLine(start, end, ratio) {
    const vector = getVector(start, end);
    const v = multiplyVector(vector, ratio);
    return { x: start.x + v.x, y: start.y + v.y };
  }
  function getAngleBetweenThreePoints(a, b, c) {
    const vectorBA = getVector(a, b);
    const vectorBC = getVector(c, b);
    const angle =
      Math.atan2(vectorBC.y, vectorBC.x) - Math.atan2(vectorBA.y, vectorBA.x);
    return angle;
  }

  // ----- CHAIKIN (ported) ----- //
  function cut(start, end, ratio) {
    const r1 = {
      x: start.x * (1 - ratio) + end.x * ratio,
      y: start.y * (1 - ratio) + end.y * ratio,
    };
    const r2 = {
      x: start.x * ratio + end.x * (1 - ratio),
      y: start.y * ratio + end.y * (1 - ratio),
    };
    return [r1, r2];
  }
  function chaikin(curve, iterations = 1, closed = false, ratio = 0.25) {
    if (ratio > 0.5) ratio = 1 - ratio;
    for (let i = 0; i < iterations; i++) {
      let refined = [];
      refined.push(curve[0]);
      for (let j = 1; j < curve.length; j++) {
        let points = cut(curve[j - 1], curve[j], ratio);
        refined = refined.concat(points);
      }
      if (closed) {
        refined.shift();
        refined = refined.concat(cut(curve[curve.length - 1], curve[0], ratio));
      } else {
        refined.push(curve[curve.length - 1]);
      }
      curve = refined;
    }
    return curve;
  }

  // ----- ROPE GEOMETRY (adapted for straight line) ----- //
  function getOuterPoints(v1, v2, v3, thickness, angleOffset = 0) {
    let angle1 = getAngleBetweenThreePoints(v1, v2, v3) / 2;
    const offset = angle1 > 0 ? -1 : 1;
    const angle2 = getAngleBetweenThreePoints(v1, v2, {
      x: v2.x + offset,
      y: v2.y,
    });
    const angle = angle2 - angle1 + angleOffset;
    const r = thickness / 2;
    const point1 = {
      x: v2.x + Math.cos(angle) * r,
      y: v2.y - Math.sin(angle) * r,
    };
    const point2 = {
      x: v2.x + Math.cos(angle + Math.PI) * r,
      y: v2.y - Math.sin(angle + Math.PI) * r,
    };
    return [point1, point2];
  }
  function getLines(points, thickness, angleOffset = 0) {
    const normals = [];
    for (let i = 1; i < points.length - 1; i++) {
      const v1 = points[i - 1];
      const v2 = points[i];
      const v3 = points[i + 1];
      const line = getOuterPoints(v1, v2, v3, thickness, angleOffset);
      normals.push(line);
    }
    normals.push(normals[normals.length - 1]);
    return normals;
  }
  function getSegments(normals, fixGaps = false) {
    const segments = [];
    for (let i = 0; i < normals.length - 2; i++) {
      const l1 = normals[i];
      const l2 = normals[i + 1];
      const l3 = normals[i + 2];
      const path = [l1[0], l1[1], l2[1], l2[0]];
      const prevSegment = segments[i - 1];
      const A = l1[0];
      const B = l1[1];
      const C = l2[0];
      const D = l2[1];
      const E = l3[0];
      const ratio1 = 0.3;
      const ratio2 = 1 - ratio1;
      const BD033 = getPointOnLine(B, D, 0.33);
      const DC_p1 = getPointOnLine(D, C, ratio1);
      let corner1 = getPointOnLine(BD033, DC_p1, 0.5);
      corner1 = addVectors(
        corner1,
        multiplyVector(getVector(corner1, D), 0.25)
      );
      const DC_p2 = getPointOnLine(D, C, ratio2);
      const CE066 = getPointOnLine(C, E, 0.66);
      let corner2 = getPointOnLine(DC_p2, CE066, 0.5);
      corner2 = addVectors(
        corner2,
        multiplyVector(getVector(corner2, C), 0.25)
      );
      const AC066 = getPointOnLine(A, C, 0.66);
      const AB_p1 = getPointOnLine(A, B, ratio1);
      const AB_p2 = getPointOnLine(A, B, ratio2);
      const line1 = [
        prevSegment ? prevSegment.line1[2] : B,
        BD033,
        corner1,
        fixGaps ? corner1 : null,
        fixGaps ? corner1 : null,
        DC_p1,
        DC_p2,
        corner2,
      ].filter(Boolean);
      const line2 = [
        corner2,
        AC066,
        prevSegment ? prevSegment.line1[fixGaps ? 7 : 5] : null,
        prevSegment && fixGaps ? prevSegment.line1[7] : null,
        prevSegment && fixGaps ? prevSegment.line1[7] : null,
        AB_p1,
        prevSegment ? AB_p2 : null,
        prevSegment ? prevSegment.line1[2] : B,
      ].filter(Boolean);
      const roundedLine1 = chaikin(line1, 2, false, 0.25);
      const roundedLine2 = chaikin(line2, 2, false, 0.25);
      roundedLine1.pop();
      roundedLine2.pop();
      const pointsPoly = [...roundedLine1, ...roundedLine2];
      segments.push({ line1, line2, path, points: pointsPoly });
    }
    return segments;
  }

  function buildStraightPathPoints(x0, x1, y, step) {
    const points = [];
    const length = Math.max(1, x1 - x0);
    const count = Math.max(2, Math.floor(length / step));
    for (let i = -1; i <= count + 1; i++) {
      const t = Math.min(1, Math.max(0, i / count));
      points.push({ x: x0 + t * length, y });
    }
    // helper endpoints
    const vStart = getVector(points[1], points[0]);
    const vEnd = getVector(
      points[points.length - 2],
      points[points.length - 1]
    );
    return [
      addVectors(points[0], vStart),
      ...points,
      addVectors(points[points.length - 1], vEnd),
    ];
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
    elapsedSeconds: 0,
    _accumSimSeconds: 0,
  };

  let notified45 = false;

  function resetSim() {
    sim.ropes[0] = createRopeState(0);
    sim.ropes[1] = createRopeState(1);
    sim.running = false;
    sim.lastTs = null;
    sim.elapsedSeconds = 0;
    sim._accumSimSeconds = 0;
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

  function stepRope(ropeIdx, dtSeconds) {
    const r = sim.ropes[ropeIdx];
    if (r.completed) return;
    const times = profile[ropeIdx];
    const n = times.length;
    const L = 1 / n; // segment length

    // advance left
    if (r.leftActive && r.leftIndex <= r.rightIndex) {
      const segTime = times[r.leftIndex];
      const speedPerSec = L / (segTime * 60);
      r.leftConsumed += speedPerSec * dtSeconds;
      while (r.leftConsumed >= L && r.leftIndex < r.rightIndex) {
        r.leftConsumed -= L;
        r.leftIndex += 1;
      }
    }

    // advance right
    if (r.rightActive && r.rightIndex >= r.leftIndex) {
      const segTime = times[r.rightIndex];
      const speedPerSec = L / (segTime * 60);
      r.rightConsumed += speedPerSec * dtSeconds;
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

    // No background rail; render only the rope itself

    // Draw braided polygons along straight path using ported SVG algo
    ctx.save();
    roundRect(ctx, x0, y, width, height, 10);
    ctx.clip();
    const thickness = height;
    const step = BRAID_STEP; // px between points (larger => wider segments)
    const ang = Math.PI * 0.25; // braid angle
    const points = buildStraightPathPoints(
      x0,
      x0 + width,
      y + height / 2,
      step
    );
    const normals = getLines(points, thickness, ang);
    const polys = getSegments(normals, false);
    const natural = ["#e4cdad", "#dcbf99", "#d6b88e", "#dcbf99"]; // alternating colors
    for (let i = 0; i < polys.length; i++) {
      const poly = polys[i].points;
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
      ctx.closePath();
      ctx.fillStyle = natural[i % natural.length];
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }
    // Volume gradient
    const edge = ctx.createLinearGradient(x0, y, x0, y + height);
    edge.addColorStop(0, "rgba(255,255,255,0.12)");
    edge.addColorStop(0.5, "rgba(0,0,0,0.00)");
    edge.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = edge;
    ctx.fillRect(x0, y, width, height);

    // Optional per-segment density tint (disabled by default)
    if (SHOW_DENSITY_TINT) {
      const n = segments.length;
      const segW = width / n;
      ctx.globalCompositeOperation = "multiply";
      for (let i = 0; i < n; i++) {
        const d = clamp(segments[i], 0, 2);
        const shade = clamp(d / 1.6, 0, 1);
        const c0 = lerpColor([170, 130, 85], [230, 200, 150], shade);
        ctx.fillStyle = `rgba(${c0[0]},${c0[1]},${c0[2]},0.28)`;
        ctx.fillRect(x0 + i * segW, y, segW + 1, height);
      }
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();

    // Label
    ctx.fillStyle = "#9aa7b2";
    ctx.font = "16px Arial";
    ctx.textAlign = "left";
    ctx.fontStretch = "normal";
    ctx.fillText(label, x0, y - 10);

    // Burn progress and flames
    const idx = ["Rope A", "Верёвка A"].includes(label) ? 0 : 1;
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

    const ropeNameA = i18n[lang].ropeA;
    const ropeNameB = i18n[lang].ropeB;

    drawRope(ROPE_A_Y, ropeA, ropeNameA);
    drawRope(ROPE_B_Y, ropeB, ropeNameB);
    // Midline to indicate rope center along length
    (function drawMidline() {
      const midX = canvas.clientWidth / 2;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, canvas.clientHeight);
      ctx.stroke();
      ctx.restore();
    })();
    updateClock();
  }

  render();

  window.addEventListener("resize", render);

  const langToggle = document.getElementById("langToggle");
  if (langToggle) {
    langToggle.addEventListener("click", () => {
      lang = lang === "en" ? "ru" : "en";
      localStorage.setItem("lang", lang);
      applyI18n();
      setRunStateVisual(sim.running);
      // Re-render so rope labels (A/B) update immediately
      render();
    });
  }
  applyI18n();

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
      setRunStateVisual(false);
      closeMenu();
      render();
    });
  }

  // --- Wire Run/Pause/Step ---
  const playPauseBtn = document.getElementById("playPause");
  const stepBtn = document.getElementById("step");

  function setRunStateVisual(running) {
    if (!playPauseBtn) return;
    const svgs = playPauseBtn.querySelectorAll("svg");
    const label = playPauseBtn.querySelector("span");
    const playIcon = svgs[0];
    const pauseIcon = svgs[1];
    if (playIcon) playIcon.style.display = running ? "none" : "inline";
    if (pauseIcon) pauseIcon.style.display = running ? "inline" : "none";
    if (label) {
      const t =
        typeof i18n !== "undefined" && i18n[lang]
          ? i18n[lang]
          : { run: "Run", pause: "Pause" };
      label.textContent = running ? t.pause : t.run;
    }
  }

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

    // Speed: simulated seconds per real second
    const SPEED_SIM_SECONDS_PER_REAL_SECOND = 60; // 1 minute per real second
    let remaining = dtSec * SPEED_SIM_SECONDS_PER_REAL_SECOND;
    // Integrate in small substeps to avoid dropping time on slow frames
    const MAX_SUBSTEP = 0.25; // seconds of sim time per substep
    while (remaining > 0) {
      const step = remaining > MAX_SUBSTEP ? MAX_SUBSTEP : remaining;
      stepRope(0, step);
      stepRope(1, step);
      sim._accumSimSeconds += step;
      remaining -= step;
    }
    const whole = Math.floor(sim._accumSimSeconds + 1e-9);
    if (whole > 0) {
      sim.elapsedSeconds += whole;
      sim._accumSimSeconds -= whole;
    }

    render();

    // stop if nothing is burning
    if (!anyActiveEnds()) {
      sim.running = false;
      setRunStateVisual(false);
      checkSuccess();
      return;
    }
    requestAnimationFrame(tick);
  }

  function checkSuccess() {
    const targetSeconds = 45 * 60;
    const tolerance = 1;
    if (
      !notified45 &&
      [
        targetSeconds,
        targetSeconds + tolerance,
        targetSeconds - tolerance,
      ].includes(sim.elapsedSeconds) &&
      !sim.running
    ) {
      notified45 = true;
      const el = document.getElementById("simTime");
      if (el) {
        el.textContent = "45:00";
        el.style.color = "#1fd36b";
      }
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
        setRunStateVisual(true);

        requestAnimationFrame(tick);
      } else {
        sim.running = false;
        setRunStateVisual(false);
      }
    });
  }

  if (stepBtn) {
    stepBtn.addEventListener("click", () => {
      if (sim.running) return;
      applySelections();
      if (!anyActiveEnds()) return;
      const dt = 1; // 1 simulated second per step
      stepRope(0, dt);
      stepRope(1, dt);
      sim.elapsedSeconds += dt;
      render();
    });
  }

  // --- Clock UI ---
  function pad(n, w) {
    return String(n).padStart(w, "0");
  }
  function formatTimeFromSeconds(totalSeconds) {
    let m = Math.floor(totalSeconds / 60);
    let s = Math.floor(totalSeconds % 60);
    if (s === 59) {
      m += 1;
      s = 0;
    }
    return `${m}:${pad(s, 2)}`;
  }
  function updateClock() {
    const el = document.getElementById("simTime");
    if (el) {
      const text = formatTimeFromSeconds(sim.elapsedSeconds);
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
