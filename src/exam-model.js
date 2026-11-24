import { QUESTIONS } from "../questions.js";
export const DURATION = 150 * 60 * 1000;
export const BASE_KEY = "life-broker-exam-v1";
export const SUBJECTS = [
  { name: "จรรยาบรรณและศีลธรรม", count: 10 },
  { name: "ความรู้ทั่วไปเกี่ยวกับการประกันชีวิต", count: 50 },
  { name: "ประมวลกฎหมายแพ่งและพาณิชย์", count: 20 },
  { name: "พระราชบัญญัติประกันชีวิต", count: 20 },
];
export const LETTERS = ["ก", "ข", "ค", "ง"];
export const defaultRules = () => ({
  subjects: SUBJECTS.map((s) => ({ ...s })),
  ethicsCorrect: 7,
  professionalCorrect: 54,
});
const identity = (n) => Array.from({ length: n }, (_, i) => i);
export function shuffled(n) {
  const v = identity(n);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [v[i], v[j]] = [v[j], v[i]];
  }
  return v;
}
export function keepsOriginalLetters(q) {
  return [q.question, ...q.options, q.explanation || ""].some((t) =>
    /(?:ทั้ง|เฉพาะ|ถูก|ผิด|เว้น|ข้อ|เฉลย)\s*(?:ข้อ)?\s*[กขคง](?:\.|\s|และ|$)/.test(
      t,
    ),
  );
}
export function label(q, original, position) {
  return LETTERS[keepsOriginalLetters(q) ? original : position];
}
export function question(attempt, i) {
  return attempt.bank?.[i] || QUESTIONS[i];
}
const permutation = (a, n) =>
  Array.isArray(a) &&
  a.length === n &&
  a.every((x) => Number.isInteger(x) && x >= 0 && x < n) &&
  new Set(a).size === n;
export function newAttempt(id) {
  const selected = [];
  for (const subject of SUBJECTS) {
    const available = QUESTIONS.map((q, i) => ({ q, i })).filter(
      ({ q, i }) => q.subject === subject.name && i !== 160,
    );
    if (available.length < subject.count)
      throw Error("มีข้อสอบหมวด " + subject.name + " ไม่เพียงพอ");
    selected.push(
      ...shuffled(available.length)
        .slice(0, subject.count)
        .map((i) => available[i].i),
    );
  }
  const order = shuffled(selected.length).map((i) => selected[i]);
  return {
    id,
    started: Date.now(),
    finished: false,
    answers: {},
    index: 0,
    order,
    bank: Object.fromEntries(
      order.map((i) => [i, structuredClone(QUESTIONS[i])]),
    ),
    rules: defaultRules(),
    optionOrders: QUESTIONS.map((q) =>
      keepsOriginalLetters(q)
        ? identity(q.options.length)
        : shuffled(q.options.length),
    ),
  };
}
export function normalize(saved) {
  if (!saved || !Number.isFinite(saved.started) || saved.started <= 0)
    return null;
  const validOrder =
    Array.isArray(saved.order) &&
    [100, 200].includes(saved.order.length) &&
    new Set(saved.order).size === saved.order.length &&
    saved.order.every(
      (i) =>
        Number.isInteger(i) &&
        i >= 0 &&
        Array.isArray((saved.bank?.[i] || QUESTIONS[i])?.options),
    );
  const order = validOrder
    ? saved.order
    : identity(Math.min(200, QUESTIONS.length));
  const answers = {};
  for (const [k, v] of Object.entries(saved.answers || {})) {
    const i = Number(k),
      q = saved.bank?.[i] || QUESTIONS[i];
    if (
      order.includes(i) &&
      q &&
      Number.isInteger(v) &&
      v >= 0 &&
      v < q.options.length
    )
      answers[i] = v;
  }
  const len = Math.max(QUESTIONS.length, ...order.map((i) => i + 1));
  return {
    id: saved.id,
    bank: saved.bank,
    rules: saved.rules,
    started: saved.started,
    finished: saved.finished === true,
    ended: Number.isFinite(saved.ended) ? saved.ended : undefined,
    answers,
    index: Number.isInteger(saved.index)
      ? Math.max(0, Math.min(order.length - 1, saved.index))
      : 0,
    order,
    optionOrders: Array.from({ length: len }, (_, i) => {
      const q = saved.bank?.[i] || QUESTIONS[i];
      return q
        ? permutation(saved.optionOrders?.[i], q.options.length)
          ? saved.optionOrders[i]
          : identity(q.options.length)
        : [];
    }),
  };
}
export function captureLegacy(a, id) {
  return a.id
    ? a
    : {
        ...a,
        id,
        bank:
          a.bank ||
          Object.fromEntries(
            a.order.map((i) => [i, structuredClone(QUESTIONS[i])]),
          ),
      };
}
export function result(a) {
  const rules = a.rules || defaultRules(),
    standard =
      a.order.length === 100 &&
      rules.subjects.every(
        (s) =>
          a.order.filter((i) => question(a, i).subject === s.name).length ===
          s.count,
      );
  const subjects = new Map(
    rules.subjects.map((s) => [
      s.name,
      { total: 0, correct: 0, wrong: 0, blank: 0, pending: 0 },
    ]),
  );
  let correct = 0,
    verified = 0,
    gradedAnswered = 0;
  for (const i of a.order) {
    const q = question(a, i),
      answer = a.answers[i],
      valid =
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < q.options.length,
      v = subjects.get(q.subject) || {
        total: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        pending: 0,
      };
    if (!valid) v.pending++;
    else {
      v.total++;
      verified++;
      if (answer === undefined) v.blank++;
      else {
        gradedAnswered++;
        if (answer === q.answer) {
          v.correct++;
          correct++;
        } else v.wrong++;
      }
    }
    subjects.set(q.subject, v);
  }
  const p1 = subjects.get(rules.subjects[0].name),
    p2 = rules.subjects
      .slice(1)
      .reduce((n, s) => n + subjects.get(s.name).correct, 0);
  return {
    rules,
    standard,
    subjects,
    correct,
    verified,
    gradedAnswered,
    pass:
      verified !== a.order.length
        ? null
        : p1.correct >= rules.ethicsCorrect && p2 >= rules.professionalCorrect,
    p1: p1.correct,
    p2,
  };
}
export { QUESTIONS };
