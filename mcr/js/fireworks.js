// 2026年11月の花火。戻すときは NOVEMBER_THANKS を false にする。
export const NOVEMBER_THANKS = true;

const LAUNCH = 1000;
const RISE_MS = 1300;
const OPEN_MS = 700;
const BLOOM_MS = 3900;
const OPENING_FADE = 10800;
const THANKS_TEXT_ON = LAUNCH + RISE_MS + OPEN_MS;
const THANKS_TEXT_OFF = 12200;
const THANKS_DONE = 15000;

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

const WAVE_LOOK = {
  2: { peaks: [0.36, 0.32], reach: [200, 210] },
  3: { peaks: [0.40, 0.22, 0.38], reach: [170, 220, 180] },
  5: { peaks: [0.42, 0.26, 0.50, 0.24, 0.40], reach: [140, 160, 190, 155, 135] },
  6: { peaks: [0.42, 0.26, 0.36, 0.18, 0.34, 0.46], reach: [128, 142, 136, 158, 132, 122] },
  7: { peaks: [0.40, 0.24, 0.36, 0.18, 0.38, 0.26, 0.42], reach: [145, 160, 140, 175, 150, 165, 135] },
  9: { peaks: [0.46, 0.30, 0.38, 0.18, 0.28, 0.22, 0.42, 0.32, 0.48], reach: [118, 128, 124, 148, 120, 136, 130, 126, 114] },
};

export function createNovemberThanks(canvas, textEl) {
  const shows = [];

  function november() {
    const t = new Date(Date.now() + 9 * 3600000);
    return t.getUTCFullYear() === 2026 && t.getUTCMonth() === 10;
  }

  function band() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const opening = document.body.classList.contains('opening-sky');
    const hidden = opening
      || document.body.classList.contains('panel-hidden')
      || document.body.classList.contains('buttons-hidden');
    const panelRight = hidden ? 24 : 12 + Math.min(420, w - 24);
    const globeLeft = opening ? w - 24 : w - (w <= 720 ? 140 : 220);
    const left = panelRight + 36;
    const right = Math.max(left + 180, globeLeft - 16);
    return { left, right, ground: h * 0.82, h };
  }

  function bloomColor(shell, i, inner) {
    const shift = shell.hue * 3 + (inner ? 2 : 0);
    return BLOOM_COLORS[(i + shift) % BLOOM_COLORS.length];
  }

  function ignite(shell) {
    const sparks = [];
    const outer = shell.outer || 52;
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
    const inner = shell.innerN || 26;
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
    const open = Math.min(1, ms / OPEN_MS);
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

  function drawRise(ctx, shell, local, scale) {
    const p = Math.min(1, local / RISE_MS);
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
    const flash = 1 - Math.min(1, local / 500);
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

  function waveShells(n, at, hue0, shift = 0, scale = 1, stagger = 140) {
    const { left, right, ground, h } = band();
    const look = WAVE_LOOK[n];
    const width = right - left;
    const outer = n >= 9 ? 34 : n >= 6 ? 40 : 48;
    const innerN = n >= 9 ? 14 : n >= 6 ? 18 : 24;
    const shells = [];
    for (let i = 0; i < n; i++) {
      const spread = n === 1 ? 0.5 : i / (n - 1);
      const reach = Math.round(look.reach[i] * scale);
      const xFrac = Math.min(0.96, Math.max(0.04, 0.06 + spread * 0.88 + shift * 0.07));
      const peak = Math.min(0.56, Math.max(0.16, look.peaks[i] - shift * 0.05));
      shells.push({
        x: left + width * xFrac,
        y0: ground,
        y1: Math.min(ground - 24, Math.max(reach + 24, h * peak)),
        color: SHELL_COLORS[(hue0 + i) % SHELL_COLORS.length],
        hue: hue0 + i,
        reach,
        outer,
        innerN,
        sparks: null,
        launchAt: at + i * stagger,
      });
    }
    return shells;
  }

  function thanksShells() {
    return [
      ...waveShells(3, 1000, 0, 0, 1, 120),
      ...waveShells(9, 4200, 4, 0, 1.3, 80),
      ...waveShells(6, 7400, 14, 1, 1.2, 80),
    ];
  }

  function syncText(show, elapsed) {
    if (!textEl) return;
    if (elapsed >= THANKS_TEXT_ON && elapsed < THANKS_TEXT_OFF) {
      if (!show.textOn) {
        show.textOn = true;
        textEl.classList.add('show');
        textEl.setAttribute('aria-hidden', 'false');
      }
      return;
    }
    if (elapsed >= THANKS_TEXT_OFF && show.textOn) {
      show.textOn = false;
      textEl.classList.remove('show');
      textEl.setAttribute('aria-hidden', 'true');
    }
  }

  function drawShow(show, now) {
    const elapsed = now - show.t0;
    if (show.thanks) syncText(show, elapsed);
    const ctx = canvas.getContext('2d');
    const scale = canvas.width / Math.max(1, window.innerWidth);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const shell of show.shells) {
      const local = elapsed - shell.launchAt;
      if (local < 0 || local > RISE_MS + BLOOM_MS) continue;
      if (local < RISE_MS) drawRise(ctx, shell, local, scale);
      else drawBloom(ctx, shell, local - RISE_MS, scale);
    }
    ctx.restore();
  }

  function alive(show, now) {
    const elapsed = now - show.t0;
    if (show.thanks && elapsed < THANKS_DONE) return true;
    return show.shells.some((shell) => elapsed < shell.launchAt + RISE_MS + BLOOM_MS);
  }

  return {
    startOpening() {
      if (!NOVEMBER_THANKS || !november()) return null;
      if (shows.some((show) => show.kind === 'opening')) return { fade: OPENING_FADE, end: OPENING_FADE };
      const shells = [
        ...waveShells(3, 400, 0, 0, 0.70, 120),
        ...waveShells(3, 2400, 3, 1, 0.84, 120),
        ...waveShells(3, 4400, 6, -1, 0.98, 120),
        ...waveShells(6, 7900, 9, 0, 1.08, 70),
        ...waveShells(6, 8900, 15, 1, 1.18, 70),
        ...waveShells(6, 9900, 21, -1, 1.28, 70),
        ...waveShells(3, 11700, 27, 0, 1.36, 40),
        ...waveShells(9, 11950, 30, 1, 1.48, 28),
        ...waveShells(6, 12200, 39, -1, 1.42, 28),
        ...waveShells(3, 12450, 45, 1, 1.54, 40),
        ...waveShells(9, 12700, 48, -1, 1.66, 28),
        ...waveShells(6, 12950, 57, 0, 1.58, 28),
      ];
      shows.push({
        kind: 'opening',
        t0: performance.now(),
        shells,
        thanks: false,
        textOn: false,
      });
      const last = Math.max(...shells.map((shell) => shell.launchAt));
      return {
        fade: Math.max(OPENING_FADE, last + RISE_MS + OPEN_MS + 2200),
        end: last + RISE_MS + BLOOM_MS,
      };
    },
    start() {
      if (!NOVEMBER_THANKS || !november() || !textEl) return;
      if (shows.some((show) => show.kind === 'thanks')) return;
      textEl.classList.remove('show');
      textEl.setAttribute('aria-hidden', 'true');
      shows.push({
        kind: 'thanks',
        t0: performance.now(),
        shells: thanksShells(),
        thanks: true,
        textOn: false,
      });
    },
    draw(now) {
      for (let i = shows.length - 1; i >= 0; i--) {
        if (!alive(shows[i], now)) {
          if (shows[i].thanks && shows[i].textOn && textEl) {
            textEl.classList.remove('show');
            textEl.setAttribute('aria-hidden', 'true');
          }
          shows.splice(i, 1);
        }
      }
      for (const show of shows) drawShow(show, now);
    },
  };
}
