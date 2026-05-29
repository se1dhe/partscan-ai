const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const video = document.getElementById('camera');
const canvas = document.getElementById('frameCanvas');
const previewImage = document.getElementById('previewImage');
const scanButton = document.getElementById('scanButton');
const retakeButton = document.getElementById('retakeButton');
const retryButton = document.getElementById('retryButton');
const refreshButton = document.getElementById('refreshButton');
const guidance = document.getElementById('guidance');
const statusLabel = document.getElementById('status');
const partsList = document.getElementById('partsList');
const countLabel = document.getElementById('countLabel');
const lightBadge = document.getElementById('lightBadge');
const sharpBadge = document.getElementById('sharpBadge');

let stream;
let guidanceTimer;
let scanning = false;

async function startCamera() {
  stopCamera();
  hidePreview();
  statusLabel.textContent = 'Запрашиваю камеру';
  guidance.textContent = 'Разрешите доступ к камере и покажите деталь целиком';
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
    startGuidance();
  } catch (error) {
    statusLabel.textContent = 'Нет доступа к камере';
    guidance.textContent = 'Откройте приложение по HTTPS и разрешите доступ к камере';
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
    if (!video.videoWidth || scanning || !previewImage.hidden) return;
    const metrics = sampleFrameMetrics();
    updateQualityBadges(metrics);
    guidance.textContent = guidanceText(metrics);
  }, 650);
}

function sampleFrameMetrics() {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 64;
  canvas.height = 64;
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
  return {
    brightness: brightnessSum / pixels,
    contrast: contrastSum / pixels
  };
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
  if (brightness > 218) return 'пересвет';
  return 'ок';
}

function qualityLightClass(brightness) {
  if (brightness < 48 || brightness > 218) return 'bad';
  if (brightness < 70 || brightness > 195) return 'warn';
  return 'ok';
}

function qualitySharpLabel(contrast) {
  if (contrast < 7) return 'мало деталей';
  if (contrast < 13) return 'средне';
  return 'чёткий';
}

function qualitySharpClass(contrast) {
  if (contrast < 7) return 'bad';
  if (contrast < 13) return 'warn';
  return 'ok';
}

function guidanceText(metrics) {
  if (metrics.brightness < 48) return 'Темно: добавьте свет или поднесите деталь к окну';
  if (metrics.brightness > 218) return 'Пересвет: измените угол, чтобы маркировка не бликовала';
  if (metrics.contrast < 7) return 'Поднесите камеру ближе к маркировке или ребрам детали';
  if (metrics.contrast < 13) return 'Хорошо. Для точности покажите номер, логотип или разъёмы';
  return 'Отличный кадр. Деталь целиком в рамке, маркировка — по центру';
}

async function captureBlob() {
  const sourceWidth = video.videoWidth || 1280;
  const sourceHeight = video.videoHeight || 720;
  const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(video, 0, 0, width, height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
}

async function scan() {
  if (scanning) return;
  scanning = true;
  scanButton.disabled = true;
  scanButton.textContent = 'AI анализирует...';
  statusLabel.textContent = 'Отправляю кадр на AI-анализ';
  guidance.textContent = 'Проверяю форму, маркировки, разъёмы и похожие варианты';

  try {
    const blob = await captureBlob();
    showPreview(blob);
    const form = new FormData();
    form.append('file', blob, `part-${Date.now()}.jpg`);

    const response = await fetch('/api/v1/scan', { method: 'POST', body: form });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(payload.error || payload.detail || payload.message || 'Ошибка сканирования');
    }

    statusLabel.textContent = 'Деталь сохранена';
    guidance.textContent = resultGuidance(payload.part);
    await loadParts();
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (error) {
    statusLabel.textContent = 'Не удалось распознать';
    guidance.textContent = error.message || 'Неизвестная ошибка сканирования';
    tg?.HapticFeedback?.notificationOccurred('error');
  } finally {
    scanning = false;
    scanButton.disabled = false;
    scanButton.textContent = 'Сканировать';
    retakeButton.hidden = false;
  }
}

function showPreview(blob) {
  const url = URL.createObjectURL(blob);
  previewImage.src = url;
  previewImage.hidden = false;
  retakeButton.hidden = false;
}

function hidePreview() {
  previewImage.hidden = true;
  previewImage.removeAttribute('src');
  retakeButton.hidden = true;
}

function resultGuidance(part) {
  if (!part) return 'Можно сканировать следующую деталь';
  if (part.needsBetterPhoto) return 'AI просит дополнительный кадр: покажите маркировку или другой угол';
  return `${part.name || 'Деталь'} сохранена. Подтвердите результат в базе ниже`;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function loadParts() {
  const response = await fetch('/api/v1/parts');
  const parts = response.ok ? await response.json() : [];
  countLabel.textContent = parts.length;
  partsList.innerHTML = parts.length ? parts.map(renderPart).join('') : '<div class="empty">Пока нет сохранённых деталей</div>';
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
        <div>
          <div class="part-name">${title}</div>
          <div class="meta">${escapeHtml(meta)}</div>
        </div>
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
  return {
    pending: 'ожидает проверки',
    confirmed: 'подтверждено',
    corrected: 'исправлено',
    needs_review: 'нужна проверка',
    needs_photo: 'нужен доп. кадр'
  }[status] || status;
}

async function confirmPart(id) {
  await sendReview(id, { isCorrect: true });
}

async function quickEditPart(id) {
  const currentCard = document.querySelector(`[data-part-id="${CSS.escape(id)}"]`);
  const currentName = currentCard?.querySelector('.part-name')?.textContent || '';
  const correctedName = prompt('Правильное название детали:', currentName);
  if (!correctedName) return;
  await sendReview(id, { isCorrect: false, correctedName });
}

async function sendReview(id, payload) {
  const response = await fetch(`/api/v1/parts/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
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

function parseList(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function escapeJs(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

scanButton.addEventListener('click', scan);
retakeButton.addEventListener('click', hidePreview);
retryButton.addEventListener('click', startCamera);
refreshButton.addEventListener('click', loadParts);

scanButton.disabled = true;
startCamera();
loadParts();
