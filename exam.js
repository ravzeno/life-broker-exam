const KEY = 'life-broker-exam-v1';
const DURATION = 150 * 60 * 1000;
const letters = ['ก', 'ข', 'ค', 'ง'];
const EXAM_SUBJECTS = [
  { name: 'จรรยาบรรณและศีลธรรม', count: 10 },
  { name: 'ความรู้ทั่วไปเกี่ยวกับการประกันชีวิต', count: 50 },
  { name: 'ประมวลกฎหมายแพ่งและพาณิชย์', count: 20 },
  { name: 'พระราชบัญญัติประกันชีวิต', count: 20 }
];
const LEGACY_QUESTION_COUNT = 200;
// PDF pages 58 and 59 repeat the same claim-proof question with identical choices.
// Retain both bank entries for old attempts, but use only one in new exams.
const DUPLICATE_QUESTION_IDS = new Set([160]);
const el = id => document.getElementById(id);
let state = { started: null, finished: false, answers: {}, index: 0 };
let timerId;

function identity(n) { return Array.from({ length: n }, (_, i) => i); }
function shuffled(n) {
  const result = identity(n);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function isPermutation(value, length) {
  return Array.isArray(value) && value.length === length &&
    value.every(x => Number.isInteger(x) && x >= 0 && x < length) && new Set(value).size === length;
}
function isQuestionOrder(value) {
  return Array.isArray(value) && (value.length === 100 || value.length === LEGACY_QUESTION_COUNT) &&
    value.every(x => Number.isInteger(x) && x >= 0 && x < QUESTIONS.length) && new Set(value).size === value.length;
}
function isStandardExam(order) {
  return order.length === 100 && EXAM_SUBJECTS.every(subject =>
    order.filter(i => QUESTIONS[i].subject === subject.name).length === subject.count);
}
function newExamOrder() {
  const chosen = [];
  EXAM_SUBJECTS.forEach(subject => {
    const available = QUESTIONS.map((q, i) => ({ q, i })).filter(({ q, i }) => q.subject === subject.name && !DUPLICATE_QUESTION_IDS.has(i));
    if (available.length < subject.count) throw new Error('มีข้อสอบหมวด ' + subject.name + ' ไม่เพียงพอ');
    chosen.push(...shuffled(available.length).slice(0, subject.count).map(i => available[i].i));
  });
  return shuffled(chosen.length).map(i => chosen[i]);
}
// Some answer choices and explanations refer to the original choice letters.
function keepsOriginalLetters(q) {
  return [q.question, ...q.options, q.explanation || ''].some(text =>
    /(?:ทั้ง|เฉพาะ|ถูก|ผิด|เว้น|ข้อ|เฉลย)\s*(?:ข้อ)?\s*[กขคง](?:\.|\s|และ|$)/.test(text));
}
function questionId(position) { return state.order[position]; }
function optionLabel(q, original, position) { return letters[keepsOriginalLetters(q) ? original : position]; }

// Ignore invalid or obsolete saved data rather than letting it break the exam.
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved && Number.isFinite(saved.started) && saved.started > 0) {
    // Older attempts contain all 200 original questions; new questions are appended.
    const order = isQuestionOrder(saved.order) ? saved.order : identity(Math.min(LEGACY_QUESTION_COUNT, QUESTIONS.length));
    const included = new Set(order);
    const answers = {};
    if (saved.answers && typeof saved.answers === 'object') {
      for (const [key, value] of Object.entries(saved.answers)) {
        const index = Number(key);
        if (Number.isInteger(index) && included.has(index) &&
            Number.isInteger(value) && value >= 0 && value < QUESTIONS[index].options.length) answers[index] = value;
      }
    }
    state = {
      started: saved.started,
      finished: saved.finished === true,
      ended: Number.isFinite(saved.ended) ? saved.ended : undefined,
      answers,
      index: Number.isInteger(saved.index) ? Math.max(0, Math.min(order.length - 1, saved.index)) : 0,
      order,
      optionOrders: QUESTIONS.map((q, i) => isPermutation(saved.optionOrders?.[i], q.options.length) ? saved.optionOrders[i] : identity(q.options.length))
    };
  }
} catch (_) { /* Storage can be unavailable or contain invalid JSON. */ }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* Exam remains usable for this session. */ }
}
function show(id) { ['home', 'exam', 'result'].forEach(x => el(x).classList.toggle('hidden', x !== id)); }
function start() {
  if (!state.started || state.finished) {
    let order;
    try { order = newExamOrder(); }
    catch (error) { alert(error.message); return; }
    state = { started: Date.now(), finished: false, answers: {}, index: 0,
      order,
      optionOrders: QUESTIONS.map(q => keepsOriginalLetters(q) ? identity(q.options.length) : shuffled(q.options.length)) };
    save();
  }
  show('exam'); render(); tick();
}
function tick() {
  clearTimeout(timerId);
  if (!state.started || state.finished) return;
  const remain = Math.max(0, DURATION - (Date.now() - state.started));
  const seconds = Math.ceil(remain / 1000);
  el('timer').textContent = [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(x => String(x).padStart(2, '0')).join(':');
  if (remain === 0) return submitExam(true);
  timerId = setTimeout(tick, Math.min(1000, remain));
}
function expired() {
  if (state.started && !state.finished && Date.now() - state.started >= DURATION) {
    submitExam(true); return true;
  }
  return state.finished;
}
function render() {
  if (expired()) return;
  show('exam');
  const position = state.index, i = questionId(position), q = QUESTIONS[i], n = Object.keys(state.answers).length;
  el('subject').textContent = q.subject + ' • หน้า ' + q.page + ' ของ PDF';
  el('count').textContent = 'ข้อ ' + (position + 1) + ' / ' + state.order.length;
  el('answered').textContent = 'ตอบแล้ว ' + n + ' ข้อ';
  el('bar').style.width = (n / state.order.length * 100) + '%';
  el('question').textContent = q.question;
  el('options').replaceChildren();
  state.optionOrders[i].forEach((j, displayIndex) => {
    const b = document.createElement('button'), k = document.createElement('b'), t = document.createElement('span');
    b.className = 'option' + (state.answers[i] === j ? ' selected' : '');
    b.setAttribute('aria-pressed', String(state.answers[i] === j));
    k.textContent = optionLabel(q, j, displayIndex); t.textContent = q.options[j]; b.append(k, t);
    b.onclick = () => { if (expired()) return; state.answers[i] = j; save(); render(); };
    el('options').append(b);
  });
  el('numbers').replaceChildren();
  state.order.forEach((_, j) => {
    const b = document.createElement('button');
    b.className = 'num' + (state.answers[questionId(j)] !== undefined ? ' answered' : '') + (j === position ? ' current' : '');
    b.textContent = j + 1;
    b.setAttribute('aria-label', 'ข้อ ' + (j + 1) + (state.answers[questionId(j)] !== undefined ? ' ตอบแล้ว' : ' ยังไม่ตอบ'));
    if (j === position) b.setAttribute('aria-current', 'step');
    b.onclick = () => { if (expired()) return; state.index = j; save(); render(); window.scrollTo(0, 0); };
    el('numbers').append(b);
  });
  el('remaining').textContent = 'ยังไม่ตอบ ' + (state.order.length - n) + ' ข้อ';
}
function move(d) { if (expired()) return; state.index = Math.min(state.order.length - 1, Math.max(0, state.index + d)); save(); render(); window.scrollTo(0, 0); }
function clearAnswer() { if (expired()) return; delete state.answers[questionId(state.index)]; save(); render(); }
function submitExam(auto) {
  if (state.finished) return;
  if (!auto && !confirm('ยืนยันส่งข้อสอบ? เมื่อส่งแล้วจะเปลี่ยนคำตอบไม่ได้')) return;
  state.finished = true;
  state.ended = auto ? Math.min(Date.now(), state.started + DURATION) : Date.now();
  clearTimeout(timerId); save(); showResult();
}
function showResult() {
  show('result'); el('timer').textContent = 'ส่งข้อสอบแล้ว';
  const n = Object.keys(state.answers).length;
  el('totalAnswered').textContent = n + ' / ' + state.order.length;
  el('totalBlank').textContent = (state.order.length - n) + ' ข้อ';
  const used = Math.max(0, Math.min(DURATION, (state.ended || Date.now()) - state.started));
  el('usedTime').textContent = Math.floor(used / 60000) + ' นาที';
  const validAnswer = q => Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;
  const verified = state.order.filter(i => validAnswer(QUESTIONS[i])).length;
  const correct = state.order.filter(i => validAnswer(QUESTIONS[i]) && state.answers[i] === QUESTIONS[i].answer).length;
  const gradedAnswered = state.order.filter(i => validAnswer(QUESTIONS[i]) && state.answers[i] !== undefined).length;
  const standard = isStandardExam(state.order);
  el('scoreCard').classList.toggle('hidden', verified === 0);
  el('score').textContent = standard ? (correct * 2) + ' / ' + (verified * 2) + ' คะแนน' : correct + ' / ' + verified + ' ข้อ';
  el('scoreDetail').textContent = 'ตอบผิด ' + (gradedAnswered - correct) + ' ข้อ · ไม่ตอบในข้อที่มีเฉลย ' + (verified - gradedAnswered) + ' ข้อ';
  el('gradingNotice').textContent = verified ? 'ตอบถูก ' + correct + ' จาก ' + verified + ' ข้อที่มีเฉลย (จากทั้งหมด ' + state.order.length + ' ข้อ) ข้อที่ยังไม่มีเฉลยไม่รวมในการคิดคะแนน' : 'ยังไม่มีเฉลยสำหรับคิดคะแนน';
  const subjects = new Map(EXAM_SUBJECTS.map(({ name }) => [name, { total: 0, correct: 0, wrong: 0, blank: 0, pending: 0 }]));
  state.order.forEach(i => {
    const q = QUESTIONS[i];
    const summary = subjects.get(q.subject) || { total: 0, correct: 0, wrong: 0, blank: 0, pending: 0 };
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) summary.pending++;
    else {
      summary.total++;
      if (state.answers[i] === undefined) summary.blank++;
      else if (state.answers[i] === q.answer) summary.correct++;
      else summary.wrong++;
    }
    subjects.set(q.subject, summary);
  });
  el('passSummary').replaceChildren();
  if (standard) {
    const part1 = subjects.get(EXAM_SUBJECTS[0].name);
    const part2 = EXAM_SUBJECTS.slice(1).map(s => subjects.get(s.name));
    const professionalCorrect = part2.reduce((total, s) => total + s.correct, 0);
    const enoughKeys = verified === state.order.length;
    const pass1 = part1.correct >= 7, pass2 = professionalCorrect >= 54;
    const status = document.createElement('strong'), p1 = document.createElement('p'), p2 = document.createElement('p');
    status.textContent = !enoughKeys ? 'ยังสรุปผลผ่านไม่ได้ เพราะบางข้อยังไม่มีเฉลย' : pass1 && pass2 ? 'ผ่านทั้งสองส่วน' : 'ยังไม่ผ่านเกณฑ์';
    p1.textContent = 'ส่วนที่ 1 จรรยาบรรณ: ' + (part1.correct * 2) + ' / 20 คะแนน · ต้องได้อย่างน้อย 14 คะแนน';
    p2.textContent = 'ส่วนที่ 2 วิชาชีพและกฎหมาย: ' + (professionalCorrect * 2) + ' / 180 คะแนน · ต้องได้อย่างน้อย 108 คะแนน';
    el('passSummary').append(status, p1, p2);
    el('passSummary').className = 'pass-summary ' + (!enoughKeys ? '' : pass1 && pass2 ? 'pass-summary--pass' : 'pass-summary--fail');
  } else {
    el('passSummary').className = 'pass-summary';
    el('passSummary').textContent = 'ผลสอบรอบเดิม แสดงคะแนนตามจำนวนข้อในรอบที่เริ่มไว้';
  }
  el('subjectScores').replaceChildren();
  subjects.forEach((score, subject) => {
    const card = document.createElement('div'), title = document.createElement('strong');
    const value = document.createElement('div'), detail = document.createElement('div');
    card.className = 'subject-score'; title.textContent = subject; value.className = 'subject-score-value';
    value.textContent = standard ? (score.correct * 2) + ' / ' + (score.total * 2) + ' คะแนน' : score.correct + ' / ' + score.total + ' ข้อ';
    detail.className = 'subject-score-detail';
    detail.textContent = 'ถูก ' + score.correct + ' ข้อ · ผิด ' + score.wrong + ' ข้อ · ไม่ตอบ ' + score.blank + ' ข้อ' + (score.pending ? ' · รอเฉลย ' + score.pending + ' ข้อ' : '');
    card.append(title, value, detail); el('subjectScores').append(card);
  });
  el('reviews').replaceChildren();
  state.order.forEach((i, position) => {
    const q = QUESTIONS[i];
    const a = state.answers[i], hasAnswer = Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;
    const result = a === undefined ? 'blank' : !hasAnswer ? 'pending' : a === q.answer ? 'correct' : 'incorrect';
    const box = document.createElement('article'), head = document.createElement('div'), h = document.createElement('strong');
    const badge = document.createElement('span'), p = document.createElement('p'), options = document.createElement('div');
    const note = document.createElement('p');
    box.className = 'review review--' + result;
    head.className = 'review-head'; h.className = 'review-meta';
    h.textContent = 'ข้อ ' + (position + 1) + ' • ' + q.subject + ' (PDF หน้า ' + q.page + ')';
    badge.className = 'review-badge';
    badge.textContent = { correct: 'ตอบถูก', incorrect: 'ตอบผิด', blank: 'ไม่ได้ตอบ', pending: 'รอตรวจเฉลย' }[result];
    head.append(h, badge); p.className = 'review-question'; p.textContent = q.question;
    options.className = 'review-options';
    state.optionOrders[i].forEach((j, displayIndex) => {
      const row = document.createElement('div'), letter = document.createElement('span'), text = document.createElement('span'), tags = document.createElement('span');
      row.className = 'review-option' + (hasAnswer && j === q.answer ? ' is-answer' : '') + (j === a && hasAnswer && j !== q.answer ? ' is-selected-wrong' : '');
      letter.className = 'review-letter'; letter.textContent = optionLabel(q, j, displayIndex);
      text.className = 'review-option-text'; text.textContent = q.options[j];
      tags.className = 'review-tags';
      if (j === a) { const tag = document.createElement('span'); tag.textContent = 'คำตอบของคุณ'; tags.append(tag); }
      if (hasAnswer && j === q.answer) { const tag = document.createElement('span'); tag.textContent = 'เฉลย'; tags.append(tag); }
      row.append(letter, text, tags); options.append(row);
    });
    box.append(head, p, options);
    if (!hasAnswer || q.explanation) {
      note.className = 'review-note';
      note.textContent = !hasAnswer ? 'เฉลย: รอการตรวจสอบ' : 'คำอธิบาย: ' + q.explanation;
      box.append(note);
    }
    el('reviews').append(box);
  });
}
function downloadResults() {
  const blob = new Blob([JSON.stringify({ answers: state.answers, order: state.order, optionOrders: state.optionOrders, started: state.started, ended: state.ended }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'exam-results.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function resetExam() { if (confirm('ล้างคำตอบเดิมและเริ่มสอบใหม่?')) { try { localStorage.removeItem(KEY); } catch (_) {} location.reload(); } }
if (state.started) { if (state.finished) showResult(); else if (Date.now() - state.started >= DURATION) submitExam(true); else { show('exam'); render(); tick(); } }
