import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const ALLOWED_ROLES = ['admin', 'depo_yonetici', 'kalite_ekibi'];
const EMAIL_DOMAIN = '@malkabul.local';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

Deno.serve(async (req) => {
  // supabase-js'in functions.invoke() çağrısı tarayıcıdan yapıldığında Authorization/
  // Content-Type header'ları yüzünden bir CORS preflight (OPTIONS) isteği gönderir — bu
  // yanıtlanmazsa tarayıcı asıl POST isteğini hiç göndermez.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Yetkilendirme başlığı eksik' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // Çağıranın kim olduğunu doğrulamak için ANON anahtarlı, çağıranın kendi JWT'sini taşıyan bir
  // client kullanıyoruz — service_role client'ıyla auth.getUser() çağırmak JWT doğrulamasını
  // atlar (her token'ı sorgusuzca geçerli sayar), bu yüzden ayrı bir "caller" client'ı şart.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Geçersiz oturum' }, 401);
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  // KRİTİK: bu kontrol olmadan fonksiyon herkese açık bir "kullanıcı oluştur" arka kapısı olur.
  if (profileError || callerProfile?.role !== 'admin') {
    return jsonResponse({ error: 'Bu işlem için admin yetkisi gerekli' }, 403);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Geçersiz istek gövdesi' }, 400);
  }

  const { username, password, fullName, role } = body;
  if (!username || !password || !fullName || !role) {
    return jsonResponse({ error: 'username, password, fullName, role alanları zorunlu' }, 400);
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return jsonResponse({ error: 'Geçersiz rol: ' + role }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: username.trim().toLowerCase() + EMAIL_DOMAIN,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role }
  });

  if (createError) {
    return jsonResponse({ error: createError.message }, 400);
  }

  return jsonResponse({ id: created.user.id, fullName, role }, 200);
});
