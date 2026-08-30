import { supabase } from './supabase.js';

export async function listUsers() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
  if (error) throw error;
  return data;
}

export async function updateUserRole(userId, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw error;
}

export async function createUser({ username, password, fullName, role }) {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { username, password, fullName, role }
  });
  if (error) throw error;
  return data;
}
