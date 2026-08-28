import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages'te bir proje sitesi (kullanici.github.io/repo-adi/) olarak yayınlanıyor;
// tüm asset yolları bu alt-dizine göre üretilmeli, aksi halde CSS/JS 404 verir.
export default defineConfig({
  base: '/mal-kabul-formu/',
  plugins: [
    VitePWA({
      // 'autoUpdate' DEĞİL: yeni bir deploy yayınlandığında service worker hemen skipWaiting
      // yapıp sayfayı habersizce yeniliyordu. Mal kabul formunda taslak kalıcılığı olmadığı için
      // bu, formu doldurmakta olan bir kullanıcının girdiği tüm satırları sessizce yok ederdi.
      // 'prompt' ile yeni sürüm beklemede kalır; main.js'teki registerSW({ onNeedRefresh })
      // kullanıcıya "Yeni sürüm mevcut / Yenile" çubuğunu gösterir ve güncelleme ancak kullanıcı
      // onaylayınca uygulanır.
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Mal Kabul Formu',
        short_name: 'MalKabul',
        description: 'Depo mal kabul kayıt ve onay sistemi',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/mal-kabul-formu/',
        scope: '/mal-kabul-formu/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // xlsx: mal kabul formu şablonu (public/sablonlar/mal-kabul-formu-sablonu.xlsx) —
        // önbelleğe alınmazsa offline'da Excel çıktısı "Şablon indirilemedi" hatası verir.
        globPatterns: ['**/*.{js,css,html,xlsx}'],
        // Supabase REST API farklı bir origin'de yaşar (https://<proje-ref>.supabase.co),
        // uygulamanın kendi origin'inden ayrı. Workbox'ın generateSW router'ı `fetch` event'ini
        // TÜM isteklerde (same-origin ve cross-origin dahil) yakalar ve her runtimeCaching girdisi
        // için urlPattern fonksiyonunu, isteğin tam URL'iyle (origin farketmeksizin) çağırır —
        // bu yüzden yalnızca `url.pathname` kontrolü, origin'i ayrıca kısıtlamadan
        // Supabase isteklerini de doğru şekilde eşler.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/rest/v1/companies') || url.pathname.startsWith('/rest/v1/products'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-master-data',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          }
        ]
      }
    })
  ],
  test: {
    // .worktrees, geliştirme sırasında kullanılan git worktree'leri barındırır (gitignore'da) —
    // vitest'in varsayılan glob'u bunları da tarayıp testleri iki kez çalıştırmasın diye hariç tutulur.
    exclude: ['**/node_modules/**', '**/.worktrees/**'],
    // router testleri window/document kullanıyor; varsayılan 'node' ortamında bunlar tanımsız kalır.
    environment: 'jsdom'
  }
});
