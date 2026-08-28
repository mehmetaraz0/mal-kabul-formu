import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Mal Kabul Formu',
        short_name: 'MalKabul',
        description: 'Depo mal kabul kayıt ve onay sistemi',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // Plan 5'te app-shell ve master data caching kuralları eklenecek.
        // xlsx: mal kabul formu şablonu (public/sablonlar/mal-kabul-formu-sablonu.xlsx) —
        // önbelleğe alınmazsa offline'da Excel çıktısı "Şablon indirilemedi" hatası verir.
        globPatterns: ['**/*.{js,css,html,xlsx}']
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
