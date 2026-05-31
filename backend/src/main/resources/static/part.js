const detailTitle = document.getElementById('detailTitle');
const detailMeta = document.getElementById('detailMeta');
const partDetail = document.getElementById('partDetail');
const id = new URLSearchParams(location.search).get('id');

if (!id) {
  partDetail.innerHTML = '<div class="empty">Не передан ID детали</div>';
} else {
  loadPart();
}

async function loadPart() {
  const response = await fetch(`/api/v1/parts/${encodeURIComponent(id)}`);
  if (!response.ok) {
    partDetail.innerHTML = '<div class="empty">Деталь не найдена</div>';
    return;
  }
  const part = await response.json();
  renderPart(part);
}

function renderPart(part) {
  const confidence = Math.round((part.confidence || 0) * 100);
  const markings = parseList(part.visibleMarkings);
  const vehicles = parseList(part.compatibleVehicles);
  const tips = parseList(part.photoTips);
  const alternatives = parseList(part.alternatives);
  const searchQueries = parseList(part.searchQueries);
  detailTitle.textContent = part.name || 'Деталь';
  detailMeta.textContent = `${confidence}% · ${formatDate(scanTimestamp(part))}`;
  partDetail.innerHTML = `
    <article class="detail-card">
      ${part.imageUrl ? `<img class="detail-photo" src="${escapeHtml(part.imageUrl)}" alt="Фото детали">` : '<div class="detail-photo placeholder">Фото появится у новых сканов</div>'}
      <div class="part-head detail-head">
        <div><div class="part-name">${escapeHtml(part.name || 'Неизвестная деталь')}</div><div class="meta">${escapeHtml([part.manufacturer, part.articleNumber, part.category].filter(Boolean).join(' · ') || 'Без уточнений')}</div></div>
        <div class="confidence">${confidence}%</div>
      </div>
      <div class="scan-datetime">Отсканировано: <strong>${escapeHtml(formatDate(scanTimestamp(part)))}</strong></div>
      ${renderScope(part)}
      ${part.description ? `<p class="detail-description">${escapeHtml(part.description)}</p>` : ''}
      ${part.identificationReason ? box('Почему так', part.identificationReason) : ''}
      ${markings.length ? tagsBox('Маркировка', markings) : ''}
      ${searchQueries.length ? tagsBox('Запросы для OLX', searchQueries) : ''}
      ${vehicles.length ? tagsBox('Совместимость', vehicles) : ''}
      ${tips.length ? listBox('Для точности', tips) : ''}
      ${alternatives.length ? listBox('Альтернативы', alternatives.map(item => `${item.name || 'Альтернатива'} ${item.confidence ? `· ${Math.round(item.confidence * 100)}%` : ''} ${item.reason ? `— ${item.reason}` : ''}`)) : ''}
      ${renderMarket(part)}
    </article>
  `;
}

function renderScope(part) {
  const scope = part.partScope || 'unknown';
  const component = part.visibleComponentName || '';
  const assembly = part.assemblyName || '';
  const note = part.uncertaintyNote || '';
  if (scope === 'unknown' && !component && !assembly && !note) return '';
  return `
    <section class="detail-box scope-box">
      <strong>${escapeHtml(scopeLabel(scope))}</strong>
      ${component ? `<div class="meta">Видимый компонент: <b>${escapeHtml(component)}</b></div>` : ''}
      ${assembly ? `<div class="meta">Узел/система: <b>${escapeHtml(assembly)}</b></div>` : ''}
      ${note ? `<div class="meta scope-note">${escapeHtml(note)}</div>` : ''}
    </section>
  `;
}

function renderMarket(part) {
  const listings = Array.isArray(part.marketListings) ? part.marketListings.filter(item => item && item.url) : [];
  if (!listings.length) return '<section class="detail-box"><strong>OLX</strong><div class="meta">Похожие объявления пока не найдены</div></section>';
  return `
    <section class="detail-box">
      <strong>OLX объявления</strong>
      <div class="detail-market-list">
        ${listings.map(item => `
          <a class="detail-market-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="">` : '<span class="market-thumb-empty"></span>'}
            <span><b>${escapeHtml(item.title || 'Объявление')}</b><em>${escapeHtml(item.location || item.matchedQuery || 'OLX')}</em></span>
            <strong>${item.price ? `${formatMoney(item.price)} ${escapeHtml(item.currency || 'UAH')}` : 'цена ?'}</strong>
          </a>
        `).join('')}
      </div>
    </section>`;
}

function scopeLabel(scope) {
  return {
    whole_part: 'Целая деталь',
    assembly: 'Узел в сборе',
    subcomponent: 'Часть узла',
    fragment: 'Фрагмент детали',
    installed_component: 'Деталь установлена на авто',
    unknown: 'Тип детали не уточнён'
  }[scope] || 'Тип детали не уточнён';
}

function box(title, text) { return `<section class="detail-box"><strong>${escapeHtml(title)}</strong><div class="meta">${escapeHtml(text)}</div></section>`; }
function tagsBox(title, items) { return `<section class="detail-box"><strong>${escapeHtml(title)}</strong><div class="tags">${items.map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('')}</div></section>`; }
function listBox(title, items) { return `<section class="detail-box"><strong>${escapeHtml(title)}</strong>${items.map(item => `<div class="meta">• ${escapeHtml(item)}</div>`).join('')}</section>`; }
function scanTimestamp(part) { return part?.createdAt || part?.updatedAt || part?.scannedAt || null; }
function formatDate(value) { const time = value ? new Date(value).getTime() : 0; return Number.isFinite(time) && time ? new Date(time).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'неизвестно'; }
function formatMoney(value) { return Number(value || 0).toLocaleString('ru-RU'); }
function parseList(value) { try { const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value; return Array.isArray(parsed) ? parsed.filter(Boolean) : []; } catch { return []; } }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
