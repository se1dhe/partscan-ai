const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const video = document.getElementById('camera');
const canvas = document.getElementById('frameCanvas');
const scanButton = document.getElementById('scanButton');
const retryButton = document.getElementById('retryButton');
const refreshButton = document.getElementById('refreshButton');
const guidance = document.getElementById('guidance');
const statusLabel = document.getElementById('status');
const partsList = document.getElementById('partsList');
const countLabel = document.getElementById('countLabel');

let stream;
let guidanceTimer;

async function startCamera() {
  stopCamera();
  statusLabel.textContent = 'Запрашиваю камеру';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    video.srcObject = stream;
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
  guidanceTimer = setInterval(() => {
    if (!video.videoWidth) return;
    const brightness = sampleBrightness();
    if (brightness < 45) {
      guidance.textContent = 'Добавьте света или поверните деталь к источнику света';
    } else if (brightness > 218) {
      guidance.textContent = 'Есть пересвет, чуть измените угол камеры';
    } else {
      guidance.textContent = 'Держите деталь в центре и покажите маркировку';
    }
  }, 900);
}

function sampleBrightness() {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 48;
  canvas.height = 48;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  return sum / (data.length / 4);
}

async function captureBlob() {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(video, 0, 0, width, height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
}

async function scan() {
  scanButton.disabled = true;
  scanButton.textContent = 'Сканирую...';
  statusLabel.textContent = 'Отправляю кадр в OpenAI';
  try {
    const blob = await captureBlob();
    const form = new FormData();
    form.append('file', blob, `part-${Date.now()}.jpg`);
    const response = await fetch('/api/v1/scan', { method: 'POST', body: form });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Ошибка сканирования');
    statusLabel.textContent = 'Деталь сохранена';
    guidance.textContent = payload.part?.name || 'Можно сканировать следующую деталь';
    await loadParts();
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (error) {
    statusLabel.textContent = 'Не удалось распознать';
    guidance.textContent = error.message;
    tg?.HapticFeedback?.notificationOccurred('error');
  } finally {
    scanButton.disabled = false;
    scanButton.textContent = 'Сканировать';
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
  const markings = parseList(part.visibleMarkings).slice(0, 4);
  const confidence = Math.round((part.confidence || 0) * 100);
  const title = escapeHtml(part.name || 'Неизвестная деталь');
  return `
    <article class="part-card">
      <div class="part-head">
        <div>
          <div class="part-name">${title}</div>
          <div class="meta">${escapeHtml([part.manufacturer, part.articleNumber, part.category].filter(Boolean).join(' · ') || 'Без уточнений')}</div>
        </div>
        <div class="confidence">${confidence}%</div>
      </div>
      <div class="meta">${escapeHtml(part.description || '')}</div>
      <div class="tags">${vehicles.map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('')}</div>
      <div class="meta">${markings.length ? `Маркировка: ${escapeHtml(markings.join(', '))}` : ''}</div>
    </article>
  `;
}

function parseList(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

scanButton.addEventListener('click', scan);
retryButton.addEventListener('click', startCamera);
refreshButton.addEventListener('click', loadParts);

scanButton.disabled = true;
startCamera();
loadParts();
