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

async function loadParts() {
  const response = await fetch('/api/v1/parts');
  allParts = response.ok ? await response.json() : [];
  catalogMeta.textContent = `${allParts.length} сканов`;
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
    .filter(part => {
      if (!searchQuery) return true;
      return [part.name, part.normalizedName, part.manufacturer, part.articleNumber, part.category, part.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(searchQuery);
    });

  partsList.innerHTML = visibleParts.length ? visibleParts.map(renderPart).join('') : '<div class="empty">Ничего не найдено</div>';
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
  if (response.ok) await loadParts();
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
