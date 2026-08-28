export { hasRole } from './role.js';

import { supabase } from './supabase.js';
import { cacheAside } from './offline-cache.js';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// `getCurrentProfile()` UYGULAMANIN HER ROTASININ ilk adımı (main.js'in renderApp'i ve her sayfa
// handler'ı ayrı ayrı çağırıyor). Önbelleksiz haliyle `profiles` select'i çevrimdışıyken ağ
// hatasıyla patlıyordu ve renderApp'in catch bloğu "Bir hata oluştu" ekranını basıyordu — yani
// Task 3'ün tüm çevrimdışı kuyruğu pratikte ERİŞİLEMEZ hale geliyordu (tek çalışan senaryo,
// kullanıcının zaten /yeni-kabul sayfasındayken bağlantısının kopması). Bu yüzden select,
// Task 1'in `cacheAside` yardımcısıyla sarmalanıyor.
//
// Anahtar kullanıcıya özel (`cache:profile:<user id>`): paylaşımlı depo tabletinde A kullanıcısının
// önbelleklenmiş profilinin B kullanıcısına gösterilmesi mümkün olmasın diye. Önbelleğe yazılan
// veri (id/full_name/role) zaten `profiles_select_all` politikası `using (true)` olduğu için oturum
// açmış herhangi bir kullanıcının okuyabildiği bir veri — yani önbellek yeni bir bilgi sızdırmıyor.
// Rol bilgisi yalnızca ARAYÜZÜ (nav butonları, sayfa erişimi) şekillendirir; gerçek yetkilendirme
// sunucudaki RLS politikalarında, dolayısıyla bayat bir önbellek yetki yükseltmesine yol açamaz.
export async function getCurrentProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return cacheAside(`cache:profile:${session.user.id}`, async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', session.user.id)
      .single();
    if (error) throw error;
    return data;
  });
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}
