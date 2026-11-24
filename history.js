// Exam history storage. Guests stay in this browser; signed-in users use their own
// Supabase rows protected by database RLS. Callers must surface rejected promises.
(function () {
  'use strict';
  const GUEST_KEY = 'life-broker-exam-guest-history-v1';
  const queues = new Map();
  const blockedUsers = new Set();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function makeId() {
    if (!globalThis.crypto || !globalThis.crypto.randomUUID) throw new Error('เบราว์เซอร์ไม่รองรับการสร้างรหัสรอบสอบอย่างปลอดภัย');
    return globalThis.crypto.randomUUID();
  }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function validate(attempt) {
    if (!attempt || typeof attempt !== 'object' || !uuid.test(attempt.id) ||
        !Number.isFinite(attempt.started) || attempt.started <= 0 ||
        typeof attempt.finished !== 'boolean' || !attempt.snapshot ||
        typeof attempt.snapshot !== 'object' || Array.isArray(attempt.snapshot) ||
        (attempt.finished && (!Number.isFinite(attempt.ended) || attempt.ended < attempt.started)) ||
        (!attempt.finished && attempt.ended != null)) throw new Error('ข้อมูลรอบสอบไม่ถูกต้อง');
    const safe = copy(attempt);
    // Leave room for PostgreSQL JSONB's representation and database constraints.
    if (new TextEncoder().encode(JSON.stringify(safe.snapshot)).length > 900000) throw new Error('ข้อมูลรอบสอบมีขนาดใหญ่เกินไป');
    return safe;
  }
  function guestRead() {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return [];
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { throw new Error('ไม่สามารถอ่านประวัติ Guest ได้ ข้อมูลเดิมยังอยู่ในเบราว์เซอร์'); }
    if (!Array.isArray(parsed)) throw new Error('รูปแบบประวัติ Guest ไม่ถูกต้อง ข้อมูลเดิมยังอยู่ในเบราว์เซอร์');
    try { return parsed.map(validate); } catch (_) { throw new Error('ประวัติ Guest บางรายการไม่ถูกต้อง ข้อมูลเดิมยังอยู่ในเบราว์เซอร์'); }
  }
  function guestWrite(records) { localStorage.setItem(GUEST_KEY, JSON.stringify(records)); }
  const pendingKey = userId => 'life-broker-exam-pending-v1:' + userId;
  function pendingRead(userId) {
    const raw = localStorage.getItem(pendingKey(userId));
    if (!raw) return [];
    try {
      const records = JSON.parse(raw);
      if (!Array.isArray(records)) throw new Error();
      return records.map(validate);
    } catch (_) { throw new Error('ไม่สามารถอ่านข้อมูลที่รอซิงก์ได้ ข้อมูลเดิมยังอยู่ในเบราว์เซอร์'); }
  }
  function pendingWrite(userId, records) { localStorage.setItem(pendingKey(userId), JSON.stringify(records)); }
  function putPending(userId, item) {
    const records = pendingRead(userId);
    const index = records.findIndex(record => record.id === item.id);
    if (index < 0) records.push(item); else records[index] = item;
    pendingWrite(userId, records);
  }
  function clearPendingIfUnchanged(userId, item) {
    const records = pendingRead(userId);
    const index = records.findIndex(record => record.id === item.id);
    if (index >= 0 && JSON.stringify(records[index]) === JSON.stringify(item)) {
      records.splice(index, 1);
      pendingWrite(userId, records);
    }
  }
  function pendingAttempts() { const auth = authContext(); return auth ? pendingRead(auth.userId) : []; }
  function pendingCount() {
    const auth = authContext();
    return auth ? pendingRead(auth.userId).length : 0;
  }
  function authContext() {
    const auth = window.examAuth;
    const user = auth && auth.getUser();
    if (!user) return null;
    if (!auth.client || !user.id) throw new Error('ไม่สามารถเชื่อมต่อบัญชีได้');
    return { client: auth.client, userId: user.id };
  }
  function rowFromAttempt(attempt, userId) {
    return { id: attempt.id, user_id: userId, started_at: new Date(attempt.started).toISOString(),
      ended_at: attempt.finished ? new Date(attempt.ended).toISOString() : null,
      finished: attempt.finished, snapshot: attempt.snapshot };
  }
  function attemptFromRow(row) {
    return validate({ id: row.id, started: Date.parse(row.started_at),
      ended: row.ended_at == null ? null : Date.parse(row.ended_at), finished: row.finished, snapshot: row.snapshot });
  }
  function enqueue(key, operation) {
    const previous = queues.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    queues.set(key, current);
    current.finally(() => { if (queues.get(key) === current) queues.delete(key); }).catch(() => {});
    return current;
  }
  async function saveAttempt(attempt, options = {}) {
    const item = validate(attempt); // Capture the state before it can change.
    const auth = authContext();
    if (!auth) {
      const records = guestRead();
      const index = records.findIndex(record => record.id === item.id);
      if (index < 0) records.push(item); else records[index] = item;
      guestWrite(records);
      return item;
    }
    putPending(auth.userId, item);
    return options.queueOnly ? item : uploadPending(auth, item);
  }
  function uploadPending(auth, item) {
    return enqueue(auth.userId + ':' + item.id, async () => {
      // A queued write must never be sent using a later user's session.
      const current = authContext();
      if (blockedUsers.has(auth.userId)) throw new Error('ข้อมูลรอการตรวจสอบก่อนซิงก์');
      if (!current || current.userId !== auth.userId) throw new Error('บัญชีเปลี่ยนก่อนบันทึกข้อมูล กรุณาลองอีกครั้ง');
      const latest = pendingRead(auth.userId).find(record => record.id === item.id);
      if (!latest) return item;
      const { error } = await auth.client.from('exam_attempts').upsert(rowFromAttempt(latest, auth.userId), { onConflict: 'user_id,id' });
      if (error) { blockedUsers.add(auth.userId); throw new Error('บันทึกประวัติออนไลน์ไม่สำเร็จ ข้อมูลรอซิงก์ในเบราว์เซอร์'); }
      clearPendingIfUnchanged(auth.userId, latest);
      return item;
    });
  }
  async function listAttempts() {
    const auth = authContext();
    if (!auth) return guestRead().sort((a, b) => b.started - a.started);
    const rows = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await auth.client.from('exam_attempts').select('id,started_at,ended_at,finished,snapshot')
        .eq('user_id', auth.userId).order('started_at', { ascending: false }).order('id').range(from, from + 499);
      if (error) {
        if (authContext()?.userId !== auth.userId) throw new Error('บัญชีเปลี่ยนระหว่างโหลดประวัติ กรุณาลองอีกครั้ง');
        const pending = pendingRead(auth.userId).sort((a, b) => b.started - a.started);
        if (!pending.length) throw new Error('โหลดประวัติออนไลน์ไม่สำเร็จ กรุณาลองอีกครั้ง');
        pending.offline = true;
        return pending;
      }
      if (!Array.isArray(data)) throw new Error('ข้อมูลประวัติออนไลน์ไม่ถูกต้อง');
      rows.push(...data);
      if (data.length < 500) break;
    }
    if (authContext()?.userId !== auth.userId) throw new Error('บัญชีเปลี่ยนระหว่างโหลดประวัติ กรุณาลองอีกครั้ง');
    const combined = new Map(rows.map(row => { const item = attemptFromRow(row); return [item.id, item]; }));
    // Locally queued edits are the latest state, even if the network is behind.
    pendingRead(auth.userId).forEach(item => combined.set(item.id, item));
    return [...combined.values()].sort((a, b) => b.started - a.started);
  }
  async function getAttempt(id, options = {}) {
    if (!uuid.test(id)) throw new Error('รหัสรอบสอบไม่ถูกต้อง');
    const auth = authContext();
    if (!auth) return guestRead().find(item => item.id === id) || null;
    const pending = pendingRead(auth.userId).find(item => item.id === id);
    if (pending && !options.cloudOnly) return pending;
    const { data, error } = await auth.client.from('exam_attempts').select('id,started_at,ended_at,finished,snapshot')
      .eq('user_id', auth.userId).eq('id', id).maybeSingle();
    if (error) throw new Error('โหลดผลสอบไม่สำเร็จ กรุณาลองอีกครั้ง');
    if (authContext()?.userId !== auth.userId) throw new Error('บัญชีเปลี่ยนระหว่างโหลดผลสอบ กรุณาลองอีกครั้ง');
    return data ? attemptFromRow(data) : null;
  }
  function discardPending(id) {
    const auth = authContext();
    if (!auth) throw new Error('กรุณาเข้าสู่ระบบ');
    pendingWrite(auth.userId, pendingRead(auth.userId).filter(item => item.id !== id));
  }
  async function deleteAttempt(id) {
    if (!uuid.test(id)) throw new Error('รหัสรอบสอบไม่ถูกต้อง');
    const auth = authContext();
    if (!auth) {
      guestWrite(guestRead().filter(item => item.id !== id));
      return;
    }
    return enqueue(auth.userId + ':' + id, async () => {
      if (authContext()?.userId !== auth.userId) throw new Error('บัญชีเปลี่ยนระหว่างลบข้อสอบ');
      const { error } = await auth.client.from('exam_attempts').delete().eq('user_id', auth.userId).eq('id', id);
      if (error) throw new Error('ลบข้อสอบออนไลน์ไม่สำเร็จ');
      if (authContext()?.userId !== auth.userId) throw new Error('บัญชีเปลี่ยนระหว่างลบข้อสอบ');
      pendingWrite(auth.userId, pendingRead(auth.userId).filter(item => item.id !== id));
    });
  }
  async function syncPending() {
    const auth = authContext();
    if (!auth) throw new Error('กรุณาเข้าสู่ระบบก่อนซิงก์ข้อมูล');
    const records = pendingRead(auth.userId);
    blockedUsers.delete(auth.userId);
    for (const item of records) await uploadPending(auth, item);
    return pendingRead(auth.userId).length;
  }
  // Explicit user action only. Keep guest data in place even after copying so a
  // network failure, account change, or storage error can never silently erase it.
  async function copyGuestAttempts() {
    const auth = authContext();
    if (!auth) throw new Error('กรุณาเข้าสู่ระบบก่อนบันทึกประวัติ Guest');
    const records = guestRead();
    let copied = 0;
    for (const item of records) {
      await enqueue(auth.userId + ':' + item.id, async () => {
        if (authContext()?.userId !== auth.userId) throw new Error('บัญชีเปลี่ยนระหว่างคัดลอกประวัติ');
        // Ignore duplicate IDs: retries do not overwrite newer cloud data.
        const { error } = await auth.client.from('exam_attempts').upsert(rowFromAttempt(item, auth.userId), { onConflict: 'user_id,id', ignoreDuplicates: true });
        if (error) throw new Error('คัดลอกประวัติ Guest ไม่สำเร็จ ข้อมูล Guest ยังอยู่ในเครื่อง');
      });
      copied++;
    }
    return copied;
  }
  window.examHistory = { makeId, saveAttempt, listAttempts, getAttempt, deleteAttempt, copyGuestAttempts, syncPending, pendingCount, pendingAttempts, discardPending };
}());
