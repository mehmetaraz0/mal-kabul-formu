import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => {
  const order = vi.fn(() => Promise.resolve({ data: [{ id: 1, name: 'TEST FIRMA', sira_no: 1 }], error: null }));
  const select = vi.fn(() => ({ order }));
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn(() => ({ select, insert }));
  return { supabase: { from } };
});

import { listCompanies, addCompany } from '../src/lib/companies.js';
import { supabase } from '../src/lib/supabase.js';

describe('companies', () => {
  it('listCompanies isim sırasına göre firmaları döner', async () => {
    const result = await listCompanies();
    expect(result).toEqual([{ id: 1, name: 'TEST FIRMA', sira_no: 1 }]);
    expect(supabase.from).toHaveBeenCalledWith('companies');
  });

  it('addCompany boş isimde hata fırlatır', async () => {
    await expect(addCompany('   ')).rejects.toThrow('Firma adı boş olamaz');
  });

  it('addCompany geçerli isimle insert çağırır', async () => {
    await addCompany('Yeni Firma');
    expect(supabase.from).toHaveBeenCalledWith('companies');
  });
});
