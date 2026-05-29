const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const video = document.getElementById('camera');
const canvas = document.getElementById('frameCanvas');
const scanButton = document.getElementById('scanButton');
const secondaryActionButton = document.getElementById('secondaryActionButton');
const resetAnglesButton = document.getElementById('resetAnglesButton');
const catalogToggle = document.getElementById('catalogToggle');
const catalogPanel = document.getElementById('catalogPanel');
const catalogClose = document.getElementById('catalogClose');
const categoryFilters = document.getElementById('categoryFilters');
const angleStrip = document.getElementById('angleStrip');
const partShapeGuide = document.getElementById('partShapeGuide');
const shapeCaption = document.getElementById('shapeCaption');
const angleTitle = document.getElementById('angleTitle');
const angleHint = document.getElementById('angleHint');
const guidance = document.getElementById('guidance');
const statusLabel = document.getElementById('status');
const partsList = document.getElementById('partsList');
const countLabel = document.getElementById('countLabel');

const angleSteps = [
  {
    short: 'Целиком',
    shape: 'shape-main',
    title: 'Деталь целиком',
    hint: 'Вся деталь внутри рамки',
    caption: 'Целиком'
  },
  {
    short: 'Номер',
    shape: 'shape-marking',
    title: 'Маркировка',
    hint: 'Номер, наклейка или логотип в рамке',
    caption: 'Номер'
  },
  {
    short: 'Сбоку',
    shape: 'shape-side',
    title: 'Боковой вид',
    hint: 'Поверните деталь боком',
    caption: 'Сбоку'
  },
  {
    short: 'Разъёмы',
    shape: 'shape-ports',
    title: 'Разъёмы',
    hint: 'Фишки, трубки или отверстия в рамке',
    caption: 'Разъёмы'
  }
];

let stream;
let guidanceTimer;
let scanning = false;
let angleMode = false;
let capturedAngles = [];
let currentAngleIndex = 0;
let allParts = [];
let selectedCategory = 'all';

async function startCamera() {
  stopCamera();
  statusLabel.textContent = 'Запрашиваю камеру';
  guidance.textContent = 'Разрешите доступ к камере';

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
    statusLabel.textContent = 'Камера готова';
    scanButton.disabled = false;
    showDefaultCoach();
    startGuidance();
  } catch (error) {
    statusLabel.textContent = 'Нет доступа к камере';
    guidance.textContent = 'Откройте по HTTPS и разрешите камеру';
    scanButton.disabled = true;
  }
}

function stopCamera() {
  if (stream) stream.getTracks().forEach(track => track.stop());
  if (guidanceTimer) clearInterval(guidanceTimer);
}

function startGuidance() {
  if (guidanceTimer) clearInterval(guidanceTimer);
  guidanceTimer = setInterval(() => {
    if (!video.videoWidth || scanning || angleMode) return;
    guidance.textContent = guidanceText(sampleFrameMetrics());
  }, 900);
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

function guidanceText(metrics) {
  if (metrics.brightness < 48) return 'Темно. Добавьте свет';
  if (metrics.brightness > 218) return 'Блик. Наклоните деталь';
  if (metrics.contrast < 8) return 'Поднесите камеру ближе';
  return 'Кадр нормальный';
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

async function scan() {
  if (angleMode) {
    await captureAngle();
    return;
  }
  await submitScan([await captureBlob()]);
}

async function submitScan(blobs) {
  if (scanning) return;
  scanning = true;
  scanButton.disabled = true;
  secondaryActionButton.disabled = true;
  statusLabel.textContent = blobs.length > 1 ? `Анализ ${blobs.length} ракурсов` : 'Анализ кадра';
  guidance.textContent = 'Камера остаётся живой';

  try {
    const form = new FormData();
    if (blobs.length === 1) {
      form.append('file', blobs[0], `part-${Date.now()}.jpg`);
    } else {
      blobs.forEach((blob, index) => form.append('files', blob, `part-angle-${index + 1}.jpg`));
    }

    const response = await fetch('/api/v1/scan', { method: 'POST', body: form });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || payload.detail || payload.message || 'Ошибка сканирования');

    await loadParts();
    handleScanResult(payload.part);
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (error) {
    statusLabel.textContent = 'Не удалось распознать';
    guidance.textContent = error.message || 'Ошибка сканирования';
    tg?.HapticFeedback?.notificationOccurred('error');
  } finally {
    scanning = false;
    scanButton.disabled = false;
    secondaryActionButton.disabled = false;
    updatePrimaryButton();
  }
}

function handleScanResult(part) {
  const confidence = part?.confidence || 0;
  const percent = Math.round(confidence * 100);
  statusLabel.textContent = part?.name ? `${part.name} · ${percent}%` : 'Деталь сохранена';

  if (confidence < 0.9 || part?.needsBetterPhoto) {
    guidance.textContent = `Точность ${percent}%. Нужны ракурсы`;
    secondaryActionButton.hidden = false;
    secondaryActionButton.textContent = 'Доснять';
    secondaryActionButton.onclick = enterAngleMode;
    showLowConfidenceCoach();
  } else {
    guidance.textContent = 'Готово. Можно сканировать дальше';
    secondaryActionButton.hidden = true;
    resetAngleMode(false);
    showDefaultCoach();
  }
}

function showDefaultCoach() {
  angleTitle.textContent = 'Деталь целиком';
  angleHint.textContent = 'Поместите деталь в рамку';
  setShape('shape-main', 'Целиком');
}

function showLowConfidenceCoach() {
  angleTitle.textContent = 'Нужен номер';
  angleHint.textContent = 'Доснимите маркировку или разъёмы';
  setShape('shape-marking', 'Номер');
}

function enterAngleMode() {
  angleMode = true;
  capturedAngles = [];
  currentAngleIndex = 0;
  angleStrip.hidden = true;
  resetAnglesButton.hidden = false;
  secondaryActionButton.hidden = true;
  updateAngleGuide();
  updatePrimaryButton();
}

async function captureAngle() {
  if (capturedAngles.length >= angleSteps.length) return;
  capturedAngles.push(await captureBlob());
  tg?.HapticFeedback?.impactOccurred('light');

  if (capturedAngles.length >= 2) {
    secondaryActionButton.hidden = false;
    secondaryActionButton.textContent = 'Готово';
    secondaryActionButton.onclick = finishAngles;
  }

  if (capturedAngles.length >= angleSteps.length) {
    guidance.textContent = 'Все ракурсы сняты. Нажмите “Готово”';
    scanButton.disabled = true;
  } else {
    currentAngleIndex = capturedAngles.length;
    updateAngleGuide();
  }

  updatePrimaryButton();
}

async function finishAngles() {
  if (capturedAngles.length < 2) {
    guidance.textContent = 'Снимите минимум 2 ракурса';
    return;
  }
  const blobs = [...capturedAngles];
  resetAngleMode(false);
  await submitScan(blobs);
}

function resetAngleMode(hideSecondary = true) {
  angleMode = false;
  capturedAngles = [];
  currentAngleIndex = 0;
  angleStrip.hidden = true;
  resetAnglesButton.hidden = true;
  scanButton.disabled = false;
  if (hideSecondary) secondaryActionButton.hidden = true;
  showDefaultCoach();
  updatePrimaryButton();
}

function updateAngleGuide() {
  const step = angleSteps[currentAngleIndex];
  angleTitle.textContent = step.title;
  angleHint.textContent = step.hint;
  guidance.textContent = `${capturedAngles.length}/${angleSteps.length} снято`;
  setShape(step.shape, step.caption);
}

function updatePrimaryButton() {
  if (!angleMode) {
    scanButton.textContent = 'Сканировать';
    return;
  }
  const step = angleSteps[currentAngleIndex];
  scanButton.textContent = `Снять: ${step.short}`;
}

function setShape(shapeClass, caption) {
  partShapeGuide.className = `part-shape-guide ${shapeClass}`;
  shapeCaption.textContent = caption || '';
}

async function readJsonResponse(response) {
  try { return await response.json(); } catch { return {}; }
}

async function loadParts() {
  const response = await fetch('/api/v1/parts');
  allParts = response.ok ? await response.json() : [];
  countLabel.textContent = allParts.length;
  renderCategoryFilters();
  renderParts();
}

function renderCategoryFilters() {
  const categories = [...new Set(allParts.map(part => part.category || 'unknown'))].sort((a, b) => a.localeCompare(b, 'ru'));
  const buttons = ['all', ...categories].map(category => {
    const label = category === 'all' ? 'Все' : category;
    const active = selectedCategory === category;
    return `<button class="category-chip ${active ? 'active' : ''}" type="button" onclick="selectCategory('${escapeJs(category)}')">${escapeHtml(label)}</button>`;
  });
  categoryFilters.innerHTML = buttons.join('');
}

function selectCategory(category) {
  selectedCategory = category;
  renderCategoryFilters();
  renderParts();
}

function renderParts() {
  const visibleParts = selectedCategory === 'all' ? allParts : allParts.filter(part => (part.category || 'unknown') === selectedCategory);
  partsList.innerHTML = visibleParts.length ? visibleParts.map(renderPart).join('') : '<div class="empty">В этой категории пока нет деталей</div>';
}

function renderPart(part) {
  const vehicles = parseList(part.compatibleVehicles).slice(0, 5);
  const markings = parseList(part.visibleMarkings).slice(0, 5);
  const tips = parseList(part.photoTips).slice(0, 3);
  const confidence = Math.round((part.confidence || 0) * 100);
  const title = escapeHtml(part.name || 'Неизвестная деталь');
  const meta = [part.manufacturer, part.articleNumber, part.category].filter(Boolean).join(' · ') || 'Без уточнений';
  const status = part.reviewStatus || 'pending';
  return `
    <article class="part-card" data-part-id="${escapeHtml(part.id)}">
      <div class="part-head">
        <div><div class="part-name">${title}</div><div class="meta">${escapeHtml(meta)}</div></div>
        <div class="confidence">${confidence}%</div>
      </div>
      <span class="status-pill ${escapeHtml(status)}">${escapeHtml(statusLabelText(status))}</span>
      <div class="meta">${escapeHtml(part.description || '')}</div>
      ${part.identificationReason ? `<div class="detail-box"><strong>Почему так:</strong><div class="meta">${escapeHtml(part.identificationReason)}</div></div>` : ''}
      ${markings.length ? `<div class="detail-box"><strong>Маркировка:</strong><div class="tags">${markings.map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('')}</div></div>` : ''}
      ${vehicles.length ? `<div class="detail-box"><strong>Совместимость:</strong><div class="tags">${vehicles.map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('')}</div></div>` : ''}
      ${tips.length ? `<div class="detail-box"><strong>Для точности:</strong>${tips.map(item => `<div class="meta">• ${escapeHtml(item)}</div>`).join('')}</div>` : ''}
      <div class="review-actions">
        <button class="micro-button primary" type="button" onclick="confirmPart('${escapeJs(part.id)}')">Верно</button>
        <button class="micro-button warn" type="button" onclick="quickEditPart('${escapeJs(part.id)}')">Исправить</button>
      </div>
    </article>
  `;
}

function statusLabelText(status) {
  return { pending: 'ожидает проверки', confirmed: 'подтверждено', corrected: 'исправлено', needs_review: 'нужна проверка', needs_photo: 'нужен доп. кадр' }[status] || status;
}

async function confirmPart(id) { await sendReview(id, { isCorrect: true }); }

async function quickEditPart(id) {
  const currentCard = document.querySelector(`[data-part-id="${CSS.escape(id)}"]`);
  const currentName = currentCard?.querySelector('.part-name')?.textContent || '';
  const correctedName = prompt('Правильное название детали:', currentName);
  if (!correctedName) return;
  await sendReview(id, { isCorrect: false, correctedName });
}

async function sendReview(id, payload) {
  const response = await fetch(`/api/v1/parts/${id}/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await readJsonResponse(response);
    guidance.textContent = error.error || 'Не удалось сохранить проверку';
    tg?.HapticFeedback?.notificationOccurred('error');
    return;
  }
  guidance.textContent = 'Проверка сохранена';
  tg?.HapticFeedback?.notificationOccurred('success');
  await loadParts();
}

function toggleCatalog(show = catalogPanel.hidden) {
  catalogPanel.hidden = !show;
  if (show) loadParts();
}

function parseList(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch { return []; }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function escapeJs(value) { return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

window.selectCategory = selectCategory;
window.confirmPart = confirmPart;
window.quickEditPart = quickEditPart;

scanButton.addEventListener('click', scan);
resetAnglesButton.addEventListener('click', () => resetAngleMode(true));
catalogToggle.addEventListener('click', () => toggleCatalog());
catalogClose.addEventListener('click', () => toggleCatalog(false));

scanButton.disabled = true;
startCamera();
loadParts();
