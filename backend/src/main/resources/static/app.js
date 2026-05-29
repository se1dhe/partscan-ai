const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const video = document.getElementById('camera');
const canvas = document.getElementById('frameCanvas');
const partShapeGuide = document.getElementById('partShapeGuide');
const shapeCaption = document.getElementById('shapeCaption');
const angleTitle = document.getElementById('angleTitle');
const angleHint = document.getElementById('angleHint');
const guidance = document.getElementById('guidance');
const statusLabel = document.getElementById('status');
const progressLine = document.getElementById('progressLine')?.querySelector('span');

const angleSteps = [
  { short: 'целиком', shape: 'shape-main', title: 'Деталь целиком', hint: 'Вся деталь внутри контура', caption: 'целиком' },
  { short: 'номер', shape: 'shape-marking', title: 'Маркировка', hint: 'Номер, наклейка или логотип в рамке', caption: 'номер / логотип' },
  { short: 'сбоку', shape: 'shape-side', title: 'Боковой вид', hint: 'Поверните деталь боком', caption: 'сбоку' },
  { short: 'разъёмы', shape: 'shape-ports', title: 'Разъёмы', hint: 'Фишки, трубки или отверстия в контуре', caption: 'разъёмы' }
];

let stream;
let scannerTimer;
let scanning = false;
let pausedUntil = 0;
let previousFingerprint = null;
let stableScore = 0;
let capturedAngles = [];
let currentAngleIndex = 0;
let multiAngleMode = false;

startCamera();

async function startCamera() {
  stopCamera();
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
    setCoach(angleSteps[0]);
    setStatus('Ищу деталь', 'Держите автодеталь внутри контура');
    startAutoScanner();
  } catch (error) {
    setStatus('Нет доступа к камере', 'Откройте по HTTPS и разрешите камеру');
  }
}

function stopCamera() {
  if (stream) stream.getTracks().forEach(track => track.stop());
  if (scannerTimer) clearInterval(scannerTimer);
}

function startAutoScanner() {
  if (scannerTimer) clearInterval(scannerTimer);
  scannerTimer = setInterval(async () => {
    if (!video.videoWidth || scanning || Date.now() < pausedUntil) return;

    const metrics = sampleFrameMetrics();
    const ready = isFrameReady(metrics);
    updateProgress(metrics, ready);

    if (!ready) {
      statusLabel.textContent = metrics.reason;
      guidance.textContent = multiAngleMode ? angleSteps[currentAngleIndex].hint : metrics.hint;
      return;
    }

    stableScore += 1;
    statusLabel.textContent = 'Держите ровно';
    guidance.textContent = `Автозахват ${Math.min(stableScore, 3)}/3`;

    if (stableScore >= 3) {
      stableScore = 0;
      if (multiAngleMode) await captureAngle();
      else await submitScan([await captureBlob()]);
    }
  }, 650);
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
  return { brightness, contrast, motion };
}

function isFrameReady(metrics) {
  if (metrics.brightness < 48) return fail(metrics, 'Темно', 'Добавьте свет');
  if (metrics.brightness > 220) return fail(metrics, 'Блик', 'Наклоните деталь');
  if (metrics.contrast < 8) return fail(metrics, 'Не в фокусе', 'Поднесите ближе или наведите на маркировку');
  if (metrics.motion > 34) return fail(metrics, 'Камера движется', 'Держите телефон ровнее');
  return { ...metrics, ok: true, reason: 'Кадр подходит', hint: 'Не двигайте телефон' };
}

function fail(metrics, reason, hint) {
  stableScore = 0;
  return { ...metrics, ok: false, reason, hint };
}

function updateProgress(metrics, ready) {
  if (!progressLine) return;
  const base = ready.ok ? 65 + stableScore * 12 : Math.max(8, Math.min(55, metrics.contrast * 4));
  progressLine.style.width = `${Math.min(100, base)}%`;
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

async function submitScan(blobs) {
  if (scanning) return;
  scanning = true;
  pausedUntil = Date.now() + 3500;
  setStatus(blobs.length > 1 ? `Анализ ${blobs.length} ракурсов` : 'Анализ кадра', 'Камера остаётся живой');

  try {
    const form = new FormData();
    if (blobs.length === 1) form.append('file', blobs[0], `part-${Date.now()}.jpg`);
    else blobs.forEach((blob, index) => form.append('files', blob, `part-angle-${index + 1}.jpg`));

    const response = await fetch('/api/v1/scan', { method: 'POST', body: form });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || payload.detail || payload.message || 'Ошибка сканирования');

    if (payload.status === 'rejected') {
      showRejected(payload);
      tg?.HapticFeedback?.notificationOccurred('warning');
      return;
    }

    handleScanResult(payload.part);
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (error) {
    setStatus('Ошибка анализа', error.message || 'Попробуйте ещё раз');
    tg?.HapticFeedback?.notificationOccurred('error');
  } finally {
    scanning = false;
  }
}

function handleScanResult(part) {
  const confidence = part?.confidence || 0;
  const percent = Math.round(confidence * 100);
  if (confidence < 0.9 || part?.needsBetterPhoto) {
    setStatus(`${percent}% · нужен ракурс`, 'Следуйте рамке на экране');
    enterMultiAngleMode();
    return;
  }

  setStatus(`${part?.name || 'Деталь'} · ${percent}%`, 'Сохранено в базе');
  resetMultiAngleMode();
  pausedUntil = Date.now() + 5000;
}

function showRejected(payload) {
  resetMultiAngleMode();
  setShape('shape-main', 'автодеталь');
  angleTitle.textContent = 'Это не автодеталь';
  angleHint.textContent = payload.nextAction || 'Наведите камеру на автомобильную деталь';
  setStatus('Не сохраняю в базу', payload.message || 'В кадре не похожая на автодеталь вещь');
  pausedUntil = Date.now() + 6000;
}

function enterMultiAngleMode() {
  multiAngleMode = true;
  capturedAngles = [];
  currentAngleIndex = 0;
  setCoach(angleSteps[currentAngleIndex]);
}

async function captureAngle() {
  capturedAngles.push(await captureBlob());
  tg?.HapticFeedback?.impactOccurred('light');

  if (capturedAngles.length >= angleSteps.length) {
    const blobs = [...capturedAngles];
    resetMultiAngleMode(false);
    await submitScan(blobs);
    return;
  }

  currentAngleIndex = capturedAngles.length;
  setCoach(angleSteps[currentAngleIndex]);
  setStatus(`${capturedAngles.length}/${angleSteps.length} снято`, angleSteps[currentAngleIndex].hint);
  pausedUntil = Date.now() + 1600;
}

function resetMultiAngleMode(resetCoach = true) {
  multiAngleMode = false;
  capturedAngles = [];
  currentAngleIndex = 0;
  if (resetCoach) setCoach(angleSteps[0]);
}

function setCoach(step) {
  angleTitle.textContent = step.title;
  angleHint.textContent = step.hint;
  setShape(step.shape, step.caption);
}

function setShape(shapeClass, caption) {
  partShapeGuide.className = `part-shape-guide ${shapeClass}`;
  shapeCaption.textContent = caption || '';
}

function setStatus(status, hint) {
  statusLabel.textContent = status;
  guidance.textContent = hint;
}

async function readJsonResponse(response) {
  try { return await response.json(); } catch { return {}; }
}
