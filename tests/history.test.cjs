const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../history.js'), 'utf8');
function setup() {
  let user = null, fail = false; const store = new Map(), rows = new Map();
  const client = { from() { return {
    async upsert(row) { if (fail) return {error: true}; rows.set(row.user_id + ':' + row.id, row); return {error: null}; },
    delete() { const filters = {}; return { eq(field, value) { filters[field] = value; if (field !== 'id') return this; if (fail) return Promise.resolve({error: true}); rows.delete(filters.user_id + ':' + filters.id); return Promise.resolve({error: null}); } }; }
  }; } };
  const window = { examAuth: { getUser: () => user, client } };
  const context = { window, localStorage: { getItem: k => store.get(k) || null, setItem: (k,v) => store.set(k,v) }, crypto: { randomUUID }, TextEncoder, Date, JSON };
  vm.createContext(context); vm.runInContext(source, context);
  return { history: window.examHistory, setUser: id => { user = id ? { id } : null; }, fail: value => { fail = value; }, rows };
}
function attempt(id, value) { return { id, started: 1000, ended: 2000, finished: true, snapshot: { value } }; }
test('guest history stays local and is retained after copying into an account', async () => {
  const kit = setup(), id = randomUUID(); await kit.history.saveAttempt(attempt(id, 42));
  assert.equal((await kit.history.listAttempts())[0].snapshot.value, 42);
  kit.setUser('user-a'); assert.equal(await kit.history.copyGuestAttempts(), 1);
  assert.equal(kit.rows.get('user-a:' + id).user_id, 'user-a');
  kit.setUser(null); assert.equal((await kit.history.listAttempts()).length, 1);
});
test('failed online saves remain scoped to the account and retry successfully', async () => {
  const kit = setup(), id = randomUUID(); kit.setUser('user-a'); kit.fail(true);
  await assert.rejects(kit.history.saveAttempt(attempt(id, 1))); assert.equal(kit.history.pendingCount(), 1);
  kit.setUser('user-b'); assert.equal(kit.history.pendingCount(), 0);
  kit.setUser('user-a'); kit.fail(false); await kit.history.syncPending();
  assert.equal(kit.history.pendingCount(), 0); assert.equal(kit.rows.get('user-a:' + id).user_id, 'user-a');
});

test('guest history can be copied independently into two different accounts', async () => {
  const kit = setup(), id = randomUUID(); await kit.history.saveAttempt(attempt(id, 42));
  kit.setUser('user-a'); await kit.history.copyGuestAttempts();
  kit.setUser('user-b'); await kit.history.copyGuestAttempts();
  assert.equal(kit.rows.get('user-a:' + id).snapshot.value, 42);
  assert.equal(kit.rows.get('user-b:' + id).snapshot.value, 42);
});
test('deleting an attempt removes only that guest attempt', async () => {
  const kit = setup(), id = randomUUID(), other = randomUUID();
  await kit.history.saveAttempt(attempt(id, 1)); await kit.history.saveAttempt(attempt(other, 2));
  await kit.history.deleteAttempt(id);
  assert.deepEqual(Array.from(await kit.history.listAttempts(), item => item.id), [other]);
});
test('deleting an account attempt waits for queued saves and clears pending data', async () => {
  const kit = setup(), id = randomUUID(); kit.setUser('user-a');
  const saving = kit.history.saveAttempt(attempt(id, 1));
  const deleting = kit.history.deleteAttempt(id);
  await Promise.all([saving, deleting]);
  assert.equal(kit.rows.has('user-a:' + id), false);
  assert.equal(kit.history.pendingCount(), 0);
});
test('failed account deletion keeps pending data for retry', async () => {
  const kit = setup(), id = randomUUID(); kit.setUser('user-a');
  await kit.history.saveAttempt(attempt(id, 1), {queueOnly: true});
  kit.fail(true); await assert.rejects(kit.history.deleteAttempt(id));
  assert.equal(kit.history.pendingCount(), 1);
  kit.fail(false); await kit.history.deleteAttempt(id);
  assert.equal(kit.history.pendingCount(), 0);
});
