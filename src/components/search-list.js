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

  // Seçim `click` yerine `pointerup`'ta kesinleşiyor. Dokunmatik cihazda bir tap şu sırayla
  // ilerler: pointerdown → pointerup → input blur → SANAL KLAVYE KAPANIR (sayfa yeniden akar,
  // içerik yukarı kayar) → mousedown → click. Tarayıcı `click`'i parmağın bıraktığı KOORDİNATA
  // gönderdiği için, klavye kapandıktan sonra o koordinatta artık listedeki öğe değil altındaki
  // form hücresi bulunur: seçim hiç olmaz, arkadaki alan tıklanır ve o nokta container dışında
  // kaldığından `handleOutsideClick` dropdown'ı kapatır. `pointerup` bu düzen değişikliğinden
  // ÖNCE gelir.
  //
  // Neden `pointerdown` değil: dropdown 260px'e sığmayan uzun bir liste (60+ ürün) ve
  // kaydırılabilir. pointerdown'da seçmek, kullanıcı listeyi kaydırmak için parmağını
  // bastığı anda o öğeyi seçerdi. Bu yüzden pointerdown yalnızca başlangıç noktasını
  // kaydediyor; seçim, parmak kaymadan kalktıysa (DRAG_TOLERANCE_PX) pointerup'ta yapılıyor.
  const DRAG_TOLERANCE_PX = 10;

  function bindItemSelection(source) {
    list.querySelectorAll('li[data-key]').forEach((li) => {
      let start = null;
      let handled = false;

      const commit = (e) => {
        // pointer yolu seçimi yaptıysa, hemen ardından gelen uyumluluk click'ini yut.
        if (handled) return;
        handled = true;
        if (e.cancelable) e.preventDefault();
        const item = source.find((i) => String(getKey(i)) === li.dataset.key);
        input.value = '';
        closeDropdown();
        // Odağı input'ta tutuyoruz: odak kaybı sanal klavyeyi kapatır, bu da sayfayı yeniden
        // akıtıp takip eden click'i yanlış elemana düşürür (yukarıdaki kök neden).
        input.focus();
        onSelect(item);
      };

      li.addEventListener('pointerdown', (e) => {
        start = { x: e.clientX, y: e.clientY };
      });

      li.addEventListener('pointerup', (e) => {
        if (!start) return;
        const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
        start = null;
        if (moved > DRAG_TOLERANCE_PX) return; // kaydırma hareketi, seçim değil
        commit(e);
      });

      // Pointer olaylarını desteklemeyen ortamlar için geri düşüş.
      li.addEventListener('click', commit);
    });
  }

  function renderList(filtered) {
    if (filtered.length === 0) {
      list.innerHTML = '<li style="padding:0.6rem 0.8rem;color:var(--color-label, #666);">Sonuç bulunamadı</li>';
    } else {
      list.innerHTML = filtered
        .map((item) => `<li data-key="${escapeHtml(getKey(item))}" style="padding:0.6rem 0.8rem;border-bottom:1px solid var(--color-border);cursor:pointer;">${escapeHtml(getLabel(item))}</li>`)
        .join('');
      bindItemSelection(filtered);
    }
    list.style.display = 'block';
  }

  // İlk render'da eşleşen öğeleri (gizli halde) DOM'a yazıyoruz — boş sorguda `filterItems`
  // tüm listeyi döndürdüğü için bu, kutu odaklanmadan yazılmaya başlanır başlanmaz doğru
  // sonuçların hazır olmasını sağlar; sadece görünürlük `display:none` ile kontrol ediliyor.
  list.innerHTML = items
    .map((item) => `<li data-key="${escapeHtml(getKey(item))}" style="padding:0.6rem 0.8rem;border-bottom:1px solid var(--color-border);cursor:pointer;">${escapeHtml(getLabel(item))}</li>`)
    .join('');
  bindItemSelection(items);

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
