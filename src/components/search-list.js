import { escapeHtml } from '../lib/html.js';

function normalize(str) {
  return str
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u');
}

export function filterItems(items, query, getLabel) {
  const q = normalize(query.trim());
  if (!q) return items;
  return items.filter((item) => normalize(getLabel(item)).includes(q));
}

export function renderSearchList(container, { items, getLabel, getKey, onSelect, placeholder }) {
  container.innerHTML = `
    <input type="text" class="search-input" placeholder="${escapeHtml(placeholder || 'Ara...')}" />
    <ul class="search-results" style="list-style:none;padding:0;max-height:260px;overflow-y:auto;"></ul>
  `;
  const input = container.querySelector('.search-input');
  const list = container.querySelector('.search-results');

  function renderList(filtered) {
    list.innerHTML = filtered
      .map((item) => `<li data-key="${escapeHtml(getKey(item))}" style="padding:0.5rem;border-bottom:1px solid #eee;cursor:pointer;">${escapeHtml(getLabel(item))}</li>`)
      .join('');
    list.querySelectorAll('li').forEach((li) => {
      li.addEventListener('click', () => {
        const item = filtered.find((i) => String(getKey(i)) === li.dataset.key);
        onSelect(item);
      });
    });
  }

  renderList(items);
  input.addEventListener('input', () => {
    renderList(filterItems(items, input.value, getLabel));
  });
}
