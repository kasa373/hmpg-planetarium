// 2026年11月の花火。戻すときは NOVEMBER_THANKS を false にする。
export const NOVEMBER_THANKS = true;

const LAUNCH = 1000;
const RISE_END = 2300;
const BLOOM = 3000;
const TEXT_HOLD_END = 7000;
const DONE = 9500;

const SHELL_COLORS = [
  [255, 196, 48],
  [72, 214, 255],
  [255, 86, 168],
];

const BLOOM_COLORS = [
  [255, 70, 86],
  [255, 150, 40],
  [255, 226, 64],
  [90, 230, 120],
  [64, 210, 255],
  [120, 130, 255],
  [210, 110, 255],
  [255, 110, 186],
];

export function createNovemberThanks(canvas, textEl) {
  let show = null;

  function november() {
    const t = new Date(Date.now() + 9 * 3600000);
    return t.getUTCFullYear() === 2026 && t.getUTCMonth() === 10;
  }

  function layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const hidden = document.body.classList.contains('panel-hidden')
      || document.body.classList.contains('buttons-hidden');
    const panelRight = hidden ? 24 : 12 + Math.min(420, w - 24);
    const globeLeft = w - (w <= 720 ? 140 : 220);
    const left = panelRight + 56;
    const right = Math.max(left + 160, globeLeft - 28);
    const ground = h * 0.82;
    const peaks = [0.40, 0.27, 0.42];
    const reach = [252, 315, 234];
    return peaks.map((peak, i) => ({
      x: left + (right - left) * (0.16 + i * 0.34),
      y0: ground + (i === 1 ? 10 : 0),
      y1: Math.min(ground - 24, Math.max(reach[i] + 24, h * peak)),
      color: SHELL_COLORS[i],
      hue: i,
      reach: reach[i],
      sparks: null,
    }));
  }

  function bloomColor(shell, i, inner) {
    const shift = shell.hue * 3 + (inner ? 2 : 0);
    return BLOOM_COLORS[(i + shift) % BLOOM_COLORS.length];
  }

  function ignite(shell) {
    const sparks = [];
    const outer = 52;
    for (let i = 0; i < outer; i++) {
      sparks.push({
        a: (i / outer) * Math.PI * 2 + (i % 2) * 0.02,
        speed: shell.reach * (0.86 + (i % 5) * 0.035),
        life: 2.15 + (i % 4) * 0.12,
        willow: i % 5 === 0,
        inner: false,
        color: bloomColor(shell, i, false),
      });
    }
    const inner = 26;
    for (let i = 0; i < inner; i++) {
      sparks.push({
        a: (i / inner) * Math.PI * 2 + 0.08,
        speed: shell.reach * 0.5,
        life: 1.7,
        willow: false,
        inner: true,
        color: bloomColor(shell, i, true),
      });
    }
    shell.sparks = sparks;
  }

  function risePoint(shell, eased) {
    return {
      x: shell.x,
      y: shell.y0 + (shell.y1 - shell.y0) * eased,
    };
  }

  function bloomPoint(shell, spark, ms) {
    const age = ms / 1000;
    const open = Math.min(1, ms / (BLOOM - RISE_END));
    const ease = 1 - (1 - open) ** 2;
    const fall = Math.max(0, age - 0.9);
    const dist = spark.speed * ease;
    const droop = (spark.willow ? 90 : 30) * fall * fall;
    return {
      x: shell.x + Math.cos(spark.a) * dist,
      y: shell.y1 + Math.sin(spark.a) * dist + droop,
      dist,
      droop,
      alpha: Math.max(0, 1 - fall / 2.5),
    };
  }

  function glow(ctx, x, y, color, radius, alpha) {
    if (alpha <= 0.01) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(255,255,255,${Math.min(1, alpha)})`);
    g.addColorStop(0.4, `rgba(${color[0]},${color[1]},${color[2]},${alpha * 0.7})`);
    g.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRise(ctx, shell, elapsed, scale) {
    const p = Math.min(1, (elapsed - LAUNCH) / (RISE_END - LAUNCH));
    const e = 1 - (1 - p) ** 3;
    const head = risePoint(shell, e);
    const tail = risePoint(shell, Math.max(0, e - 0.16));
    const [r, g, b] = shell.color;
    ctx.strokeStyle = `rgba(${r},${g},${b},0.95)`;
    ctx.lineWidth = 3.2 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tail.x * scale, tail.y * scale);
    ctx.lineTo(head.x * scale, head.y * scale);
    ctx.stroke();
    glow(ctx, head.x * scale, head.y * scale, shell.color, 18 * scale, 1);
    const flash = 1 - Math.min(1, (elapsed - LAUNCH) / 500);
    if (flash > 0) glow(ctx, shell.x * scale, shell.y0 * scale, shell.color, 26 * scale, flash * 0.8);
  }

  function drawBloom(ctx, shell, ms, scale) {
    if (!shell.sparks) ignite(shell);
    const age = ms / 1000;
    glow(ctx, shell.x * scale, shell.y1 * scale, shell.color, (16 + age * 10) * scale, Math.max(0, 0.55 - age * 0.22));
    ctx.lineCap = 'round';
    for (const spark of shell.sparks) {
      const tip = bloomPoint(shell, spark, ms);
      if (tip.alpha <= 0.02 || tip.dist < 1) continue;
      const inner = spark.inner ? 0.55 : 0.58;
      const tailDist = tip.dist * inner;
      const tailDroop = tip.droop * inner;
      const [r, g, b] = spark.color;
      ctx.strokeStyle = `rgba(${r},${g},${b},${tip.alpha})`;
      ctx.lineWidth = (spark.inner ? 1.35 : 2.1) * scale;
      ctx.beginPath();
      ctx.moveTo(shell.x * scale + Math.cos(spark.a) * tailDist * scale, (shell.y1 + tailDroop) * scale + Math.sin(spark.a) * tailDist * scale);
      ctx.lineTo(tip.x * scale, tip.y * scale);
      ctx.stroke();
    }
  }

  function syncText(elapsed) {
    if (!textEl) return;
    if (elapsed >= BLOOM && elapsed < TEXT_HOLD_END) {
      if (!show.textOn) {
        show.textOn = true;
        textEl.classList.add('show');
        textEl.setAttribute('aria-hidden', 'false');
      }
      return;
    }
    if (elapsed >= TEXT_HOLD_END && show.textOn) {
      show.textOn = false;
      textEl.classList.remove('show');
      textEl.setAttribute('aria-hidden', 'true');
    }
  }

  return {
    start() {
      if (!NOVEMBER_THANKS || !november() || !textEl) return;
      textEl.classList.remove('show');
      textEl.setAttribute('aria-hidden', 'true');
      show = { t0: performance.now(), shells: layout(), textOn: false };
    },
    draw(now) {
      if (!show) return;
      const elapsed = now - show.t0;
      syncText(elapsed);
      if (elapsed >= DONE) {
        show = null;
        return;
      }
      if (elapsed < LAUNCH || elapsed > 6200) return;
      const ctx = canvas.getContext('2d');
      const scale = canvas.width / Math.max(1, window.innerWidth);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const shell of show.shells) {
        if (elapsed < RISE_END) drawRise(ctx, shell, elapsed, scale);
        else drawBloom(ctx, shell, elapsed - RISE_END, scale);
      }
      ctx.restore();
    },
  };
}
