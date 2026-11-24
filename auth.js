/* Account UI. The publishable key is public; database authorization belongs in RLS. */
(() => {
  const root = document.getElementById('auth-root');
  if (!root) return;
  const config = window.SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.anonKey && window.supabase?.createClient);
  const client = configured ? window.supabase.createClient(config.url, config.anonKey, {
    auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true }
  }) : null;
  let session = null;
  const listeners = new Set();
  const redirectTo = location.origin + location.pathname;

  root.innerHTML = `<div class="auth-bar"><span id="auth-status">กำลังตรวจสอบบัญชี…</span><button type="button" class="secondary" id="auth-open">เข้าสู่ระบบ / สมัครสมาชิก</button><button type="button" class="secondary hidden" id="auth-signout">ออกจากระบบ</button></div>
    <div id="auth-panel" class="auth-panel hidden" aria-label="บัญชีผู้ใช้">
      <div class="auth-heading"><h2 id="auth-title">เข้าสู่ระบบ</h2><button type="button" class="secondary" id="auth-close" aria-label="ปิด">ปิด</button></div>
      <p id="auth-message" class="auth-message" role="status" aria-live="polite"></p>
      <form id="auth-form">
        <label for="auth-email">อีเมล</label><input id="auth-email" type="email" autocomplete="email" required maxlength="254">
        <label for="auth-password">รหัสผ่าน</label><input id="auth-password" type="password" autocomplete="current-password" required minlength="8" maxlength="128">
        <button class="primary" id="auth-submit" type="submit">เข้าสู่ระบบ</button>
      </form>
      <div id="auth-options" class="auth-options"><button type="button" class="secondary" id="auth-google">เข้าสู่ระบบด้วย Google</button><button type="button" class="auth-link" id="auth-switch">ยังไม่มีบัญชี? สมัครสมาชิก</button><button type="button" class="auth-link" id="auth-forgot">ลืมรหัสผ่าน</button><button type="button" class="auth-link" id="auth-guest">ทำข้อสอบแบบ Guest</button></div>
    </div>`;
  const byId = id => document.getElementById(id);
  let mode = 'signin';
  function message(text, error = false) {
    const node = byId('auth-message');
    node.textContent = text;
    node.classList.toggle('auth-error', error);
  }
  function setMode(next) {
    mode = next;
    const recovery = mode === 'recovery';
    byId('auth-title').textContent = recovery ? 'ตั้งรหัสผ่านใหม่' : mode === 'signup' ? 'สมัครสมาชิก' : mode === 'forgot' ? 'ตั้งรหัสผ่านใหม่' : 'เข้าสู่ระบบ';
    byId('auth-submit').textContent = recovery ? 'บันทึกรหัสผ่านใหม่' : mode === 'signup' ? 'สมัครสมาชิก' : mode === 'forgot' ? 'ส่งลิงก์ตั้งรหัสผ่านใหม่' : 'เข้าสู่ระบบ';
    byId('auth-email').hidden = recovery;
    root.querySelector('label[for="auth-email"]').hidden = recovery;
    byId('auth-email').required = !recovery;
    const needsPassword = mode !== 'forgot';
    byId('auth-password').hidden = !needsPassword;
    root.querySelector('label[for="auth-password"]').hidden = !needsPassword;
    byId('auth-password').required = needsPassword;
    byId('auth-password').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
    byId('auth-password').minLength = mode === 'signin' ? 1 : 8;
    byId('auth-options').classList.toggle('hidden', recovery);
    byId('auth-switch').textContent = mode === 'signin' ? 'ยังไม่มีบัญชี? สมัครสมาชิก' : 'มีบัญชีแล้ว? เข้าสู่ระบบ';
    byId('auth-forgot').classList.toggle('hidden', mode === 'forgot');
    message('');
  }
  function show() {
    if (!configured) { message('ระบบบัญชียังไม่ได้ตั้งค่า สามารถสอบแบบ Guest ได้'); }
    byId('auth-panel').classList.remove('hidden');
    byId('auth-email').focus();
  }
  function render() {
    byId('auth-status').textContent = session?.user ? 'บัญชี: ' + (session.user.email || 'เข้าสู่ระบบแล้ว') : 'ใช้งานแบบ Guest · ประวัติอยู่ในเครื่องนี้';
    byId('auth-open').classList.toggle('hidden', Boolean(session?.user));
    byId('auth-signout').classList.toggle('hidden', !session?.user);
  }
  async function perform(fn) {
    const button = byId('auth-submit');
    button.disabled = true;
    try { await fn(); } catch (_) { message('ไม่สามารถดำเนินการได้ โปรดตรวจสอบข้อมูลหรือการเชื่อมต่อแล้วลองอีกครั้ง', true); }
    finally { button.disabled = false; }
  }
  byId('auth-open').onclick = show;
  byId('auth-close').onclick = () => byId('auth-panel').classList.add('hidden');
  byId('auth-guest').onclick = () => byId('auth-panel').classList.add('hidden');
  byId('auth-switch').onclick = () => setMode(mode === 'signin' ? 'signup' : 'signin');
  byId('auth-forgot').onclick = () => setMode('forgot');
  byId('auth-google').onclick = () => perform(async () => {
    if (!client) throw Error('unconfigured');
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw error;
  });
  byId('auth-signout').onclick = () => perform(async () => {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    byId('auth-panel').classList.add('hidden');
  });
  byId('auth-form').onsubmit = event => {
    event.preventDefault();
    perform(async () => {
      if (!client) throw Error('unconfigured');
      const email = byId('auth-email').value.trim(), password = byId('auth-password').value;
      let result;
      if (mode === 'signup') result = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
      else if (mode === 'forgot') result = await client.auth.resetPasswordForEmail(email, { redirectTo });
      else if (mode === 'recovery') result = await client.auth.updateUser({ password });
      else result = await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      byId('auth-password').value = '';
      if (mode === 'signup') message('หากสมัครสำเร็จ โปรดตรวจสอบอีเมลเพื่อยืนยันบัญชี');
      else if (mode === 'forgot') message('หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่');
      else if (mode === 'recovery') { setMode('signin'); message('เปลี่ยนรหัสผ่านแล้ว'); }
      else byId('auth-panel').classList.add('hidden');
    });
  };
  window.examAuth = {
    client,
    isConfigured: configured,
    getUser: () => session?.user || null,
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    show
  };
  setMode('signin');
  if (client) {
    client.auth.onAuthStateChange((event, nextSession) => {
      session = nextSession;
      render();
      if (event === 'PASSWORD_RECOVERY') { setMode('recovery'); byId('auth-panel').classList.remove('hidden'); byId('auth-password').focus(); }
      setTimeout(() => listeners.forEach(fn => fn(event, nextSession)), 0);
    });
  } else render();
})();
