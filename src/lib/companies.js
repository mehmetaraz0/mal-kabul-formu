import { supabase } from './supabase.js';

export async function listCompanies() {
  const { data, error } = await supabase.from('companies').select('id, name, sira_no').order('name');
  if (error) throw error;
  return data;
}

export async function addCompany(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Firma adı boş olamaz');
  const { error } = await supabase.from('companies').insert({ name: trimmed });
  if (error) throw error;
}
