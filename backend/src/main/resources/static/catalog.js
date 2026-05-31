const partsList = document.getElementById('partsList');
const categoryFilters = document.getElementById('categoryFilters');
const catalogSearch = document.getElementById('catalogSearch');
const catalogMeta = document.getElementById('catalogMeta');

let allParts = [];
let selectedCategory = 'all';
let searchQuery = '';

loadParts();
catalogSearch.addEventListener('input', event => {
  searchQuery = event.target.value.trim().toLowerCase();
  renderParts();
});
setInterval(loadParts, 20000);

async function loadParts() {
  const response = await fetch('/api/v1/parts');
  allParts = response.ok ? await response.json() : [];
  const lastScanRaw = allParts.length ? latestDate(allParts.map(scanTimestamp)) : null;
  const lastScan = lastScanRaw ? `${relativeTime(lastScanRaw)} · ${formatDate(lastScanRaw)}` : 'нет сканов';
  catalogMeta.textContent = `${allParts.length} сканов · последний: ${lastScan}`;
  renderCategoryFilters();
  renderParts();
}

function renderCategoryFilters() {
  const categories = [...new Set(allParts.map(part => part.category || 'unknown'))].sort((a, b) => a.localeCompare(b, 'ru'));
  categoryFilters.innerHTML = ['all', ...categories].map(category => {
    const label = category === 'all' ? 'Все' : category;
    const active = selectedCategory === category;
    return `<button class="category-chip ${active ? 'active' : ''}" type="button" onclick="selectCategory('${escapeJs(category)}')">${escapeHtml(label)}</button>`;
  }).join('');
}

function selectCategory(category) {
  selectedCategory = category;
  renderCategoryFilters();
  renderParts();
}

function renderParts() {
  const visibleParts = allParts
    .filter(part => selectedCategory === 'all' || (part.category || 'unknown') === selectedCategory)
    .filter(part => !searchQuery || [part.name, part.normalizedName, part.manufacturer, part.articleNumber, part.category, part.description].filter(Boolean).join(' ').toLowerCase().includes(searchQuery))
    .sort((a, b) => dateValue(scanTimestamp(b)) - dateValue(scanTimestamp(a)));

  partsList.innerHTML = visibleParts.length ? visibleParts.map(renderPart).join('') : '<div class="empty">Ничего не найдено</div>';
}

function renderPart(part) {
  const confidence = Math.round((part.confidence || 0) * 100);
  const title = escapeHtml(part.name || 'Неизвестная деталь');
  const meta = [part.manufacturer, part.articleNumber, part.category].filter(Boolean).join(' · ') || 'Без уточнений';
  const status = part.reviewStatus || 'pending';
  const scannedAt = scanTimestamp(part);
  const listings = Array.isArray(part.marketListings) ? part.marketListings.filter(item => item && item.url) : [];
  const marketText = marketSummary(listings);
  return `
    <article class="part-card compact-card" data-part-id="${escapeHtml(part.id)}" onclick="openPart('${escapeJs(part.id)}')">
      ${part.imageUrl ? `<img class="part-thumb" src="${escapeHtml(part.imageUrl)}" alt="">` : '<div class="part-thumb empty-thumb">нет фото</div>'}
      <div class="compact-card-body">
        <div class="part-head">
          <div><div class="part-name">${title}</div><div class="meta">${escapeHtml(meta)}</div></div>
          <div class="confidence">${confidence}%</div>
        </div>
        <div class="scan-datetime">Отсканировано: <strong>${escapeHtml(formatDate(scannedAt))}</strong></div>
        <div class="card-meta-row">
          <span class="status-pill ${escapeHtml(status)}">${escapeHtml(statusLabelText(status))}</span>
          <span class="scan-time">${escapeHtml(relativeTime(scannedAt))}</span>
        </div>
        <div class="market-mini">${escapeHtml(marketText)}</div>
      </div>
    </article>
  `;
}

function marketSummary(listings) {
  if (!listings.length) return 'OLX: похожие объявления пока не найдены';
  const prices = listings.map(item => Number(item.price)).filter(Number.isFinite).filter(value => value > 0);
  if (!prices.length) return `OLX: ${listings.length} объявл.`;
  return `OLX: ${formatMoney(Math.min(...prices))}–${formatMoney(Math.max(...prices))} грн · ${listings.length} объявл.`;
}

function openPart(id) { location.href = `/part.html?id=${encodeURIComponent(id)}`; }

function statusLabelText(status) {
  return { pending: 'ожидает проверки', confirmed: 'подтверждено', corrected: 'исправлено', needs_review: 'нужна проверка', needs_photo: 'нужен доп. кадр' }[status] || status;
}

function scanTimestamp(part) { return part?.createdAt || part?.updatedAt || part?.scannedAt || null; }
function latestDate(values) { return values.filter(Boolean).sort((a, b) => dateValue(b) - dateValue(a))[0]; }
function dateValue(value) { const time = value ? new Date(value).getTime() : 0; return Number.isFinite(time) ? time : 0; }
function relativeTime(value) {
  const time = dateValue(value);
  if (!time) return 'неизвестно';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSeconds < 20) return 'только что';
  if (diffSeconds < 60) return `${diffSeconds} сек назад`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} д назад`;
  return formatDate(value);
}
function formatDate(value) { const time = dateValue(value); return time ? new Date(time).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'неизвестно'; }
function formatMoney(value) { return Number(value || 0).toLocaleString('ru-RU'); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function escapeJs(value) { return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

window.selectCategory = selectCategory;
window.openPart = openPart;
