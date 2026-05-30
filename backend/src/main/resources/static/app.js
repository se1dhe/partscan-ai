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
const scanButton = document.getElementById('scanAngleButton');

const SAVED_SCAN_COOLDOWN_MS = 1_200;
const REJECTED_SCAN_COOLDOWN_MS = 1_200;
const ERROR_SCAN_COOLDOWN_MS = 2_000;
const RATE_LIMIT_COOLDOWN_MS = 4_000;
const MAX_SCAN_FRAMES = 4;

const guideSteps = [
  { guide: 'guide-overview', direction: 'center', arrow: '◎', title: 'Быстрый скан', hint: 'Наведите камеру на деталь и нажмите СКАН', caption: 'быстрый ручной режим', action: 'наведите и нажмите СКАН' },
  { guide: 'guide-marking', direction: 'closer', arrow: '↓', title: 'Уточнить маркировку', hint: 'Покажите номер, наклейку или логотип', caption: 'номер / наклейка / логотип', action: 'покажите номер крупнее' },
  { guide: 'guide-connectors', direction: 'lower', arrow: '↘', title: 'Уточнить разъёмы', hint: 'Покажите фишки, порты, трубки или крепления', caption: 'разъёмы / крепления', action: 'покажите места подключения' },
  { guide: 'guide-side', direction: 'right', arrow: '→', title: 'Уточнить сбоку', hint: 'Сместите камеру в сторону, деталь трогать не нужно', caption: 'боковой угол', action: 'сместитесь камерой в сторону' }
];

let stream;
let scanning = false;
let pausedUntil = 0;
let pauseReason = '';
let scanMode = 'idle';
let scanFrames = [];
let currentGuideIndex = 0;
let lastPreviewName = '';
let lastPreviewConfidence = 0;
let lastRejectedAt = 0;

startScanButton?.addEventListener('click', openFastScanner);
scanButton?.addEventListener('click', handleMainScanButton);
scanButton?.addEventListener('touchend', event => {
  event.preventDefault();
  handleMainScanButton();
}, { passive: false });
startCamera();

async function startCamera() {
  stopCamera();
  setMainButton(false);
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
    resetSession();
    setGuide(0);
    setStatus('Камера готова', 'Нажмите “Перейти к скану”');
    setReadyOverlay(true);
  } catch (error) {
    setStatus('Нет доступа к камере', 'Откройте по HTTPS и разрешите камеру');
  }
}

function openFastScanner() {
  resetSession();
  scanMode = 'single';
  setReadyOverlay(false);
  setGuide(0);
  setStatus('Готов к скану', 'Наведите камеру на деталь и нажмите СКАН');
  setMainButton(true, 'СКАН');
  tg?.HapticFeedback?.impactOccurred('light');
}

function stopCamera() {
  if (stream) stream.getTracks().forEach(track => track.stop());
}

function resetSession() {
  scanning = false;
  pausedUntil = 0;
  pauseReason = '';
  scanMode = 'idle';
  scanFrames = [];
  currentGuideIndex = 0;
  lastPreviewName = '';
  lastPreviewConfidence = 0;
  if (progressLine) progressLine.style.width = '8%';
}

async function handleMainScanButton() {
  if (!video.videoWidth) {
    setStatus('Камера не готова', 'Подождите запуск камеры');
    return;
  }

  if (scanning) {
    setStatus('Уже сканирую', 'Дождитесь ответа модели');
    return;
  }

  const now = Date.now();
  if (now < pausedUntil) {
    const seconds = Math.ceil((pausedUntil - now) / 1000);
    setStatus(pauseReason || 'Пауза', `Повтор через ${seconds} сек.`);
    return;
  }

  if (scanMode === 'repeat') {
    startRepeatScan();
    return;
  }

  await captureAndSubmit(scanMode === 'refine');
}

function startRepeatScan() {
  scanFrames = [];
  scanMode = 'single';
  currentGuideIndex = 0;
  setGuide(0);
  setStatus('Готов к скану', 'Наведите камеру на деталь и нажмите СКАН');
  setMainButton(true, 'СКАН');
}

async function captureAndSubmit(refine) {
  const metrics = sampleFrameMetrics();
  const ready = isFrameReady(metrics);
  if (!ready.ok) {
    setStatus(ready.reason, ready.hint);
    setMainButton(true, refine ? 'Сканировать уточнение' : 'СКАН');
    return;
  }

  const blob = await captureBlob();
  const frames = refine ? [...scanFrames, blob] : [blob];
  scanFrames = frames;
  await submitScan(frames, refine);
}

function sampleFrameMetrics() {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 48;
  canvas.height = 48;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let brightnessSum = 0;
  let contrastSum = 0;
  let previous = 0;

  for (let i = 0; i < data.length; i += 4) {
    const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
    brightnessSum += value;
    contrastSum += Math.abs(value - previous);
    previous = value;
  }

  const pixels = data.length / 4;
  return { brightness: brightnessSum / pixels, contrast: contrastSum / pixels };
}

function isFrameReady(metrics) {
  if (metrics.brightness < 35) return fail('Темно', 'Добавьте свет или фонарик');
  if (metrics.brightness > 242) return fail('Сильный блик', 'Сместите камеру от блика');
  if (metrics.contrast < 4.8) return fail('Слишком размыто', 'Подведите камеру ближе или тапните по экрану для фокуса');
  return { ok: true };
}

function fail(reason, hint) {
  return { ok: false, reason, hint };
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

async function submitScan(blobs, refine) {
  scanning = true;
  setMainButton(false);
  setOverlay(true, blobs.length > 1 ? `Анализ ${blobs.length} кадров` : 'Анализирую кадр');
  setStatus(blobs.length > 1 ? `Анализ ${blobs.length} кадров` : 'Анализ кадра', 'Ждём ответ модели');
  if (progressLine) progressLine.style.width = '100%';

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
      showRejected(payload);
      return;
    }

    handleScanResult(payload.part, payload.status, payload.nextAction, refine);
  } catch (error) {
    setStatus('Ошибка анализа', error.message || 'Попробуйте ещё раз');
    pause(ERROR_SCAN_COOLDOWN_MS, 'Пауза после ошибки');
    setMainButton(true, scanMode === 'refine' ? 'Сканировать уточнение' : 'СКАН');
    tg?.HapticFeedback?.notificationOccurred('error');
  } finally {
    scanning = false;
    setOverlay(false);
  }
}

function handleScanResult(part, status, nextAction, refine) {
  const confidence = part?.confidence || 0;
  const percent = Math.round(confidence * 100);
  const name = compactPartName(part?.name || part?.normalizedName || 'Деталь');

  if (status === 'saved' && confidence >= 0.9 && !part?.needsBetterPhoto) {
    scanMode = 'repeat';
    setGuide(0);
    setStatus(`${name} · ${percent}%`, 'Готово. Сохранено в базе');
    setMainButton(true, 'Следующая деталь');
    pause(SAVED_SCAN_COOLDOWN_MS, 'Деталь сохранена');
    tg?.HapticFeedback?.notificationOccurred('success');
    return;
  }

  lastPreviewName = name;
  lastPreviewConfidence = percent;
  scanMode = 'refine';
  currentGuideIndex = Math.min(scanFrames.length, guideSteps.length - 1);
  setGuide(currentGuideIndex);
  angleTitle.textContent = `Похоже: ${name}`;
  shapeCaption.textContent = `${percent}% · можно уточнить`;
  guideAction.textContent = nextAction || guideSteps[currentGuideIndex].action;
  setStatus(`${name} · ${percent}%`, `${nextAction || guideSteps[currentGuideIndex].hint}. Нажмите кнопку только когда кадр готов.`);
  setMainButton(true, scanFrames.length >= MAX_SCAN_FRAMES ? 'Повторить скан' : 'Сканировать уточнение');
  if (scanFrames.length >= MAX_SCAN_FRAMES) scanMode = 'repeat';
  tg?.HapticFeedback?.notificationOccurred(refine ? 'warning' : 'success');
}

function showRejected(payload) {
  scanMode = 'repeat';
  scanFrames = [];
  lastRejectedAt = Date.now();
  setGuide(0);
  setStatus('Не автодеталь', payload.message || 'В кадре не похожая на автодеталь вещь');
  setMainButton(true, 'Повторить');
  pause(REJECTED_SCAN_COOLDOWN_MS, 'Не автодеталь');
  tg?.HapticFeedback?.notificationOccurred('warning');
}

function showRateLimited(payload) {
  setStatus('Слишком часто', payload.message || 'Нужно немного подождать');
  pause(RATE_LIMIT_COOLDOWN_MS, 'Лимит защиты');
  setMainButton(true, scanMode === 'refine' ? 'Сканировать уточнение' : 'СКАН');
}

function pause(milliseconds, reason) {
  pausedUntil = Date.now() + milliseconds;
  pauseReason = reason;
}

function setGuide(index) {
  const step = guideSteps[index] || guideSteps[0];
  partShapeGuide.className = `part-shape-guide ${step.guide}`;
  partShapeGuide.dataset.direction = step.direction;
  angleTitle.textContent = step.title;
  angleHint.textContent = step.hint;
  shapeCaption.textContent = step.caption;
  guideAction.textContent = step.action;
  guideArrow.textContent = step.arrow;
}

function setMainButton(show, text = 'СКАН') {
  if (!scanButton) return;
  scanButton.hidden = !show;
  scanButton.disabled = !show || scanning;
  scanButton.textContent = text;
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
