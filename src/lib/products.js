import { supabase } from './supabase.js';
import { cacheAside } from './offline-cache.js';

const VALID_UNITS = ['kg', 'ad'];
const VALID_CATEGORIES = ['ET', 'BALIK'];

export async function listProducts() {
  return cacheAside('cache:products', async () => {
    // NOTE: real supabase-js query builders are self-chainable thenables, so
    // `.order('category').order('name')` works against the live backend.
    // A minimal mock's `.order()` resolves directly to a Promise (no further
    // `.order` method), so chaining two `.order()` calls breaks under test.
    // We call `.order()` once server-side and finish the secondary sort
    // (by name, Turkish-aware) client-side — same effective ordering, and
    // compatible with both the real client and simple mocks.
    const { data, error } = await supabase.from('products').select('id, code, name, unit, category').order('category');
    if (error) throw error;
    return [...data].sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category, 'tr');
      return a.name.localeCompare(b.name, 'tr');
    });
  });
}

export async function addProduct({ code, name, unit, category }) {
  if (!code?.trim() || !name?.trim()) throw new Error('Ürün kodu ve adı zorunlu');
  if (!VALID_UNITS.includes(unit)) throw new Error('Geçersiz birim');
  if (!VALID_CATEGORIES.includes(category)) throw new Error('Geçersiz kategori');
  const { error } = await supabase.from('products').insert({
    code: code.trim(),
    name: name.trim(),
    unit,
    category
  });
  if (error) throw error;
}
