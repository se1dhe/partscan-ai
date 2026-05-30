const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const video = document.getElementById('camera');
const canvas = document.getElementById('frameCanvas');
const partShapeGuide = document.getElementById('partShapeGuide');
const shapeCaption = document.getElementById('shapeCaption');
const guideAction = document.getElementById('guideAction');
const guideArrow = document.getElementById('guideArrow');
const angleTitle = document.getElementById('angleTitle');
const angleHint = document.getElementById('angleHint');
const guidance = document.getElementById('guidance');
const statusLabel = document.getElementById('status');
const progressLine = document.getElementById('progressLine')?.querySelector('span');
const scanOverlay = document.getElementById('scanOverlay');
const scanOverlayText = document.getElementById('scanOverlayText');
const readyOverlay = document.getElementById('readyOverlay');
const startScanButton = document.getElementById('startScanButton');
const scanAngleButton = document.getElementById('scanAngleButton');

const SCANNER_TICK_MS = 420;
const REQUIRED_STABLE_TICKS = 2;
const NORMAL_SCAN_COOLDOWN_MS = 1_200;
const SAVED_SCAN_COOLDOWN_MS = 3_000;
const REJECTED_SCAN_COOLDOWN_MS = 3_000;
const ERROR_SCAN_COOLDOWN_MS = 4_000;
const RATE_LIMIT_COOLDOWN_MS = 5_000;
const MIN_FINGERPRINT_DELTA_FOR_NEW_SCAN = 12;
const MIN_FINGERPRINT_DELTA_FOR_NEXT_ANGLE = 4;
const MAX_MANUAL_ANGLES = 3;

const angleSteps = [
  { short: 'целиком', guide: 'guide-overview', direction: 'center', arrow: '◎', title: 'Общий вид', hint: 'Держите деталь или узел в большой рамке', caption: 'общий вид детали', action: 'поместите деталь в центр' },
  { short: 'маркировка', guide: 'guide-marking', direction: 'closer', arrow: '↓', title: 'Маркировка', hint: 'Подведите камеру к номеру, наклейке или логотипу', caption: 'номер / наклейка / логотип', action: 'покажите номер крупнее' },
  { short: 'разъёмы', guide: 'guide-connectors', direction: 'lower', arrow: '↘', title: 'Разъёмы / крепления', hint: 'Подведите камеру к фишкам, портам, трубкам или креплениям', caption: 'разъёмы / фишки / крепления', action: 'покажите места подключения' },
  { short: 'сбоку', guide: 'guide-side', direction: 'right', arrow: '→', title: 'Боковой угол', hint: 'Сместите камеру левее или правее, деталь трогать не нужно', caption: 'камера под углом сбоку', action: 'сместитесь камерой в сторону' }
];

let stream;
let scannerTimer;
let scanning = false;
let scanArmed = false;
let waitingManualAngle = false;
let pausedUntil = 0;
let pauseReason = '';
let previousFingerprint = null;
let stableScore = 0;
let capturedAngles = [];
let capturedAngleFingerprints = [];
let currentAngleIndex = 0;
let lastSubmittedFingerprint = null;
let lastRejectedFingerprint = null;
let lastCaptureFingerprint = null;
let preliminaryPartName = '';
let preliminaryPartConfidence = 0;

startScanButton?.addEventListener('click', armScanner);
scanAngleButton?.addEventListener('click', scanManualAngle);
startCamera();

async function startCamera() {
  stopCamera();
  scanArmed = false;
  waitingManualAngle = false;
  setManualScanButton(false);
  setOverlay(false);
  setReadyOverlay(false);
  setStatus('Запрашиваю камеру', 'Разрешите доступ к камере');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1440 },
        focusMode: { ideal: 'continuous' }
      },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    resetScannerMemory();
    setCoach(angleSteps[0]);
    setStatus('Камера готова', 'Нажмите кнопку в центре, когда будете готовы сканировать');
    setReadyOverlay(true);
  } catch (error) {
    setStatus('Нет доступа к камере', 'Откройте по HTTPS и разрешите камеру');
  }
}

function armScanner() {
  scanArmed = true;
  waitingManualAngle = false;
  setManualScanButton(false);
  setReadyOverlay(false);
  setStatus('Ищу деталь', 'Первый кадр поймаю автоматически');
  tg?.HapticFeedback?.impactOccurred('light');
  startAutoScanner();
}

function stopCamera() {
  if (stream) stream.getTracks().forEach(track => track.stop());
  if (scannerTimer) clearInterval(scannerTimer);
  scannerTimer = null;
}

function startAutoScanner() {
  if (scannerTimer) clearInterval(scannerTimer);
  scannerTimer = setInterval(async () => {
    if (!scanArmed || waitingManualAngle || !video.videoWidth || scanning) return;

    const now = Date.now();
    const metrics = sampleFrameMetrics();

    if (now < pausedUntil) {
      stableScore = 0;
      showCooldown(now);
      updateProgress(metrics, { ok: false });
      return;
    }

    const ready = isFrameReady(metrics);
    updateProgress(metrics, ready);

    if (!ready.ok) {
      statusLabel.textContent = ready.reason;
      guidance.textContent = ready.hint;
      return;
    }

    const duplicateGuard = duplicateFrameGuard(metrics);
    if (!duplicateGuard.ok) {
      stableScore = 0;
      statusLabel.textContent = duplicateGuard.reason;
      guidance.textContent = duplicateGuard.hint;
      return;
    }

    stableScore += 1;
    statusLabel.textContent = stableScore >= REQUIRED_STABLE_TICKS ? 'Захват кадра' : 'Почти готово';
    guidance.textContent = `Держите ровно ${Math.min(stableScore, REQUIRED_STABLE_TICKS)}/${REQUIRED_STABLE_TICKS}`;

    if (stableScore >= REQUIRED_STABLE_TICKS) {
      stableScore = 0;
      await submitScan([await captureBlob()], metrics.fingerprint, false);
    }
  }, SCANNER_TICK_MS);
}

function resetScannerMemory() {
  pausedUntil = 0;
  pauseReason = '';
  previousFingerprint = null;
  stableScore = 0;
  capturedAngles = [];
  capturedAngleFingerprints = [];
  currentAngleIndex = 0;
  lastSubmittedFingerprint = null;
  lastRejectedFingerprint = null;
  lastCaptureFingerprint = null;
  preliminaryPartName = '';
  preliminaryPartConfidence = 0;
  waitingManualAngle = false;
  setManualScanButton(false);
  if (progressLine) progressLine.style.width = '8%';
}

function sampleFrameMetrics() {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 48;
  canvas.height = 48;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let brightnessSum = 0;
  let contrastSum = 0;
  let fingerprint = 0;
  let previous = 0;

  for (let i = 0; i < data.length; i += 4) {
    const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
    brightnessSum += value;
    contrastSum += Math.abs(value - previous);
    fingerprint += Math.round(value / 16) * ((i / 4) % 17 + 1);
    previous = value;
  }

  const pixels = data.length / 4;
  const brightness = brightnessSum / pixels;
  const contrast = contrastSum / pixels;
  const motion = previousFingerprint == null ? 999 : Math.abs(fingerprint - previousFingerprint) / pixels;
  previousFingerprint = fingerprint;
  return { brightness, contrast, motion, fingerprint };
}

function isFrameReady(metrics) {
  if (metrics.brightness < 42) return fail(metrics, 'Темно', 'Добавьте свет или фонарик');
  if (metrics.brightness > 232) return fail(metrics, 'Блик', 'Сместите камеру от блика');
  if (metrics.contrast < 6) return fail(metrics, 'Не в фокусе', 'Подведите камеру ближе к детали');
  if (metrics.motion > 46) return fail(metrics, 'Камера движется', 'На секунду зафиксируйте телефон');
  return { ...metrics, ok: true, reason: 'Кадр подходит', hint: 'Не двигайте телефон' };
}

function fail(metrics, reason, hint) {
  stableScore = 0;
  return { ...metrics, ok: false, reason, hint };
}

function duplicateFrameGuard(metrics) {
  if (lastSubmittedFingerprint != null && fingerprintDelta(metrics.fingerprint, lastSubmittedFingerprint) < MIN_FINGERPRINT_DELTA_FOR_NEW_SCAN) {
    return { ok: false, reason: 'Кадр уже проверен', hint: 'Сместите камеру или покажите другую часть детали' };
  }

  if (lastRejectedFingerprint != null && fingerprintDelta(metrics.fingerprint, lastRejectedFingerprint) < MIN_FINGERPRINT_DELTA_FOR_NEW_SCAN) {
    return { ok: false, reason: 'Это уже проверяли', hint: 'Наведите камеру на автодеталь или узел машины' };
  }

  return { ok: true };
}

function fingerprintDelta(current, previous) {
  return Math.abs(current - previous) / (48 * 48);
}

function updateProgress(metrics, ready) {
  if (!progressLine) return;
  const base = ready.ok ? 70 + stableScore * 15 : Math.max(10, Math.min(58, metrics.contrast * 5));
  progressLine.style.width = `${Math.min(100, base)}%`;
}

function showCooldown(now) {
  const seconds = Math.ceil((pausedUntil - now) / 1000);
  statusLabel.textContent = pauseReason || 'Пауза';
  guidance.textContent = seconds > 0 ? `Следующий анализ через ${seconds} сек.` : 'Можно продолжать';
}

function setCooldown(milliseconds, reason) {
  pausedUntil = Date.now() + milliseconds;
  pauseReason = reason;
}

async function captureBlob() {
  const sourceWidth = video.videoWidth || 1280;
  const sourceHeight = video.videoHeight || 720;
  const scale = Math.min(1, 1500 / Math.max(sourceWidth, sourceHeight));
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(video, 0, 0, width, height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
}

async function submitScan(blobs, fingerprint = null, manualAngle = false) {
  if (scanning) return;
  scanning = true;
  setManualScanButton(false);
  setOverlay(true, blobs.length > 1 ? `Анализ ${blobs.length} кадров` : 'Анализирую кадр');
  if (fingerprint != null) lastSubmittedFingerprint = fingerprint;
  setCooldown(NORMAL_SCAN_COOLDOWN_MS, 'Анализ кадра');
  setStatus(blobs.length > 1 ? `Анализ ${blobs.length} кадров` : 'Анализ кадра', 'Ждём ответ модели');

  try {
    const form = new FormData();
    if (blobs.length === 1) form.append('file', blobs[0], `part-${Date.now()}.jpg`);
    else blobs.forEach((blob, index) => form.append('files', blob, `part-angle-${index + 1}.jpg`));

    const response = await fetch('/api/v1/scan', { method: 'POST', body: form });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || payload.detail || payload.message || 'Ошибка сканирования');

    if (payload.status === 'rate_limited') {
      showRateLimited(payload);
      return;
    }

    if (payload.status === 'rejected') {
      if (fingerprint != null) lastRejectedFingerprint = fingerprint;
      showRejected(payload);
      tg?.HapticFeedback?.notificationOccurred('warning');
      return;
    }

    handleScanResult(payload.part, payload.status, payload.nextAction, manualAngle);
    tg?.HapticFeedback?.notificationOccurred(payload.status === 'saved' ? 'success' : 'warning');
  } catch (error) {
    setStatus('Ошибка анализа', error.message || 'Попробуйте ещё раз');
    setCooldown(ERROR_SCAN_COOLDOWN_MS, 'Пауза после ошибки');
    tg?.HapticFeedback?.notificationOccurred('error');
  } finally {
    scanning = false;
    setOverlay(false);
  }
}

function handleScanResult(part, status, nextAction, manualAngle) {
  const confidence = part?.confidence || 0;
  const percent = Math.round(confidence * 100);
  const name = compactPartName(part?.name || part?.normalizedName || 'Деталь');

  if (status === 'needs_angle' || confidence < 0.9 || part?.needsBetterPhoto) {
    preliminaryPartName = name;
    preliminaryPartConfidence = percent;
    if (!manualAngle && capturedAngles.length === 0) capturedAngles.pushCurrent = true;
    enterManualAngleMode(name, percent, nextAction);
    return;
  }

  setStatus(`${name} · ${percent}%`, 'Готово. Сохранено в базе');
  resetScannerMemory();
  setCoach(angleSteps[0]);
  setCooldown(SAVED_SCAN_COOLDOWN_MS, 'Деталь сохранена');
}

function showRejected(payload) {
  resetScannerMemory();
  setCoach({ guide: 'guide-overview', direction: 'center', arrow: '◎', title: 'Это не автодеталь', hint: payload.nextAction || 'Наведите камеру на автомобильную деталь', caption: 'автодеталь / узел', action: 'покажите деталь машины' });
  setStatus('Не сохраняю в базу', payload.message || 'В кадре не похожая на автодеталь вещь');
  setCooldown(REJECTED_SCAN_COOLDOWN_MS, 'Не автодеталь');
}

function showRateLimited(payload) {
  setStatus('Слишком часто', payload.message || 'Нужно немного подождать');
  setCooldown(RATE_LIMIT_COOLDOWN_MS, 'Лимит защиты');
  if (waitingManualAngle) setManualScanButton(true);
}

function enterManualAngleMode(name, percent, nextAction) {
  waitingManualAngle = true;
  scanArmed = true;
  currentAngleIndex = Math.min(capturedAngles.length + 1, angleSteps.length - 1);
  setCoach(angleSteps[currentAngleIndex]);
  angleTitle.textContent = `Найдено: ${name}`;
  shapeCaption.textContent = `${percent}% · нужен ракурс`;
  guideAction.textContent = nextAction || angleSteps[currentAngleIndex].action;
  setStatus(`${name} · ${percent}%`, `${nextAction || angleSteps[currentAngleIndex].hint}. Наведите камеру и нажмите “Сканировать ракурс”.`);
  setManualScanButton(true);
  if (progressLine) progressLine.style.width = '100%';
}

async function scanManualAngle() {
  if (scanning || !waitingManualAngle || !video.videoWidth) return;
  const metrics = sampleFrameMetrics();
  const ready = isFrameReady(metrics);
  if (!ready.ok) {
    setStatus(ready.reason, ready.hint);
    setManualScanButton(true);
    return;
  }

  if (lastCaptureFingerprint != null && fingerprintDelta(metrics.fingerprint, lastCaptureFingerprint) < MIN_FINGERPRINT_DELTA_FOR_NEXT_ANGLE) {
    setStatus('Позиция почти та же', 'Сместите камеру к маркировке, разъёму или креплению');
    setManualScanButton(true);
    return;
  }

  const blob = await captureBlob();
  capturedAngles.push(blob);
  capturedAngleFingerprints.push(metrics.fingerprint);
  lastCaptureFingerprint = metrics.fingerprint;

  const packageForAi = [...capturedAngles];
  setStatus(`Ракурс ${capturedAngles.length}/${MAX_MANUAL_ANGLES}`, 'Отправляю уточнение в AI');
  await submitScan(packageForAi, metrics.fingerprint, true);

  if (waitingManualAngle && capturedAngles.length >= MAX_MANUAL_ANGLES) {
    setStatus(`${preliminaryPartName} · ${preliminaryPartConfidence}%`, 'Точности всё ещё мало. Попробуйте другую деталь или крупнее покажите маркировку');
    setManualScanButton(true, 'Сканировать ещё раз');
  }
}

function setManualScanButton(show, text = 'Сканировать ракурс') {
  if (!scanAngleButton) return;
  scanAngleButton.hidden = !show;
  scanAngleButton.textContent = text;
}

function setCoach(step) {
  angleTitle.textContent = step.title;
  angleHint.textContent = step.hint;
  partShapeGuide.className = `part-shape-guide ${step.guide || 'guide-overview'}`;
  partShapeGuide.dataset.direction = step.direction || 'center';
  shapeCaption.textContent = step.caption || '';
  if (guideAction) guideAction.textContent = step.action || step.hint || '';
  if (guideArrow) guideArrow.textContent = step.arrow || '◎';
}

function setStatus(status, hint) {
  statusLabel.textContent = status;
  guidance.textContent = hint;
}

function setOverlay(show, text = 'Анализирую') {
  if (!scanOverlay) return;
  scanOverlay.hidden = !show;
  if (scanOverlayText) scanOverlayText.textContent = text;
}

function setReadyOverlay(show) {
  if (!readyOverlay) return;
  readyOverlay.hidden = !show;
}

function compactPartName(value) {
  const text = String(value || 'Деталь').trim();
  return text.length > 34 ? `${text.slice(0, 31).trim()}…` : text;
}

async function readJsonResponse(response) {
  try { return await response.json(); } catch { return {}; }
}
