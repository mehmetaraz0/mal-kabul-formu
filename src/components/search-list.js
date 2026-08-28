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

// Popup/dropdown arama: kutu boşken hiçbir liste görünmez; yazınca eşleşenler kutunun
// altında kayan bir dropdown'da açılır, seçilince veya kutu dışına tıklanınca kapanır.
// `container`'ın kendisi konumlandırma referansı olarak kullanıldığı için (position:relative)
// çağıran taraf ekstra bir sarmalayıcı eklemek zorunda kalmaz.
export function renderSearchList(container, { items, getLabel, getKey, onSelect, placeholder }) {
  container.style.position = 'relative';
  container.innerHTML = `
    <input type="text" class="search-input" placeholder="${escapeHtml(placeholder || 'Ara...')}" />
    <ul class="search-results" style="display:none;position:absolute;left:0;right:0;z-index:20;list-style:none;padding:0;margin:0.25rem 0 0;max-height:260px;overflow-y:auto;background:var(--color-card-bg, white);box-shadow:var(--shadow-card, 0 1px 3px rgba(0,0,0,0.15));border:1px solid var(--color-border);border-radius:var(--radius-input);"></ul>
  `;
  const input = container.querySelector('.search-input');
  const list = container.querySelector('.search-results');

  function closeDropdown() {
    list.style.display = 'none';
  }

  function renderList(filtered) {
    if (filtered.length === 0) {
      list.innerHTML = '<li style="padding:0.6rem 0.8rem;color:var(--color-label, #666);">Sonuç bulunamadı</li>';
    } else {
      list.innerHTML = filtered
        .map((item) => `<li data-key="${escapeHtml(getKey(item))}" style="padding:0.6rem 0.8rem;border-bottom:1px solid var(--color-border);cursor:pointer;">${escapeHtml(getLabel(item))}</li>`)
        .join('');
      list.querySelectorAll('li[data-key]').forEach((li) => {
        li.addEventListener('click', () => {
          const item = filtered.find((i) => String(getKey(i)) === li.dataset.key);
          input.value = '';
          closeDropdown();
          onSelect(item);
        });
      });
    }
    list.style.display = 'block';
  }

  // İlk render'da eşleşen öğeleri (gizli halde) DOM'a yazıyoruz — boş sorguda `filterItems`
  // tüm listeyi döndürdüğü için bu, kutu odaklanmadan yazılmaya başlanır başlanmaz doğru
  // sonuçların hazır olmasını sağlar; sadece görünürlük `display:none` ile kontrol ediliyor.
  list.innerHTML = items
    .map((item) => `<li data-key="${escapeHtml(getKey(item))}" style="padding:0.6rem 0.8rem;border-bottom:1px solid var(--color-border);cursor:pointer;">${escapeHtml(getLabel(item))}</li>`)
    .join('');
  list.querySelectorAll('li[data-key]').forEach((li) => {
    li.addEventListener('click', () => {
      const item = items.find((i) => String(getKey(i)) === li.dataset.key);
      input.value = '';
      closeDropdown();
      onSelect(item);
    });
  });

  input.addEventListener('input', () => {
    const query = input.value.trim();
    if (!query) {
      closeDropdown();
      return;
    }
    renderList(filterItems(items, input.value, getLabel));
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });

  // Kendi kendini temizleyen dış-tıklama dinleyicisi: `container` sayfadan kaldırıldıktan
  // (ör. kullanıcı başka bir sayfaya geçtikten) sonra `document`'a sonsuza kadar bağlı kalıp
  // sızıntı yapmaması için, container artık DOM'da değilse dinleyiciyi kendisi söküyor.
  function handleOutsideClick(e) {
    if (!document.body.contains(container)) {
      document.removeEventListener('mousedown', handleOutsideClick);
      return;
    }
    if (!container.contains(e.target)) closeDropdown();
  }
  document.addEventListener('mousedown', handleOutsideClick);
}
