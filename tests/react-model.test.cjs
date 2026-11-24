const test = require("node:test");
const assert = require("node:assert/strict");
const model = import("../src/exam-model.js");
test("React exam samples the correct distribution and retains snapshot order", async () => {
  const m = await model,
    a = m.newAttempt("test");
  assert.equal(a.order.length, 100);
  assert.equal(new Set(a.order).size, 100);
  assert.deepEqual(
    m.SUBJECTS.map(
      (s) => a.order.filter((i) => m.question(a, i).subject === s.name).length,
    ),
    [10, 50, 20, 20],
  );
  assert.deepEqual(m.normalize(JSON.parse(JSON.stringify(a))).order, a.order);
});
test("React result uses saved questions and frozen pass rules", async () => {
  const m = await model,
    a = m.newAttempt("test");
  for (const i of a.order) a.answers[i] = a.bank[i].answer;
  let r = m.result(a);
  assert.equal(r.correct, 100);
  assert.equal(r.pass, true);
  a.bank[a.order[0]].answer = null;
  r = m.result(a);
  assert.equal(r.verified, 99);
  assert.equal(r.pass, null);
});
test("legacy saved 200-question attempts remain compatible", async () => {
  const m = await model,
    a = m.normalize({ started: Date.now(), answers: { 1: 2 } });
  assert.equal(a.order.length, 200);
  assert.equal(a.answers[1], 2);
  assert.equal(m.result(a).standard, false);
});
test("pass thresholds require both sections and include the boundary", async () => {
  const m = await model;
  for (const [ethics, professional, expected] of [[7, 54, true], [6, 90, false], [10, 53, false], [0, 0, false]]) {
    const a = m.newAttempt("test");
    let e = ethics, p = professional;
    for (const i of a.order) {
      const q = a.bank[i];
      const correct = q.subject === m.SUBJECTS[0].name ? e-- > 0 : p-- > 0;
      a.answers[i] = correct ? q.answer : (q.answer + 1) % q.options.length;
    }
    assert.equal(m.result(a).pass, expected);
  }
});
test("unanswered questions count as blank", async () => {
  const m = await model, result = m.result(m.newAttempt("test"));
  assert.equal(result.pass, false);
  assert.equal([...result.subjects.values()].reduce((n, s) => n + s.blank, 0), 100);
});
test("choice references retain their original order", async () => {
  const m = await model, a = m.newAttempt("test");
  for (const text of ["ถูกทั้งข้อ ก. และข้อ ข.", "เฉพาะข้อ ข. และ ค.", "ข้อ ก และ ข ถูก", "เว้นข้อ ค"]) {
    assert.equal(m.keepsOriginalLetters({ question: "", options: [text] }), true);
  }
  m.QUESTIONS.forEach((q, i) => {
    if (m.keepsOriginalLetters(q)) assert.deepEqual(a.optionOrders[i], q.options.map((_, j) => j));
  });
});
test("restoring attempts preserves snapshots and rejects invalid saved data", async () => {
  const m = await model, a = m.newAttempt("test"), i = a.order[0];
  a.answers[i] = a.bank[i].answer;
  const restored = m.normalize(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(restored.optionOrders, a.optionOrders);
  assert.deepEqual(restored.answers, a.answers);
  assert.deepEqual(restored.bank[i], a.bank[i]);
  const recovered = m.normalize({ started: Date.now(), order: [0, 0], answers: { 9999: 1, 1: 2 } });
  assert.equal(recovered.order.length, 200);
  assert.equal(recovered.answers[1], 2);
  assert.equal(recovered.answers[9999], undefined);
});
test("new attempts exclude the duplicate question", async () => {
  const m = await model;
  for (let i = 0; i < 20; i++) assert.equal(m.newAttempt("test").order.includes(160), false);
});
