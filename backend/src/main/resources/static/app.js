const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const video = document.getElementById('camera');
const canvas = document.getElementById('frameCanvas');
const scanButton = document.getElementById('scanButton');
const secondaryActionButton = document.getElementById('secondaryActionButton');
const resetAnglesButton = document.getElementById('resetAnglesButton');
const retryButton = document.getElementById('retryButton');
const catalogToggle = document.getElementById('catalogToggle');
const catalogPanel = document.getElementById('catalogPanel');
const catalogClose = document.getElementById('catalogClose');
const categoryFilters = document.getElementById('categoryFilters');
const angleStrip = document.getElementById('angleStrip');
const partShapeGuide = document.getElementById('partShapeGuide');
const shapeCaption = document.getElementById('shapeCaption');
const angleStepLabel = document.getElementById('angleStepLabel');
const angleProgress = document.getElementById('angleProgress');
const angleTitle = document.getElementById('angleTitle');
const angleHint = document.getElementById('angleHint');
const guidance = document.getElementById('guidance');
const statusLabel = document.getElementById('status');
const partsList = document.getElementById('partsList');
const countLabel = document.getElementById('countLabel');
const lightBadge = document.getElementById('lightBadge');
const sharpBadge = document.getElementById('sharpBadge');

const angleSteps = [
  {
    key: 'main',
    label: 'Общий вид',
    short: 'Целиком',
    shape: 'shape-main',
    title: 'Снимите деталь целиком',
    hint: 'Отойдите чуть дальше. В рамке должны быть видны общая форма, крепления, трубки и края детали.',
    caption: 'Вся деталь'
  },
  {
    key: 'marking',
    label: 'Маркировка',
    short: 'Номер',
    shape: 'shape-marking',
    title: 'Найдите номер или логотип',
    hint: 'Поднесите наклейку, выбитый номер, QR, штамп или логотип прямо в маленькую рамку. Это самый важный ракурс.',
    caption: 'Номер / логотип'
  },
  {
    key: 'side',
    label: 'Боковой вид',
    short: 'Сбоку',
    shape: 'shape-side',
    title: 'Поверните деталь боком',
    hint: 'Покажите толщину, патрубки, изгибы, посадочные места и боковые крепления.',
    caption: 'Бок / глубина'
  },
  {
    key: 'ports',
    label: 'Разъёмы',
    short: 'Разъёмы',
    shape: 'shape-ports',
    title: 'Покажите разъёмы и отверстия',
    hint: 'Наведите камеру на фишки, контакты, штуцеры, отверстия, трубки или места подключения.',
    caption: 'Разъёмы / порты'
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
  guidance.textContent = 'Разрешите доступ к камере и покажите деталь.';
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
    guidance.textContent = 'Откройте приложение по HTTPS и разрешите доступ к камере.';
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
    if (!video.videoWidth) return;
    const metrics = sampleFrameMetrics();
    updateQualityBadges(metrics);
    if (!scanning && !angleMode) guidance.textContent = guidanceText(metrics);
  }, 700);
}

function sampleFrameMetrics() {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 56;
  canvas.height = 56;
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

function updateQualityBadges(metrics) {
  setBadge(lightBadge, `Свет: ${qualityLightLabel(metrics.brightness)}`, qualityLightClass(metrics.brightness));
  setBadge(sharpBadge, `Кадр: ${qualitySharpLabel(metrics.contrast)}`, qualitySharpClass(metrics.contrast));
}

function setBadge(element, text, className) {
  element.textContent = text;
  element.className = `camera-badge ${className}`;
}

function qualityLightLabel(brightness) {
  if (brightness < 48) return 'темно';
  if (brightness > 218) return 'блик';
  return 'ок';
}

function qualityLightClass(brightness) {
  if (brightness < 48 || brightness > 218) return 'bad';
  if (brightness < 70 || brightness > 195) return 'warn';
  return 'ok';
}

function qualitySharpLabel(contrast) {
  if (contrast < 7) return 'ближе';
  if (contrast < 13) return 'средне';
  return 'чётко';
}

function qualitySharpClass(contrast) {
  if (contrast < 7) return 'bad';
  if (contrast < 13) return 'warn';
  return 'ok';
}

function guidanceText(metrics) {
  if (metrics.brightness < 48) return 'Темно. Добавьте свет или поверните деталь к источнику света.';
  if (metrics.brightness > 218) return 'Есть блик. Наклоните деталь, чтобы номер не светился белым пятном.';
  if (metrics.contrast < 7) return 'Поднесите камеру ближе к детали или наведите на маркировку.';
  if (metrics.contrast < 13) return 'Нормально. Для лучшей точности покажите номер или разъёмы.';
  return 'Кадр хороший. Нажмите сканирование.';
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
  guidance.textContent = blobs.length > 1 ? 'AI сравнивает несколько сторон одной детали.' : 'Камера остаётся живой. Анализируется последний кадр.';

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
    guidance.textContent = error.message || 'Неизвестная ошибка сканирования';
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
    guidance.textContent = `Точность ${percent}%. Нужно доснять несколько понятных ракурсов.`;
    secondaryActionButton.hidden = false;
    secondaryActionButton.textContent = 'Начать досъёмку';
    secondaryActionButton.onclick = enterAngleMode;
    showLowConfidenceCoach(percent);
  } else {
    guidance.textContent = 'Точность хорошая. Можно подтвердить в базе или сканировать следующую деталь.';
    secondaryActionButton.hidden = true;
    resetAngleMode(false);
    showDefaultCoach();
  }
}

function showDefaultCoach() {
  angleStepLabel.textContent = 'Обычный скан';
  angleProgress.textContent = '1/1';
  angleTitle.textContent = 'Деталь целиком';
  angleHint.textContent = 'Поместите всю деталь внутрь пунктирной рамки. Маркировку держите ближе к центру.';
  setShape('shape-main', 'Вся деталь');
}

function showLowConfidenceCoach(percent) {
  angleStepLabel.textContent = 'Нужны ракурсы';
  angleProgress.textContent = `${percent}%`;
  angleTitle.textContent = 'AI не уверен';
  angleHint.textContent = 'Нажмите “Начать досъёмку”. Приложение по шагам покажет, что именно снять.';
  setShape('shape-marking', 'Номер или логотип');
}

function enterAngleMode() {
  angleMode = true;
  capturedAngles = [];
  currentAngleIndex = 0;
  angleStrip.hidden = false;
  resetAnglesButton.hidden = false;
  secondaryActionButton.hidden = false;
  secondaryActionButton.textContent = 'Готово, анализировать';
  secondaryActionButton.onclick = finishAngles;
  updateAngleGuide();
  updatePrimaryButton();
}

async function captureAngle() {
  if (capturedAngles.length >= angleSteps.length) return;
  const blob = await captureBlob();
  capturedAngles.push(blob);
  tg?.HapticFeedback?.impactOccurred('light');

  if (capturedAngles.length >= angleSteps.length) {
    currentAngleIndex = angleSteps.length - 1;
    guidance.textContent = 'Все ракурсы сняты. Нажмите “Готово, анализировать”.';
    scanButton.disabled = true;
  } else {
    currentAngleIndex = capturedAngles.length;
    updateAngleGuide();
  }
  renderAngleStrip();
  updatePrimaryButton();
}

async function finishAngles() {
  if (capturedAngles.length < 2) {
    guidance.textContent = 'Снимите минимум 2 ракурса: общий вид и маркировку.';
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
  angleStepLabel.textContent = `Ракурс ${currentAngleIndex + 1}`;
  angleProgress.textContent = `${capturedAngles.length}/${angleSteps.length}`;
  angleTitle.textContent = step.title;
  angleHint.textContent = step.hint;
  guidance.textContent = step.hint;
  setShape(step.shape, step.caption);
  renderAngleStrip();
}

function renderAngleStrip() {
  angleStrip.innerHTML = angleSteps.map((step, index) => {
    const done = index < capturedAngles.length;
    const active = index === currentAngleIndex && angleMode;
    return `<div class="angle-chip ${done ? 'done' : ''} ${active ? 'active' : ''}">${done ? '✓ ' : ''}${escapeHtml(step.short)}</div>`;
  }).join('');
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
  const alternatives = parseList(part.alternatives).slice(0, 3);
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
      ${vehicles.length ? `<div class="detail-box"><strong>Возможная совместимость:</strong><div class="tags">${vehicles.map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('')}</div></div>` : ''}
      ${tips.length ? `<div class="detail-box"><strong>Для точности:</strong>${tips.map(item => `<div class="meta">• ${escapeHtml(item)}</div>`).join('')}</div>` : ''}
      ${alternatives.length ? `<div class="detail-box"><strong>Альтернативы:</strong>${alternatives.map(item => `<div class="meta">${escapeHtml(item.name || '')} — ${Math.round((item.confidence || 0) * 100)}% ${item.reason ? `· ${escapeHtml(item.reason)}` : ''}</div>`).join('')}</div>` : ''}
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
  guidance.textContent = 'Проверка сохранена. База стала точнее';
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
retryButton.addEventListener('click', startCamera);
catalogToggle.addEventListener('click', () => toggleCatalog());
catalogClose.addEventListener('click', () => toggleCatalog(false));

scanButton.disabled = true;
startCamera();
loadParts();
