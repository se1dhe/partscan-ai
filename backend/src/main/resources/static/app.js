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

const SCANNER_TICK_MS = 420;
const REQUIRED_STABLE_TICKS = 2;
const NORMAL_SCAN_COOLDOWN_MS = 5_000;
const SAVED_SCAN_COOLDOWN_MS = 9_000;
const REJECTED_SCAN_COOLDOWN_MS = 12_000;
const ERROR_SCAN_COOLDOWN_MS = 7_000;
const RATE_LIMIT_COOLDOWN_MS = 8_000;
const ANGLE_CAPTURE_COOLDOWN_MS = 900;
const MIN_FINGERPRINT_DELTA_FOR_NEW_SCAN = 12;
const MIN_FINGERPRINT_DELTA_FOR_NEXT_ANGLE = 7;

const angleSteps = [
  { short: 'целиком', guide: 'guide-overview', direction: 'center', arrow: '◎', title: 'Общий вид', hint: 'Держите деталь или узел в большой рамке', caption: 'общий вид детали', action: 'поместите деталь в центр' },
  { short: 'маркировка', guide: 'guide-marking', direction: 'closer', arrow: '↓', title: 'Маркировка', hint: 'Подведите камеру к номеру, наклейке или логотипу', caption: 'номер / наклейка / логотип', action: 'покажите номер крупнее' },
  { short: 'сбоку', guide: 'guide-side', direction: 'right', arrow: '→', title: 'Боковой угол', hint: 'Сместите камеру левее или правее, деталь трогать не нужно', caption: 'камера под углом сбоку', action: 'сместитесь камерой в сторону' },
  { short: 'разъёмы', guide: 'guide-connectors', direction: 'lower', arrow: '↘', title: 'Разъёмы / крепления', hint: 'Подведите камеру к фишкам, портам, трубкам или креплениям', caption: 'разъёмы / фишки / крепления', action: 'покажите места подключения' }
];

let stream;
let scannerTimer;
let scanning = false;
let scanArmed = false;
let pausedUntil = 0;
let pauseReason = '';
let previousFingerprint = null;
let stableScore = 0;
let capturedAngles = [];
let capturedAngleFingerprints = [];
let currentAngleIndex = 0;
let multiAngleMode = false;
let lastSubmittedFingerprint = null;
let lastRejectedFingerprint = null;
let lastCaptureFingerprint = null;
let lastAiRequestAt = 0;
let preliminaryPartName = '';
let preliminaryPartConfidence = 0;

startScanButton?.addEventListener('click', armScanner);
startCamera();

async function startCamera() {
  stopCamera();
  scanArmed = false;
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
  setReadyOverlay(false);
  setStatus('Ищу деталь', 'Держите автодеталь внутри контура');
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
    if (!scanArmed || !video.videoWidth || scanning) return;

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
      guidance.textContent = multiAngleMode ? angleSteps[currentAngleIndex].hint : ready.hint;
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
      if (multiAngleMode) await captureAngle(metrics.fingerprint);
      else await submitScan([await captureBlob()], metrics.fingerprint);
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
  multiAngleMode = false;
  lastSubmittedFingerprint = null;
  lastRejectedFingerprint = null;
  lastCaptureFingerprint = null;
  lastAiRequestAt = 0;
  preliminaryPartName = '';
  preliminaryPartConfidence = 0;
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
  if (multiAngleMode) {
    const previousAngleFingerprint = capturedAngleFingerprints[capturedAngleFingerprints.length - 1];
    if (previousAngleFingerprint != null && fingerprintDelta(metrics.fingerprint, previousAngleFingerprint) < MIN_FINGERPRINT_DELTA_FOR_NEXT_ANGLE) {
      return { ok: false, reason: 'Смените позицию камеры', hint: angleSteps[currentAngleIndex].hint };
    }
    return { ok: true };
  }

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

async function submitScan(blobs, fingerprint = null) {
  if (scanning) return;
  scanning = true;
  setOverlay(true, blobs.length > 1 ? `Анализ ${blobs.length} ракурсов` : 'Анализирую кадр');
  lastAiRequestAt = Date.now();
  if (fingerprint != null) lastSubmittedFingerprint = fingerprint;
  setCooldown(NORMAL_SCAN_COOLDOWN_MS, 'Анализ кадра');
  setStatus(blobs.length > 1 ? `Анализ ${blobs.length} ракурсов` : 'Анализ кадра', 'Ждём ответ модели');

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

    handleScanResult(payload.part);
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (error) {
    setStatus('Ошибка анализа', error.message || 'Попробуйте ещё раз');
    setCooldown(ERROR_SCAN_COOLDOWN_MS, 'Пауза после ошибки');
    tg?.HapticFeedback?.notificationOccurred('error');
  } finally {
    scanning = false;
    setOverlay(false);
  }
}

function handleScanResult(part) {
  const confidence = part?.confidence || 0;
  const percent = Math.round(confidence * 100);
  const name = compactPartName(part?.name || part?.normalizedName || 'Деталь');

  if (confidence < 0.9 || part?.needsBetterPhoto) {
    preliminaryPartName = name;
    preliminaryPartConfidence = percent;
    setStatus(`${name} · ${percent}%`, 'Предварительно найдено и сохранено. Для точности покажите ещё одну зону детали');
    enterMultiAngleMode(name, percent);
    return;
  }

  preliminaryPartName = '';
  preliminaryPartConfidence = 0;
  setStatus(`${name} · ${percent}%`, 'Сохранено в базе');
  resetMultiAngleMode();
  setCooldown(SAVED_SCAN_COOLDOWN_MS, 'Деталь сохранена');
}

function showRejected(payload) {
  resetMultiAngleMode();
  setCoach({ guide: 'guide-overview', direction: 'center', arrow: '◎', title: 'Это не автодеталь', hint: payload.nextAction || 'Наведите камеру на автомобильную деталь', caption: 'автодеталь / узел', action: 'покажите деталь машины' });
  setStatus('Не сохраняю в базу', payload.message || 'В кадре не похожая на автодеталь вещь');
  setCooldown(REJECTED_SCAN_COOLDOWN_MS, 'Не автодеталь');
}

function showRateLimited(payload) {
  setStatus('Слишком часто', payload.message || 'Нужно немного подождать');
  setCooldown(RATE_LIMIT_COOLDOWN_MS, 'Лимит защиты');
}

function enterMultiAngleMode(name = preliminaryPartName, percent = preliminaryPartConfidence) {
  multiAngleMode = true;
  capturedAngles = [];
  capturedAngleFingerprints = [];
  currentAngleIndex = 0;
  setCoach(angleSteps[currentAngleIndex]);
  if (name) {
    angleTitle.textContent = `Найдено: ${name}`;
    shapeCaption.textContent = `${percent}% · нужен доп. ракурс`;
    guideAction.textContent = 'теперь покажите нужную зону';
  }
  setCooldown(ANGLE_CAPTURE_COOLDOWN_MS, 'Подготовьте позицию камеры');
}

async function captureAngle(fingerprint) {
  if (fingerprint != null && lastCaptureFingerprint != null && fingerprintDelta(fingerprint, lastCaptureFingerprint) < MIN_FINGERPRINT_DELTA_FOR_NEXT_ANGLE) {
    setStatus('Позиция почти та же', angleSteps[currentAngleIndex].hint);
    setCooldown(ANGLE_CAPTURE_COOLDOWN_MS, 'Сместите камеру');
    return;
  }

  capturedAngles.push(await captureBlob());
  if (fingerprint != null) {
    capturedAngleFingerprints.push(fingerprint);
    lastCaptureFingerprint = fingerprint;
  }
  tg?.HapticFeedback?.impactOccurred('light');

  if (capturedAngles.length >= angleSteps.length) {
    const blobs = [...capturedAngles];
    const finalFingerprint = fingerprint ?? lastCaptureFingerprint;
    resetMultiAngleMode(false);
    await submitScan(blobs, finalFingerprint);
    return;
  }

  currentAngleIndex = capturedAngles.length;
  setCoach(angleSteps[currentAngleIndex]);
  if (preliminaryPartName) {
    setStatus(`${preliminaryPartName} · ${preliminaryPartConfidence}%`, `${capturedAngles.length}/${angleSteps.length} зон · ${angleSteps[currentAngleIndex].hint}`);
  } else {
    setStatus(`${capturedAngles.length}/${angleSteps.length} зон снято`, angleSteps[currentAngleIndex].hint);
  }
  setCooldown(ANGLE_CAPTURE_COOLDOWN_MS, 'Смените позицию камеры');
}

function resetMultiAngleMode(resetCoach = true) {
  multiAngleMode = false;
  capturedAngles = [];
  capturedAngleFingerprints = [];
  currentAngleIndex = 0;
  lastCaptureFingerprint = null;
  preliminaryPartName = '';
  preliminaryPartConfidence = 0;
  if (resetCoach) setCoach(angleSteps[0]);
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

function setShape(shapeClass, caption) {
  setCoach({ guide: shapeClass, direction: 'center', arrow: '◎', title: angleTitle.textContent || '', hint: angleHint.textContent || '', caption, action: caption || '' });
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
