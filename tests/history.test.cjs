const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../history.js'), 'utf8');
function setup() {
  let user = null, fail = false; const store = new Map(), rows = new Map();
  const client = { from() { return { async upsert(row) { if (fail) return {error: true}; rows.set(row.user_id + ':' + row.id, row); return {error: null}; } }; } };
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
