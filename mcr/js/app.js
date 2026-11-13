import {
  apply3, formatJst, formatLatLon, formatSolar, gmstDeg, horizontalMatrix,
  julianDate, moonRaDec, planetRaDec, precessionMatrix, raDecToVec, sunRaDec,
} from './astro.js';
import { CITIES } from './cities.js';
import { isLand, prepareLand } from './land.js';
import { createGlobe } from './globe.js';
import { createRenderer, decodeStars } from './render.js';
import { createNovemberThanks } from './fireworks.js?v=3';

const GREET = {
  1: 'Happy New Year.',
  2: 'Spring is near.',
  3: 'Welcome, spring.',
  4: 'Under the blossoms.',
  5: 'Green leaves of May.',
  6: 'After the rain.',
  7: 'Stars of Tanabata.',
  8: 'The summer Milky Way.',
  9: 'Clear autumn skies.',
  10: 'A long autumn night.',
  11: 'Thank you for everything.',
  12: 'Merry Christmas.',
};

const TOKYO = { lat: 35.6812, lon: 139.7671, name: '東京' };
const LANDMARKS = [
  ['tower', 35.6586, 139.7454],
  ['taipei', 25.0336, 121.5645],
];
const SHOW_MS = 12 * 3600000;
const SUB_START_DELAY = 10000;
const METEOR_PER_SEC = 0.6;
const METEOR_CAP = 18;

const $ = (id) => document.getElementById(id);
const canvas = $('sky');
const renderer = createRenderer(canvas);
const novemberThanks = createNovemberThanks(canvas, $('thanks'));
const globe = createGlobe($('globe'));
const MIN_R = renderer.minRadius;
const LOOK_R = 32 * 1.28 * 1.28;
const WIDE_MAX = 46 * 1.28 * 1.28;

const placeKindEl = $('placeKind');
const cityEl = $('city');
const whenDateEl = $('whenDate');
const showMinutesEl = $('showMinutes');
const magEl = $('mag');
const shadeEl = $('shade');
const shadeAutoEl = $('shadeAuto');
const subShadeEl = $('subShade');
const subShadeAutoEl = $('subShadeAuto');
const starSizeEl = $('starSize');
const linesEl = $('showLines');
const namesEl = $('showNames');
const altitudeEl = $('showAltitude');
const infoEl = $('showInfo');
const meteorsEl = $('showMeteors');
const subsEl = $('showSubs');
const hudText = $('hudText');
const captionEl = $('caption');
const captionText = $('captionText');
const subNoteEl = $('subNote');

const saved = loadSettings();
let placeName = TOKYO.name;
let playing = false;
let showLive = false;
let southAimed = false;
let openToken = 0;
let playMs = 0;
let fraction = 0;
let lastTick = 0;
let viewRadius = LOOK_R;
let centerAlt = 22;
let centerAz = 180;
let hour = 17;
let liveStart = null;
let geoToken = 0;
let land = [];
let sky = { constellations: [], stars: [] };
let stars = { n: 0, ra: new Float32Array(), dec: new Float32Array(), mag: new Float32Array(), bv: new Float32Array() };
let onLand = true;
let layout = { radius: 300, dpr: 1 };
let manualShade = '0';
let manualSubShade = '0';
let subToken = 0;
const sub = { cues: [], index: 0, phase: 'idle', left: 0 };
const wikiCache = new Map();

magEl.value = saved.mag || '6';
showMinutesEl.value = saved.showMinutes || '5';
const freshDefaults = saved.defaultsRev !== 2;
const freshSubShade = saved.defaultsRev !== 3;
const freshMeteors = saved.defaultsRev !== 4;
shadeEl.value = saved.shade ?? '0';
shadeAutoEl.checked = freshDefaults ? true : saved.shadeAuto === true;
manualShade = shadeEl.value;
subShadeEl.value = saved.subShade ?? '0';
subShadeAutoEl.checked = freshSubShade ? true : saved.subShadeAuto === true;
manualSubShade = subShadeEl.value;
starSizeEl.value = freshDefaults || saved.starSize == null || saved.starSize === '' ? '3' : saved.starSize;
linesEl.checked = saved.lines !== false;
namesEl.checked = saved.names !== false;
altitudeEl.checked = saved.altitude !== false;
infoEl.checked = saved.info !== false;
meteorsEl.checked = freshMeteors ? true : saved.meteors === true;
$('volume').value = saved.volume ?? 0.7;
$('loop').checked = saved.loop !== false;
$('shuffle').checked = saved.shuffle === true;
subsEl.checked = saved.subtitles !== false;
checkRadio('subSize', saved.subSize || 'medium');
whenDateEl.value = ymdString(jstParts(new Date()));
applyPlace(TOKYO.lat, TOKYO.lon, TOKYO.name);
updateLabels();
updatePreset();
if (freshDefaults || freshSubShade || freshMeteors) saveSettings();

const audio = new Audio();
audio.volume = Number($('volume').value);
audio.loop = false;
let tracks = [];
let trackIndex = 0;
if (window.showDirectoryPicker) $('pickDir').hidden = false;

function ymdString(parts) {
  const p = (n) => String(n).padStart(2, '0');
  return `${parts.y}-${p(parts.m)}-${p(parts.d)}`;
}

function jstParts(date) {
  const t = new Date(date.getTime() + 9 * 3600000);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    hh: t.getUTCHours(),
    mm: t.getUTCMinutes(),
  };
}

function localParts(date, lon) {
  const t = new Date(date.getTime() + (lon / 15) * 3600000);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    hh: t.getUTCHours(),
    mm: t.getUTCMinutes(),
  };
}

function localWall(ymd, hh, mm, lon) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm || 0, 0) - (lon / 15) * 3600000);
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('star-gift-v1') || '{}'); }
  catch { return {}; }
}

function saveSettings() {
  localStorage.setItem('star-gift-v1', JSON.stringify({
    mag: magEl.value,
    showMinutes: showMinutesEl.value,
    shade: shadeAutoEl.checked ? manualShade : shadeEl.value,
    shadeAuto: shadeAutoEl.checked,
    subShade: subShadeAutoEl.checked ? manualSubShade : subShadeEl.value,
    subShadeAuto: subShadeAutoEl.checked,
    starSize: starSizeEl.value,
    lines: linesEl.checked,
    names: namesEl.checked,
    altitude: altitudeEl.checked,
    info: infoEl.checked,
    meteors: meteorsEl.checked,
    defaultsRev: 4,
    volume: $('volume').value,
    loop: $('loop').checked,
    shuffle: $('shuffle').checked,
    subtitles: subsEl.checked,
    subSize: sizeValue(),
  }));
}

function checkRadio(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

function sizeValue() {
  return document.querySelector('input[name="subSize"]:checked')?.value || 'medium';
}

function subScale() {
  const size = sizeValue();
  if (size === 'small') return 0.5;
  if (size === 'large') return 1;
  return 0.7;
}

function readMinutes() {
  const n = Math.round(Number(showMinutesEl.value));
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(720, n));
}

function showStart() {
  if (liveStart) return liveStart;
  const ymd = whenDateEl.value || ymdString(jstParts(new Date()));
  return localWall(ymd, hour, 0, herePos().lon);
}

function herePos() {
  return {
    lat: Math.max(-89, Math.min(89, Number($('lat').value) || TOKYO.lat)),
    lon: Math.max(-180, Math.min(180, Number($('lon').value) || TOKYO.lon)),
  };
}

function applyPlace(lat, lon, name) {
  let latHolder = $('lat');
  if (!latHolder) {
    latHolder = document.createElement('input');
    latHolder.id = 'lat';
    latHolder.hidden = true;
    document.body.appendChild(latHolder);
    const lonHolder = document.createElement('input');
    lonHolder.id = 'lon';
    lonHolder.hidden = true;
    document.body.appendChild(lonHolder);
  }
  $('lat').value = String(Math.round(lat * 10000) / 10000);
  $('lon').value = String(Math.round(lon * 10000) / 10000);
  placeName = name;
}

function fillCities(kind) {
  const rows = CITIES.filter((row) => (kind === 'japan' ? row[0] === '日本' : row[0] !== '日本'));
  cityEl.replaceChildren();
  let region = '';
  let group = null;
  for (const [reg, name] of rows) {
    if (reg !== region) {
      group = document.createElement('optgroup');
      group.label = reg;
      cityEl.appendChild(group);
      region = reg;
    }
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    group.appendChild(opt);
  }
  const prefer = kind === 'japan' ? '東京' : rows[0]?.[1];
  if (prefer) cityEl.value = prefer;
}

function chooseCity() {
  const city = CITIES.find((row) => row[1] === cityEl.value);
  if (!city) return;
  applyPlace(city[2], city[3], city[1]);
  updateLabels();
  resetRoute();
}

function locate() {
  const note = $('locateNote');
  const button = $('locate');
  const token = ++geoToken;
  if (!navigator.geolocation) {
    note.textContent = '現在地を取れなかったので、東京にしています';
    applyPlace(TOKYO.lat, TOKYO.lon, TOKYO.name);
    updateLabels();
    return;
  }
  button.disabled = true;
  note.textContent = '位置を確認しています';
  navigator.geolocation.getCurrentPosition((pos) => {
    button.disabled = false;
    if (token !== geoToken) return;
    applyPlace(pos.coords.latitude, pos.coords.longitude, '現在地');
    note.textContent = '';
    updateLabels();
    if (!playing) resetRoute();
  }, () => {
    button.disabled = false;
    if (token !== geoToken) return;
    note.textContent = '現在地を取れなかったので、東京にしています';
    applyPlace(TOKYO.lat, TOKYO.lon, TOKYO.name);
    updateLabels();
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
}

function selectHour(next) {
  hour = next;
  liveStart = null;
  checkRadio('hour', String(next));
  $('whenNow').classList.remove('on');
  $('nowNote').hidden = true;
}

function selectNow() {
  liveStart = new Date();
  for (const el of document.querySelectorAll('input[name="hour"]')) el.checked = false;
  $('whenNow').classList.add('on');
  const parts = jstParts(liveStart);
  const p = (n) => String(n).padStart(2, '0');
  $('nowNote').hidden = false;
  $('nowNote').textContent = `${parts.hh}時${p(parts.mm)}分から12時間`;
}

function resetSubState() {
  subToken += 1;
  sub.cues = [];
  sub.index = 0;
  sub.phase = 'idle';
  sub.left = 0;
  playMs = 0;
  showLive = false;
  captionEl.classList.remove('show');
  captionEl.setAttribute('aria-hidden', 'true');
  subNoteEl.textContent = '';
}

function resetRoute() {
  fraction = 0;
  playing = false;
  lastTick = 0;
  resetSubState();
  syncPlayButtons();
}

function syncPlayButtons() {
  const label = playing ? '停止' : '再生';
  const mark = playing ? '‖' : '▶';
  for (const id of ['play', 'playHud']) {
    const btn = $(id);
    btn.textContent = mark;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.classList.toggle('playing', playing);
  }
  document.body.classList.toggle('playing', playing);
  if (!playing) restorePanelAfterPlay();
}

function shadeNumber(lat, lst, sun) {
  const vec = apply3(horizontalMatrix(lat, lst), raDecToVec(sun[0], sun[1]));
  const alt = Math.asin(Math.max(-1, Math.min(1, vec[2]))) * 180 / Math.PI;
  const p = lat * Math.PI / 180;
  const d = sun[1] * Math.PI / 180;
  const toDeg = (x) => Math.asin(Math.max(-1, Math.min(1, x))) * 180 / Math.PI;
  const maxAlt = toDeg(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d));
  const minAlt = toDeg(Math.sin(p) * Math.sin(d) - Math.cos(p) * Math.cos(d));
  const span = maxAlt - minAlt;
  const t = span < 0.5 ? 0.5 : Math.max(0, Math.min(1, (alt - minAlt) / span));
  return Math.round(30 - t * 60);
}

function skyShade(lat, lst, sun) {
  if (!shadeAutoEl.checked) return Number(shadeEl.value);
  const shade = shadeNumber(lat, lst, sun);
  const text = `${shade > 0 ? '+' : ''}${shade}%`;
  if ($('shadeLabel').textContent !== text) $('shadeLabel').textContent = text;
  if (shadeEl.value !== String(shade)) shadeEl.value = String(shade);
  return shade;
}

function syncSubShade(lat, lst, sun) {
  if (!subShadeAutoEl.checked) return;
  const shade = shadeNumber(lat, lst, sun);
  const text = `${shade > 0 ? '+' : ''}${shade}%`;
  if ($('subShadeLabel').textContent !== text) $('subShadeLabel').textContent = text;
  if (subShadeEl.value !== String(shade)) subShadeEl.value = String(shade);
}

function updateLabels() {
  $('magLabel').textContent = `${magEl.value}等星`;
  if (!shadeAutoEl.checked) {
    const shade = Number(shadeEl.value);
    $('shadeLabel').textContent = `${shade > 0 ? '+' : ''}${shade}%`;
  }
  shadeEl.disabled = shadeAutoEl.checked;
  if (!subShadeAutoEl.checked) {
    const shade = Number(subShadeEl.value);
    $('subShadeLabel').textContent = `${shade > 0 ? '+' : ''}${shade}%`;
  }
  subShadeEl.disabled = subShadeAutoEl.checked;
  const starSize = Math.round(Number(starSizeEl.value) * 10) / 10;
  $('starSizeLabel').textContent = `${Number.isInteger(starSize) ? starSize : starSize.toFixed(1)}倍`;
  hudText.hidden = !infoEl.checked;
  $('placeName').textContent = placeName;
  const kind = placeKindEl.value;
  $('cityPlace').hidden = kind === 'geo';
  $('geoPlace').hidden = kind !== 'geo';
  applyCaptionStyle();
}

function updatePreset() {
  const value = showMinutesEl.value;
  for (const button of document.querySelectorAll('#presets button')) {
    button.classList.toggle('on', button.dataset.min === value);
  }
}

function hud(here, utc) {
  if (!infoEl.checked) {
    hudText.hidden = true;
    return;
  }
  hudText.hidden = false;
  const moon = moonRaDec(julianDate(utc));
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  const done = !playing && fraction >= 1;
  hudText.textContent = [
    placeName,
    `${formatJst(utc)} 日本時間`,
    `${formatLatLon(here.lat, here.lon)}  ${onLand ? '陸上' : '海上'}  現地 ${formatSolar(utc, here.lon)}`,
    `${done ? '12時間を見終わりました' : `12時間のうち ${pct}%`}　月 ${Math.round(moon.illum * 100)}%`,
  ].join('\n');
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function landmarkAt(here) {
  for (const [id, lat, lon] of LANDMARKS) {
    if (distanceKm(here.lat, here.lon, lat, lon) <= 18) return id;
  }
  return null;
}

function setRadius(next) {
  stopLookGlide();
  viewRadius = Math.max(MIN_R, Math.min(WIDE_MAX, next));
}

function viewBasis(altDeg, azDeg) {
  const alt = altDeg * Math.PI / 180;
  const az = azDeg * Math.PI / 180;
  const view = [
    Math.cos(alt) * Math.sin(az),
    Math.cos(alt) * Math.cos(az),
    Math.sin(alt),
  ];
  let ref = [0, 0, 1];
  if (Math.abs(view[2]) > 0.92) ref = [0, 1, 0];
  const dot = view[0] * ref[0] + view[1] * ref[1] + view[2] * ref[2];
  let up = [ref[0] - view[0] * dot, ref[1] - view[1] * dot, ref[2] - view[2] * dot];
  const ul = Math.hypot(up[0], up[1], up[2]) || 1;
  up = [up[0] / ul, up[1] / ul, up[2] / ul];
  const right = [
    view[1] * up[2] - view[2] * up[1],
    view[2] * up[0] - view[0] * up[2],
    view[0] * up[1] - view[1] * up[0],
  ];
  return { view, right, up };
}

function azGap(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function panBy(dx, dy) {
  if (!dx && !dy) return;
  stopLookGlide();
  const pxR = Math.max(40, layout.radius / Math.max(0.1, layout.dpr));
  const pix = Math.hypot(dx, -dy);
  if (pix < 0.01) return;
  const total = Math.atan(pix / pxR);
  const sx = -dx / pix;
  const sy = dy / pix;
  const steps = Math.max(1, Math.ceil(total / (2 * Math.PI / 180)));
  const ang = total / steps;
  for (let i = 0; i < steps; i++) {
    const { view, right, up } = viewBasis(centerAlt, centerAz);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const nv = [
      view[0] * c + (right[0] * sx + up[0] * sy) * s,
      view[1] * c + (right[1] * sx + up[1] * sy) * s,
      view[2] * c + (right[2] * sx + up[2] * sy) * s,
    ];
    const nlen = Math.hypot(nv[0], nv[1], nv[2]) || 1;
    const alt = Math.asin(Math.max(-1, Math.min(1, nv[2] / nlen))) * 180 / Math.PI;
    const az = Math.atan2(nv[0] / nlen, nv[1] / nlen) * 180 / Math.PI;
    if (centerAlt > 70 && alt < centerAlt && azGap(az, centerAz) > 90) {
      centerAlt = 90;
      break;
    }
    centerAlt = Math.max(-15, Math.min(90, alt));
    centerAz = az;
  }
}

function horizonAlt() {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  const focal = Math.max(w, h) / 2 / Math.tan(LOOK_R * Math.PI / 180);
  const margin = Math.min(64, Math.max(40, h * 0.055));
  const below = Math.max(12, h / 2 - margin);
  return Math.atan(below / focal) * 180 / Math.PI;
}

function lookSky(alt, az) {
  stopLookGlide();
  viewRadius = LOOK_R;
  centerAlt = alt;
  centerAz = az;
}

let lookGlide = null;

function stopLookGlide() {
  lookGlide = null;
}

function sameLookZoom() {
  return Math.abs(viewRadius - LOOK_R) < 0.05;
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function glideSky(alt, az) {
  if (!sameLookZoom()) {
    lookSky(alt, az);
    return;
  }
  const dAlt = alt - centerAlt;
  const dAz = (((az - centerAz) % 360) + 540) % 360 - 180;
  const turn = Math.max(Math.abs(dAlt), Math.abs(dAz));
  if (turn < 0.4) {
    stopLookGlide();
    centerAlt = alt;
    centerAz = az;
    return;
  }
  lookGlide = {
    fromAlt: centerAlt,
    fromAz: centerAz,
    toAlt: alt,
    toAz: az,
    dAlt,
    dAz,
    start: performance.now(),
    ms: Math.min(2000, Math.max(160, 1000 * (turn / 90))),
  };
}

function stepLookGlide(now) {
  if (!lookGlide) return;
  const t = Math.min(1, (now - lookGlide.start) / lookGlide.ms);
  const e = easeInOut(t);
  if (t >= 1) {
    centerAlt = lookGlide.toAlt;
    centerAz = lookGlide.toAz;
    const after = lookGlide.after;
    lookGlide = null;
    if (after) after();
    return;
  }
  centerAlt = lookGlide.fromAlt + lookGlide.dAlt * e;
  centerAz = lookGlide.fromAz + lookGlide.dAz * e;
}

function cueHold(text) {
  const n = Array.from(text).length;
  return Math.max(4, Math.min(12, n / 4)) * 1000;
}

function cueGap() {
  return 8000;
}

function fitCaption(text) {
  const fontSize = parseFloat(getComputedStyle(captionText).fontSize) || 32;
  const inner = Math.max(240, captionEl.clientWidth - 36);
  const perLine = Math.max(16, Math.floor(inner / fontSize));
  const budget = perLine * 3;
  const chars = Array.from(text);
  if (chars.length <= budget) return text;
  const cut = chars.slice(0, budget).join('');
  const dot = cut.lastIndexOf('。');
  if (dot >= 12) return cut.slice(0, dot + 1);
  return cut;
}

function applyCaptionStyle() {
  const shade = Math.max(-30, Math.min(30, Number(subShadeEl.value) || 0));
  const alpha = 0.55 + (shade / 30) * 0.30;
  const textAlpha = shade >= 0 ? 1 : 1 + (shade / 30) * 0.65;
  captionEl.style.background = `rgba(0, 0, 0, ${alpha.toFixed(3)})`;
  captionText.style.opacity = textAlpha.toFixed(3);
  $('captionCredit').style.opacity = textAlpha.toFixed(3);
  captionEl.style.setProperty('--sub-scale', String(subScale()));
}

function showCaption(text) {
  captionText.textContent = fitCaption(text);
  applyCaptionStyle();
  if (!subsEl.checked) {
    hideCaption();
    return;
  }
  captionEl.classList.add('show');
  captionEl.setAttribute('aria-hidden', 'false');
}

function hideCaption() {
  captionEl.classList.remove('show');
  captionEl.setAttribute('aria-hidden', 'true');
}

function cleanWiki(text) {
  let s = text;
  s = s.replace(/<ref[\s\S]*?<\/ref>/gi, '');
  s = s.replace(/<ref[^>]*\/?>/gi, '');
  let prev;
  do {
    prev = s;
    s = s.replace(/\{\{[^{}]*\}\}/g, '');
  } while (s !== prev);
  s = s.replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, '$1');
  s = s.replace(/'{2,}/g, '');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return s.replace(/\s+/g, ' ').trim();
}

function eventOf(line) {
  let depth = 0;
  let dash = -1;
  for (let i = 0; i < line.length - 2; i++) {
    if (line.startsWith('[[', i)) { depth += 1; i += 1; continue; }
    if (line.startsWith(']]', i)) { depth = Math.max(0, depth - 1); i += 1; continue; }
    if (depth === 0 && line.startsWith(' - ', i)) { dash = i; break; }
  }
  if (dash < 0) return null;
  const head = line.slice(0, dash);
  const yearMatch = head.match(/\[\[(\d{1,4})年\]\]/) || head.match(/^\*\s*(\d{1,4})年/);
  if (!yearMatch) return null;
  const text = cleanWiki(line.slice(dash + 3));
  if (!text) return null;
  return { year: Number(yearMatch[1]), text };
}

function sectionBody(wikitext, heading) {
  const mark = wikitext.match(heading);
  if (!mark) return '';
  const rest = wikitext.slice(mark.index + mark[0].length);
  const next = rest.search(/\n==[^=]/);
  return next < 0 ? rest : rest.slice(0, next);
}

function eventsInYear(wikitext, year, limit) {
  const found = [];
  for (const line of sectionBody(wikitext, /==\s*できごと\s*==/).split('\n')) {
    if (!/^\*\s*\S/.test(line) || line.startsWith('*:') || line.startsWith('**')) continue;
    const event = eventOf(line);
    if (!event || event.year !== year) continue;
    if (found.includes(event.text)) continue;
    found.push(event.text);
    if (found.length >= limit) break;
  }
  return found;
}

function memorialNames(wikitext) {
  const names = [];
  for (const line of sectionBody(wikitext, /==\s*記念日・年中行事\s*==/).split('\n')) {
    if (!/^\*[^*:]/.test(line)) continue;
    const name = cleanWiki(line.replace(/^\*\s*/, ''))
      .replace(/（[^）]*）/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name || name.length > 36 || names.includes(name)) continue;
    names.push(name);
    if (names.length >= 4) break;
  }
  return names;
}

function captionLines(wikitext, year, month, day) {
  const lines = [];
  for (const text of eventsInYear(wikitext, year, 8)) {
    const body = text.replace(/。+$/u, '');
    if (body) lines.push(`${body}。`);
  }
  for (const name of memorialNames(wikitext)) {
    const body = name.replace(/。+$/u, '');
    if (body) lines.push(`今日は何の日。${body}。`);
  }
  for (let ago = 1; ago <= 100; ago++) {
    for (const text of eventsInYear(wikitext, year - ago, 8)) {
      const body = text.replace(/。+$/u, '');
      if (!body) continue;
      lines.push(`${ago}年前（${year - ago}）の${month}月${day}日。${body}。`);
    }
  }
  return lines;
}

async function wikiPage(month, day) {
  const key = `${month}-${day}`;
  if (!wikiCache.has(key)) {
    const page = `${month}月${day}日`;
    const url = `https://ja.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('wiki');
    const data = await res.json();
    if (data.error) throw new Error(data.error.code || 'wiki');
    wikiCache.set(key, data.parse?.wikitext?.['*'] || '');
  }
  return wikiCache.get(key);
}

async function prepareSubtitles() {
  const token = ++subToken;
  const shown = localParts(showStart(), herePos().lon);
  let page = '';
  try {
    page = await wikiPage(shown.m, shown.d);
  } catch {
    if (token !== subToken) return;
    subNoteEl.textContent = '字幕を取れませんでした';
    hideCaption();
    return;
  }
  if (token !== subToken || !playing) return;
  const lines = captionLines(page, shown.y, shown.m, shown.d);
  if (!lines.length) {
    hideCaption();
    return;
  }
  sub.cues = lines;
  sub.index = 0;
  if (playMs < SUB_START_DELAY) {
    sub.phase = 'wait';
    hideCaption();
    return;
  }
  sub.phase = 'show';
  sub.left = cueHold(lines[0]);
  showCaption(lines[0]);
}

function stepSubtitles(dt) {
  if (!playing) return;
  if (sub.phase === 'wait') {
    if (playMs < SUB_START_DELAY || !sub.cues.length) return;
    sub.phase = 'show';
    sub.index = 0;
    sub.left = cueHold(sub.cues[0]);
    showCaption(sub.cues[0]);
    return;
  }
  if (sub.phase === 'idle' || sub.phase === 'done' || !sub.cues.length) return;
  sub.left -= dt;
  if (sub.left > 0) return;
  if (sub.phase === 'show') {
    if (sub.index >= sub.cues.length - 1) {
      sub.phase = 'done';
      hideCaption();
      return;
    }
    sub.phase = 'gap';
    sub.left = cueGap();
    hideCaption();
    return;
  }
  sub.index += 1;
  sub.phase = 'show';
  sub.left = cueHold(sub.cues[sub.index]);
  showCaption(sub.cues[sub.index]);
}

function playGreeting() {
  const line = GREET[jstParts(new Date()).m] || GREET[11];
  const root = $('greet');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.toggle('instant', reduce);
  const words = line.split(/\s+/);
  root.replaceChildren();
  for (const word of words) {
    const span = document.createElement('span');
    span.className = 'greet-word';
    span.textContent = word;
    root.appendChild(span);
  }
  const spans = [...root.children];
  if (reduce) spans.forEach((span) => span.classList.add('on'));
  else spans.forEach((span, i) => setTimeout(() => span.classList.add('on'), i * 1000));
  const visibleAt = reduce ? 0 : spans.length * 1000;
  setTimeout(() => root.classList.add('out'), visibleAt + 4000);
  setTimeout(() => root.remove(), visibleAt + 6000);
}

const meteors = [];

function spawnMeteor() {
  const alt0 = 18 + Math.random() * 55;
  const az0 = Math.random() * 360;
  const life = 0.35 + Math.random() * 0.45;
  const dist = (12 + Math.random() * 18) * life;
  const bearing = Math.random() * Math.PI * 2;
  meteors.push({
    alt0,
    az0,
    dAlt: Math.cos(bearing) * dist,
    dAz: Math.sin(bearing) * dist / Math.max(0.3, Math.cos(alt0 * Math.PI / 180)),
    age: 0,
    life,
    tailFrac: 0.28 + Math.random() * 0.32,
  });
}

function stepMeteors(dtMs) {
  if (!meteorsEl.checked) {
    meteors.length = 0;
    return;
  }
  const rate = METEOR_PER_SEC;
  const cap = METEOR_CAP;
  const dt = Math.min(0.1, Math.max(0, dtMs) / 1000);
  if (dt > 0 && meteors.length < cap && Math.random() < 1 - Math.exp(-rate * dt)) spawnMeteor();
  for (let i = meteors.length - 1; i >= 0; i--) {
    meteors[i].age += dt;
    if (meteors[i].age >= meteors[i].life) meteors.splice(i, 1);
  }
}

let meteorTick = 0;

function frame(now) {
  stepLookGlide(now);
  const meteorDt = meteorTick ? Math.min(100, now - meteorTick) : 0;
  meteorTick = now;
  stepMeteors(meteorDt);
  let travelDt = 0;
  if (playing && showLive) {
    const dt = lastTick ? Math.min(100, now - lastTick) : 0;
    lastTick = now;
    travelDt = dt;
    const step = dt / (readMinutes() * 60000);
    if (fraction + step >= 1) {
      fraction = 1;
      playing = false;
      showLive = false;
      lastTick = 0;
      sub.phase = 'done';
      hideCaption();
      syncPlayButtons();
    } else {
      fraction += step;
      playMs += dt;
      stepSubtitles(dt);
    }
  } else {
    lastTick = 0;
  }
  const utc = new Date(showStart().getTime() + fraction * SHOW_MS);
  const here = herePos();
  onLand = land.length ? isLand(land, here.lat, here.lon) : true;
  const jd = julianDate(utc);
  const lst = gmstDeg(jd) + here.lon;
  const sun = sunRaDec(jd);
  const shade = skyShade(here.lat, lst, sun);
  syncSubShade(here.lat, lst, sun);
  if (captionEl.classList.contains('show')) applyCaptionStyle();
  const moon = moonRaDec(jd);
  layout = renderer.draw({
    jd,
    precess: precessionMatrix(jd),
    lat: here.lat,
    lst,
    magLimit: Number(magEl.value),
    viewRadius,
    centerAlt,
    centerAz,
    northRot: 0,
    shade,
    starScale: Number(starSizeEl.value),
    showLines: linesEl.checked,
    showNames: namesEl.checked,
    showAltitude: altitudeEl.checked,
    playing,
    stars,
    faint: null,
    faintIndex: null,
    showFaint: false,
    faintLimit: 0,
    selected: null,
    sky,
    onLand,
    landAlpha: onLand ? 1 : 0,
    landmark: landmarkAt(here),
    sun: { ra: sun[0], dec: sun[1] },
    moon,
    planets: {
      venus: planetRaDec('venus', jd),
      mars: planetRaDec('mars', jd),
      jupiter: planetRaDec('jupiter', jd),
      saturn: planetRaDec('saturn', jd),
    },
    comet: null,
    meteors,
    ride: false,
    lon: here.lon,
    issAltKm: 0,
    land,
  }) || layout;
  novemberThanks.draw(now);
  hud(here, utc);
  globe.draw({ lat: here.lat, lon: here.lon, route: null, progress: fraction, live: false });
  requestAnimationFrame(frame);
}

function beginShow() {
  if (showLive || !playing) return;
  showLive = true;
  lastTick = 0;
  if (subsEl.checked && sub.phase === 'idle') prepareSubtitles();
  novemberThanks.start();
}

function aimSouthThenStart() {
  glideSky(horizonAlt(), 180);
  if (!lookGlide) beginShow();
  else lookGlide.after = () => { if (playing) beginShow(); };
}

function openShow() {
  const token = ++openToken;
  hidePanelForPlay();
  const goingFull = !document.fullscreenElement;
  if (goingFull) document.documentElement.requestFullscreen?.().catch(() => {});
  let begun = false;
  const go = () => {
    document.removeEventListener('fullscreenchange', go);
    if (begun || token !== openToken || !playing) return;
    begun = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (token !== openToken || !playing) return;
      if (!southAimed) {
        southAimed = true;
        aimSouthThenStart();
        return;
      }
      if (!showLive && !lookGlide) beginShow();
    }));
  };
  if (!goingFull) {
    go();
    return;
  }
  document.addEventListener('fullscreenchange', go);
  setTimeout(go, 800);
}

function togglePlay() {
  if (!playing && fraction >= 1) {
    fraction = 0;
    resetSubState();
  }
  playing = !playing;
  if (playing) openShow();
  else {
    openToken += 1;
    lastTick = 0;
  }
  syncPlayButtons();
}

function addTracks(fileList) {
  for (const file of fileList) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg)$/i.test(file.name)) continue;
    tracks.push({ name: file.name, url: URL.createObjectURL(file) });
  }
  if (tracks.length && audio.paused) playTrack(trackIndex);
  else updateTrackLabel();
}

function updateTrackLabel() {
  $('trackName').textContent = tracks.length ? tracks[trackIndex].name : '曲がまだありません';
}

function playTrack(index) {
  if (!tracks.length) return;
  trackIndex = (index + tracks.length) % tracks.length;
  audio.src = tracks[trackIndex].url;
  audio.play().catch(() => {});
  updateTrackLabel();
  $('musicToggle').textContent = '停止';
}

audio.addEventListener('ended', () => {
  if ($('shuffle').checked && tracks.length > 1) {
    let next = trackIndex;
    while (next === trackIndex) next = Math.floor(Math.random() * tracks.length);
    playTrack(next);
    return;
  }
  if (trackIndex < tracks.length - 1 || $('loop').checked) playTrack(trackIndex + 1);
  else $('musicToggle').textContent = '再生';
});

placeKindEl.addEventListener('change', () => {
  geoToken += 1;
  $('locate').disabled = false;
  if (placeKindEl.value === 'geo') {
    locate();
    return;
  }
  fillCities(placeKindEl.value);
  chooseCity();
});
cityEl.addEventListener('change', chooseCity);
$('locate').addEventListener('click', locate);

whenDateEl.addEventListener('change', () => {
  if (liveStart) selectHour(hour);
  resetRoute();
  saveSettings();
});
for (const el of document.querySelectorAll('input[name="hour"]')) {
  el.addEventListener('change', () => {
    selectHour(Number(el.value));
    resetRoute();
    saveSettings();
  });
}
$('whenNow').addEventListener('click', () => {
  selectNow();
  resetRoute();
});
showMinutesEl.addEventListener('change', () => {
  showMinutesEl.value = String(readMinutes());
  updatePreset();
  saveSettings();
});
for (const button of document.querySelectorAll('#presets button')) {
  button.addEventListener('click', () => {
    showMinutesEl.value = button.dataset.min;
    updatePreset();
    saveSettings();
  });
}
$('play').addEventListener('click', togglePlay);
$('playHud').addEventListener('click', togglePlay);
$('restart').addEventListener('click', () => {
  fraction = 0;
  playing = false;
  lastTick = 0;
  resetSubState();
  syncPlayButtons();
});

magEl.addEventListener('input', () => { updateLabels(); saveSettings(); });
shadeEl.addEventListener('input', () => {
  if (!shadeAutoEl.checked) manualShade = shadeEl.value;
  updateLabels();
  saveSettings();
});
shadeAutoEl.addEventListener('change', () => {
  if (shadeAutoEl.checked) manualShade = shadeEl.value;
  else shadeEl.value = manualShade;
  updateLabels();
  saveSettings();
});
subShadeEl.addEventListener('input', () => {
  if (!subShadeAutoEl.checked) manualSubShade = subShadeEl.value;
  updateLabels();
  saveSettings();
});
subShadeAutoEl.addEventListener('change', () => {
  if (subShadeAutoEl.checked) manualSubShade = subShadeEl.value;
  else subShadeEl.value = manualSubShade;
  updateLabels();
  saveSettings();
});
starSizeEl.addEventListener('input', () => { updateLabels(); saveSettings(); });
for (const el of [linesEl, namesEl, altitudeEl]) el.addEventListener('change', saveSettings);
infoEl.addEventListener('change', () => { updateLabels(); saveSettings(); });
meteorsEl.addEventListener('change', () => {
  if (!meteorsEl.checked) meteors.length = 0;
  saveSettings();
});
subsEl.addEventListener('change', () => {
  if (!subsEl.checked) hideCaption();
  else if (playing && sub.phase === 'idle') prepareSubtitles();
  else if (sub.phase === 'show' && sub.cues[sub.index]) showCaption(sub.cues[sub.index]);
  saveSettings();
});
for (const el of document.querySelectorAll('input[name="subSize"]')) {
  el.addEventListener('change', () => { updateLabels(); saveSettings(); });
}

function toggleFull() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

function syncFullButton() {
  const on = !!document.fullscreenElement;
  const btn = $('fullHud');
  btn.textContent = on ? '⤡' : '⛶';
  const label = on ? '全画面解除' : '全画面';
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

$('full').addEventListener('click', toggleFull);
$('fullHud').addEventListener('click', toggleFull);
document.addEventListener('fullscreenchange', syncFullButton);
syncFullButton();
let panelHiddenByPlay = false;
function hidePanelForPlay() {
  if (document.body.classList.contains('panel-hidden')) {
    panelHiddenByPlay = false;
    return;
  }
  panelHiddenByPlay = true;
  document.body.classList.add('panel-hidden');
}
function restorePanelAfterPlay() {
  if (!panelHiddenByPlay) return;
  panelHiddenByPlay = false;
  document.body.classList.remove('panel-hidden');
}
function releaseAutoPanel() {
  panelHiddenByPlay = false;
}
$('hide').addEventListener('click', () => {
  releaseAutoPanel();
  document.body.classList.add('panel-hidden');
});
$('panelToggle').addEventListener('click', () => {
  releaseAutoPanel();
  document.body.classList.toggle('panel-hidden');
});

let cursorTimer = 0;
function showCursor() {
  document.body.classList.remove('cursor-idle');
  clearTimeout(cursorTimer);
}
function armCursorHide() {
  showCursor();
  if (!document.body.classList.contains('buttons-hidden')) return;
  cursorTimer = setTimeout(() => {
    if (document.body.classList.contains('buttons-hidden')) document.body.classList.add('cursor-idle');
  }, 2000);
}
$('hideButtons').addEventListener('click', () => {
  document.body.classList.add('buttons-hidden');
  armCursorHide();
});
$('showButtons').addEventListener('click', () => {
  document.body.classList.remove('buttons-hidden');
  showCursor();
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
  if (document.body.classList.contains('buttons-hidden')) armCursorHide();
});

$('pickFiles').addEventListener('click', () => $('files').click());
$('files').addEventListener('change', () => { addTracks($('files').files); $('files').value = ''; });
$('pickDir').addEventListener('click', async () => {
  const dir = await window.showDirectoryPicker();
  const found = [];
  for await (const [, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue;
    if (!/\.(mp3|m4a|wav|ogg)$/i.test(handle.name)) continue;
    found.push(await handle.getFile());
  }
  addTracks(found);
});
$('musicToggle').addEventListener('click', () => {
  if (!tracks.length) {
    $('files').click();
    return;
  }
  if (audio.paused) {
    if (!audio.src) playTrack(trackIndex);
    else audio.play().catch(() => {});
    $('musicToggle').textContent = '停止';
  } else {
    audio.pause();
    $('musicToggle').textContent = '再生';
  }
});
$('volume').addEventListener('input', () => { audio.volume = Number($('volume').value); saveSettings(); });
$('loop').addEventListener('change', saveSettings);
$('shuffle').addEventListener('change', saveSettings);

$('zoomIn').addEventListener('click', () => setRadius(viewRadius * 0.72));
$('zoomOut').addEventListener('click', () => setRadius(viewRadius * 1.28));
$('homeView').addEventListener('click', () => {
  selectNow();
  resetRoute();
  glideSky(horizonAlt(), 180);
});
$('zenith').addEventListener('click', () => glideSky(90, centerAz));
$('lookN').addEventListener('click', () => glideSky(horizonAlt(), 0));
$('lookE').addEventListener('click', () => glideSky(horizonAlt(), 90));
$('lookS').addEventListener('click', () => glideSky(horizonAlt(), 180));
$('lookW').addEventListener('click', () => glideSky(horizonAlt(), 270));

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  }
});
window.addEventListener('resize', () => renderer.resize());
$('panel').addEventListener('submit', (e) => e.preventDefault());

const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => {
  stopLookGlide();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    canvas.setPointerCapture(e.pointerId);
    canvas.dataset.drag = '1';
    canvas.dataset.x = String(e.clientX);
    canvas.dataset.y = String(e.clientY);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const prev = Number(canvas.dataset.pinch || dist);
    if (canvas.dataset.pinch) setRadius(viewRadius * (prev / dist));
    canvas.dataset.pinch = String(dist);
    return;
  }
  if (canvas.dataset.drag !== '1') return;
  const dx = e.clientX - Number(canvas.dataset.x);
  const dy = e.clientY - Number(canvas.dataset.y);
  canvas.dataset.x = String(e.clientX);
  canvas.dataset.y = String(e.clientY);
  panBy(dx, dy);
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) delete canvas.dataset.pinch;
  if (pointers.size === 0) delete canvas.dataset.drag;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  setRadius(viewRadius * (e.deltaY > 0 ? 1.12 : 0.88));
}, { passive: false });

async function boot() {
  try {
    const [starBuf, skyJson, landJson] = await Promise.all([
      fetch('data/stars8.bin').then((r) => { if (!r.ok) throw new Error('stars'); return r.arrayBuffer(); }),
      fetch('data/sky.json').then((r) => { if (!r.ok) throw new Error('sky'); return r.json(); }),
      fetch('data/land.geojson').then((r) => { if (!r.ok) throw new Error('land'); return r.json(); }),
    ]);
    stars = decodeStars(starBuf);
    sky = skyJson;
    land = prepareLand(landJson);
    globe.setLand(land);
  } catch (err) {
    hudText.textContent = '星のデータを読めませんでした。ページを開き直してください。';
    console.error(err);
  }
  locate();
  updateLabels();
  playGreeting();
  requestAnimationFrame(() => {
    lookSky(horizonAlt(), 180);
    requestAnimationFrame(frame);
  });
}

boot();
