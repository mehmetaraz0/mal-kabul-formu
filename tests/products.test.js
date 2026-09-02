import { describe, it, expect, vi, beforeEach } from 'vitest';

const { order, select, insert, from } = vi.hoisted(() => {
  const order = vi.fn(() => Promise.resolve({
    data: [{ id: 1, code: 'YIY01000001', name: 'TEST ÜRÜN', unit: 'kg', category: 'ET', derece_min: -22, derece_max: -16 }],
    error: null
  }));
  const select = vi.fn(() => ({ order }));
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn(() => ({ select, insert }));
  return { order, select, insert, from };
});

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from }
}));

import { listProducts, addProduct } from '../src/lib/products.js';
import { supabase } from '../src/lib/supabase.js';

describe('products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listProducts kategoriye göre gruplanabilir veri döner', async () => {
    const result = await listProducts();
    expect(result[0].category).toBe('ET');
    expect(supabase.from).toHaveBeenCalledWith('products');
  });

  it('listProducts derece_min/derece_max alanlarını döner ve select sorgusuna dahil eder', async () => {
    const result = await listProducts();
    expect(result[0].derece_min).toBe(-22);
    expect(result[0].derece_max).toBe(-16);
    expect(select).toHaveBeenCalledWith('id, code, name, unit, category, derece_min, derece_max');
  });

  it('addProduct geçersiz birimde hata fırlatır', async () => {
    await expect(addProduct({ code: 'X1', name: 'Ürün', unit: 'litre', category: 'ET' })).rejects.toThrow('Geçersiz birim');
  });

  it('addProduct geçersiz kategoride hata fırlatır', async () => {
    await expect(addProduct({ code: 'X1', name: 'Ürün', unit: 'kg', category: 'SEBZE' })).rejects.toThrow('Geçersiz kategori');
  });

  it('addProduct eksik kodda hata fırlatır', async () => {
    await expect(addProduct({ code: '', name: 'Ürün', unit: 'kg', category: 'ET' })).rejects.toThrow('Ürün kodu ve adı zorunlu');
  });

  it('addProduct geçerli veriyle insert çağırır', async () => {
    await addProduct({ code: 'YIY01999999', name: 'Yeni Ürün', unit: 'kg', category: 'ET' });
    expect(supabase.from).toHaveBeenCalledWith('products');
  });
});
