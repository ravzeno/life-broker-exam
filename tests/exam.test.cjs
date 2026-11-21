const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'questions.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'exam.js'), 'utf8');
class Element {
  constructor() { this.children = []; this.style = {}; this.textContent = ''; this.className = ''; this.classList = { toggle() {} }; }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute() {}
}
function setup(initial) {
  let saved = initial && JSON.stringify(initial), nodes = {};
  const context = { document: { getElementById: id => nodes[id] ||= new Element(), createElement: () => new Element() },
    localStorage: { getItem: () => saved || null, setItem: (_, value) => { saved = value; } },
    setTimeout: () => 1, clearTimeout() {}, Date, confirm: () => true, alert: message => { throw Error(message); }, window: { scrollTo() {} } };
  vm.createContext(context); vm.runInContext(source, context);
  return { run: code => vm.runInContext(code, context), nodes, saved: () => JSON.parse(saved) };
}
function fill(kit, ethics, professional) {
  kit.run(`let ethicsLeft = ${ethics}, professionalLeft = ${professional};
    for (const i of state.order) {
      const q = QUESTIONS[i], ethics = q.subject === EXAM_SUBJECTS[0].name;
      const correct = ethics ? ethicsLeft-- > 0 : professionalLeft-- > 0;
      state.answers[i] = correct ? q.answer : (q.answer + 1) % q.options.length;
    }
    submitExam(false);`);
}
test('new exam samples 100 questions without duplicates in the specified proportions', () => {
  const kit = setup(); kit.run('start()'); const { order } = kit.saved();
  const q = kit.run('QUESTIONS'); assert.equal(order.length, 100); assert.equal(new Set(order).size, 100);
  assert.deepEqual(['จรรยาบรรณและศีลธรรม','ความรู้ทั่วไปเกี่ยวกับการประกันชีวิต','ประมวลกฎหมายแพ่งและพาณิชย์','พระราชบัญญัติประกันชีวิต'].map(s => order.filter(i => q[i].subject === s).length), [10,50,20,20]);
  assert.equal(kit.nodes.numbers.children.length, 100);
});
test('both pass thresholds are inclusive and both parts must pass', () => {
  for (const [ethics, professional, passes] of [[7,54,true],[6,90,false],[10,53,false],[10,90,true],[0,0,false]]) {
    const kit = setup(); kit.run('start()'); fill(kit, ethics, professional);
    assert.equal(kit.nodes.passSummary.children[0].textContent, passes ? 'ผ่านทั้งสองส่วน' : 'ยังไม่ผ่านเกณฑ์');
    assert.equal(kit.nodes.score.textContent, `${(ethics + professional) * 2} / 200 คะแนน`);
    assert.equal(kit.nodes.reviews.children.length, 100);
  }
});
test('unanswered questions are counted as blank and do not pass', () => {
  const kit = setup(); kit.run('start(); submitExam(false)');
  assert.equal(kit.nodes.totalBlank.textContent, '100 ข้อ');
  assert.equal(kit.nodes.score.textContent, '0 / 200 คะแนน');
  assert.equal(kit.nodes.passSummary.children[0].textContent, 'ยังไม่ผ่านเกณฑ์');
});
test('saved 100-question attempt retains order, choices and correct answer after reload', () => {
  const kit = setup(); kit.run('start()'); kit.nodes.options.children[0].onclick();
  const before = kit.saved(), loaded = setup(before), after = loaded.run('state');
  assert.deepEqual(JSON.parse(JSON.stringify(after.order)), before.order);
  assert.deepEqual(JSON.parse(JSON.stringify(after.optionOrders)), before.optionOrders);
  assert.deepEqual(JSON.parse(JSON.stringify(after.answers)), before.answers);
});
test('legacy 200-question attempt remains 200 and is not assigned the new pass criteria', () => {
  const oldOrder = Array.from({ length: 200 }, (_, i) => 199 - i);
  const kit = setup({ started: Date.now(), finished: false, answers: { 199: 0 }, order: oldOrder, index: 0 });
  assert.equal(kit.run('state.order.length'), 200); assert.equal(kit.run('state.order[0]'), 199); assert.equal(kit.run('state.answers[199]'), 0);
  kit.run('submitExam(false)'); assert.match(kit.nodes.passSummary.textContent, /รอบเดิม/); assert.equal(kit.nodes.reviews.children.length, 200);
});
test('questions referencing other choices keep their original order', () => {
  const kit = setup(); kit.run('start()'); const state = kit.saved(), q = kit.run('QUESTIONS');
  q.forEach((_, i) => { if (kit.run(`keepsOriginalLetters(QUESTIONS[${i}])`)) assert.deepEqual(state.optionOrders[i], [0,1,2,3]); });
});
test('missing answer keys are excluded and prevent a pass verdict', () => {
  const kit = setup(); kit.run(`start();
    for (const i of state.order) state.answers[i] = QUESTIONS[i].answer;
    QUESTIONS[state.order[0]].answer = null;
    submitExam(false);`);
  assert.equal(kit.nodes.score.textContent, '198 / 198 คะแนน');
  assert.match(kit.nodes.passSummary.children[0].textContent, /ยังสรุปผลผ่านไม่ได้/);
});
test('explicit references to choice letters retain their original ordering', () => {
  const kit = setup();
  for (const text of ['ถูกทั้งข้อ ก. และข้อ ข.', 'เฉพาะข้อ ข. และ ค.', 'ข้อ ก และ ข ถูก', 'เว้นข้อ ค']) {
    assert.equal(kit.run(`keepsOriginalLetters({question: '', options: [${JSON.stringify(text)}], explanation: ''})`), true, text);
  }
});
test('expired attempts submit automatically and stop at the time limit', () => {
  const kit = setup(); kit.run('start(); state.started = Date.now() - DURATION - 1000; expired();');
  assert.equal(kit.run('state.finished'), true);
  assert.equal(kit.run('state.ended - state.started'), 150 * 60 * 1000);
  assert.equal(kit.nodes.reviews.children.length, 100);
});
test('malformed saved order is safely recovered as a legacy attempt', () => {
  const kit = setup({ started: Date.now(), order: [0,0], answers: { 9999: 1, 1: 2 } });
  assert.equal(kit.run('state.order.length'), 200);
  assert.equal(kit.run('state.answers[1]'), 2);
  assert.equal(kit.run('state.answers[9999]'), undefined);
});
test('new exams do not include the duplicate claim-proof question', () => {
  const kit = setup();
  for (let i = 0; i < 100; i++) assert.equal(kit.run('newExamOrder().includes(160)'), false);
});
