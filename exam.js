const BASE_KEY = 'life-broker-exam-v1';
let KEY = BASE_KEY;
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
let historySaveFailed = false;
let syncNeedsReconcile = false;
let historySaveVersion = 0;

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
function isQuestionOrder(value, bank) {
  return Array.isArray(value) && (value.length === 100 || value.length === LEGACY_QUESTION_COUNT) &&
    value.every(x => Number.isInteger(x) && x >= 0 && (bank ? bank[x] && Array.isArray(bank[x].options) : x < QUESTIONS.length)) && new Set(value).size === value.length;
}
function questionAt(i) { return state.bank?.[i] || QUESTIONS[i]; }
function gradingRules() { return state.rules || { subjects: EXAM_SUBJECTS, ethicsCorrect: 7, professionalCorrect: 54 }; }
function isStandardExam(order) {
  return order.length === 100 && gradingRules().subjects.every(subject =>
    order.filter(i => questionAt(i).subject === subject.name).length === subject.count);
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
function loadState() {
state = { started: null, finished: false, answers: {}, index: 0 };
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved && Number.isFinite(saved.started) && saved.started > 0) {
    // Older attempts contain all 200 original questions; new questions are appended.
    const order = isQuestionOrder(saved.order, saved.bank) ? saved.order : identity(Math.min(LEGACY_QUESTION_COUNT, QUESTIONS.length));
    const included = new Set(order);
    const answers = {};
    if (saved.answers && typeof saved.answers === 'object') {
      for (const [key, value] of Object.entries(saved.answers)) {
        const index = Number(key);
        if (Number.isInteger(index) && included.has(index) &&
            Number.isInteger(value) && value >= 0 && value < (saved.bank?.[index] || QUESTIONS[index]).options.length) answers[index] = value;
      }
    }
    state = {
      id: saved.id, bank: saved.bank, rules: saved.rules,
      started: saved.started,
      finished: saved.finished === true,
      ended: Number.isFinite(saved.ended) ? saved.ended : undefined,
      answers,
      index: Number.isInteger(saved.index) ? Math.max(0, Math.min(order.length - 1, saved.index)) : 0,
      order,
      optionOrders: Array.from({ length: Math.max(QUESTIONS.length, ...order.map(i => i + 1)) }, (_, i) => { const q = saved.bank?.[i] || QUESTIONS[i]; return q ? (isPermutation(saved.optionOrders?.[i], q.options.length) ? saved.optionOrders[i] : identity(q.options.length)) : []; })
    };
  }
} catch (_) { /* Storage can be unavailable or contain invalid JSON. */ }
if (state.started && window.examHistory && !state.id) {
  state.id = window.examHistory.makeId();
  state.bank = Object.fromEntries(state.order.map(i => [i, JSON.parse(JSON.stringify(QUESTIONS[i]))]));
  save();
}
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    el('storageWarning').classList.toggle('hidden', true);
  } catch (_) {
    el('storageWarning').classList.toggle('hidden', false);
  }
  if (window.examHistory && state.id) saveHistory();
}
function saveHistory() {
  const snapshot = JSON.parse(JSON.stringify(state)), version = ++historySaveVersion, owner = window.examAuth?.getUser()?.id || '';
  return window.examHistory.saveAttempt({ id: snapshot.id, started: snapshot.started, ended: snapshot.ended || null, finished: snapshot.finished, snapshot }, { queueOnly: syncNeedsReconcile })
    .then(() => { if (version === historySaveVersion) { historySaveFailed = false; if (!syncNeedsReconcile) el('syncWarning').classList.toggle('hidden', true); } })
    .catch(() => {
      if ((window.examAuth?.getUser()?.id || '') !== owner || state.id !== snapshot.id) return;
      historySaveFailed = true;
      if (window.examAuth?.getUser()) syncNeedsReconcile = true;
      el('syncWarningText').textContent = window.examAuth?.getUser() ? 'บันทึกประวัติออนไลน์ไม่สำเร็จ โปรดลองซิงก์อีกครั้งก่อนเปลี่ยนอุปกรณ์' : 'บันทึกประวัติ Guest ไม่สำเร็จ โปรดตรวจสอบพื้นที่จัดเก็บแล้วลองอีกครั้งก่อนเริ่มสอบใหม่';
      el('syncWarning').classList.toggle('hidden', false);
    });
}
function show(id) { ['home', 'exam', 'result', 'history'].forEach(x => el(x).classList.toggle('hidden', x !== id)); }
function start() {
  if (!state.started || state.finished) {
    let order;
    try { order = newExamOrder(); }
    catch (error) { alert(error.message); return; }
    state = { id: window.examHistory ? window.examHistory.makeId() : undefined, started: Date.now(), finished: false, answers: {}, index: 0,
      bank: Object.fromEntries(order.map(i => [i, JSON.parse(JSON.stringify(QUESTIONS[i]))])),
      rules: { subjects: EXAM_SUBJECTS.map(s => ({ ...s })), ethicsCorrect: 7, professionalCorrect: 54 }, order,
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
  const position = state.index, i = questionId(position), q = questionAt(i), n = Object.keys(state.answers).length;
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
  const blank = state.order.length - Object.keys(state.answers).length;
  if (!auto && !confirm('ยังไม่ตอบ ' + blank + ' ข้อ ยืนยันส่งข้อสอบ? เมื่อส่งแล้วจะเปลี่ยนคำตอบไม่ได้')) return;
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
  const verified = state.order.filter(i => validAnswer(questionAt(i))).length;
  const correct = state.order.filter(i => validAnswer(questionAt(i)) && state.answers[i] === questionAt(i).answer).length;
  const gradedAnswered = state.order.filter(i => validAnswer(questionAt(i)) && state.answers[i] !== undefined).length;
  const standard = isStandardExam(state.order);
  el('scoreCard').classList.toggle('hidden', verified === 0);
  el('score').textContent = standard ? (correct * 2) + ' / ' + (verified * 2) + ' คะแนน' : correct + ' / ' + verified + ' ข้อ';
  el('scoreDetail').textContent = 'ตอบผิด ' + (gradedAnswered - correct) + ' ข้อ · ไม่ตอบในข้อที่มีเฉลย ' + (verified - gradedAnswered) + ' ข้อ';
  el('gradingNotice').textContent = verified ? 'ตอบถูก ' + correct + ' จาก ' + verified + ' ข้อที่มีเฉลย (จากทั้งหมด ' + state.order.length + ' ข้อ) ข้อที่ยังไม่มีเฉลยไม่รวมในการคิดคะแนน' : 'ยังไม่มีเฉลยสำหรับคิดคะแนน';
  const rules = gradingRules();
  const subjects = new Map(rules.subjects.map(({ name }) => [name, { total: 0, correct: 0, wrong: 0, blank: 0, pending: 0 }]));
  state.order.forEach(i => {
    const q = questionAt(i);
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
    const part1 = subjects.get(rules.subjects[0].name);
    const part2 = rules.subjects.slice(1).map(s => subjects.get(s.name));
    const professionalCorrect = part2.reduce((total, s) => total + s.correct, 0);
    const enoughKeys = verified === state.order.length;
    const pass1 = part1.correct >= rules.ethicsCorrect, pass2 = professionalCorrect >= rules.professionalCorrect;
    const status = document.createElement('strong'), p1 = document.createElement('p'), p2 = document.createElement('p');
    status.textContent = !enoughKeys ? 'ยังสรุปผลผ่านไม่ได้ เพราะบางข้อยังไม่มีเฉลย' : pass1 && pass2 ? 'ผ่านทั้งสองส่วน' : 'ยังไม่ผ่านเกณฑ์';
    p1.textContent = 'ส่วนที่ 1 จรรยาบรรณ: ' + (part1.correct * 2) + ' / ' + (rules.subjects[0].count * 2) + ' คะแนน · ต้องได้อย่างน้อย ' + (rules.ethicsCorrect * 2) + ' คะแนน';
    p2.textContent = 'ส่วนที่ 2 วิชาชีพและกฎหมาย: ' + (professionalCorrect * 2) + ' / ' + (rules.subjects.slice(1).reduce((sum, subject) => sum + subject.count, 0) * 2) + ' คะแนน · ต้องได้อย่างน้อย ' + (rules.professionalCorrect * 2) + ' คะแนน';
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
    const q = questionAt(i);
    const a = state.answers[i], hasAnswer = Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;
    const result = a === undefined ? 'blank' : !hasAnswer ? 'pending' : a === q.answer ? 'correct' : 'incorrect';
    const box = document.createElement('article'), head = document.createElement('div'), h = document.createElement('strong');
    const badge = document.createElement('span'), p = document.createElement('p'), options = document.createElement('div');
    const note = document.createElement('p');
    box.className = 'review review--' + result;
    box.dataset.result = result;
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
  filterReviews('all');
}
function filterReviews(filter) {
  let visible = 0;
  for (const box of el('reviews').children) {
    const show = filter === 'all' || box.dataset.result === filter;
    box.classList.toggle('hidden', !show);
    if (show) visible++;
  }
  ['all', 'incorrect', 'blank'].forEach(name => el('filter-' + name).setAttribute('aria-pressed', String(name === filter)));
  el('reviewEmpty').classList.toggle('hidden', visible !== 0);
}
function resetExam() {
  if (historySaveFailed) { alert('ยังบันทึกประวัติไม่สำเร็จ โปรดลองบันทึกอีกครั้งก่อนเริ่มสอบใหม่'); return; }
  if (!confirm('เริ่มสอบใหม่? ผลสอบรอบเดิมจะอยู่ในประวัติการสอบ')) return;
  start();
  window.scrollTo(0, 0);
}
function displayCurrent() {
  clearTimeout(timerId);
  if (!state.started) { show('home'); el('timer').textContent = '02:30:00'; }
  else if (state.finished) showResult();
  else if (Date.now() - state.started >= DURATION) submitExam(true);
  else { show('exam'); render(); tick(); }
}
async function showHistory() {
  show('history'); window.scrollTo(0, 0);
  const list = el('historyList'); list.replaceChildren();
  el('historyMessage').textContent = 'กำลังโหลดประวัติ…';
  el('copyGuest').classList.toggle('hidden', !window.examAuth?.getUser());
  try {
    const attempts = await window.examHistory.listAttempts();
    el('historyMessage').textContent = attempts.offline ? 'ออฟไลน์: แสดงเฉพาะรอบที่รอซิงก์ในเครื่องนี้' : attempts.length ? '' : 'ยังไม่มีประวัติการสอบ';
    attempts.forEach(attempt => {
      const card = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('p'), button = document.createElement('button');
      card.className = 'subject-score';
      title.textContent = new Date(attempt.started).toLocaleString('th-TH');
      const bank = attempt.snapshot.bank || {};
      const order = attempt.snapshot.order || [];
      const correct = order.filter(i => bank[i] && attempt.snapshot.answers?.[i] === bank[i].answer && Number.isInteger(bank[i].answer)).length;
      detail.textContent = attempt.finished ? 'ทำเสร็จแล้ว · ตอบถูก ' + correct + ' ข้อ' : 'ยังทำไม่เสร็จ';
      button.className = 'secondary'; button.textContent = attempt.finished ? 'ดูผลสอบ' : 'ทำข้อสอบต่อ';
      button.onclick = () => openAttempt(attempt);
      card.append(title, detail, button); list.append(card);
    });
  } catch (_) { el('historyMessage').textContent = 'โหลดประวัติไม่สำเร็จ โปรดตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง'; }
}
function openAttempt(attempt) {
  if (state.started && !state.finished && state.id !== attempt.id && !confirm('คุณมีข้อสอบที่ยังทำไม่เสร็จ ต้องการเปิดรอบที่เลือกหรือไม่?')) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(attempt.snapshot));
    loadState(); displayCurrent(); window.scrollTo(0, 0);
  } catch (_) { el('historyMessage').textContent = 'เปิดผลสอบไม่สำเร็จ โปรดตรวจสอบพื้นที่จัดเก็บ'; }
}
async function copyGuestHistory() {
  if (!confirm('คัดลอกประวัติ Guest จากเบราว์เซอร์นี้ไปยังบัญชีของคุณ?')) return;
  try { const count = await window.examHistory.copyGuestAttempts(); await showHistory(); el('historyMessage').textContent = 'คัดลอกประวัติ Guest แล้ว ' + count + ' รอบ'; }
  catch (_) { el('historyMessage').textContent = 'คัดลอกไม่สำเร็จ ประวัติ Guest ยังคงอยู่ในเครื่อง'; }
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
async function reconcileAndSync(userId) {
  const pending = window.examHistory.pendingAttempts();
  const candidates = [...pending];
  if (state.id && !pending.some(item => item.id === state.id)) candidates.push({ id: state.id, snapshot: JSON.parse(JSON.stringify(state)) });
  for (const item of candidates) {
    const remote = await window.examHistory.getAttempt(item.id, { cloudOnly: true });
    if (window.examAuth.getUser()?.id !== userId) throw Error('account changed');
    if (remote && JSON.stringify(canonical(remote.snapshot)) !== JSON.stringify(canonical(item.snapshot))) {
      const useCloud = confirm('พบข้อมูลรอบสอบที่ต่างกันในเครื่องและออนไลน์ ต้องการใช้ข้อมูลออนไลน์หรือไม่? หากเลือกยกเลิกจะส่งข้อมูลในเครื่องขึ้นออนไลน์');
      if (useCloud) {
        if (state.id === item.id) { localStorage.setItem(KEY, JSON.stringify(remote.snapshot)); loadState(); }
        window.examHistory.discardPending(item.id);
      } else if (!pending.some(record => record.id === item.id)) {
        const snapshot = item.snapshot;
        await window.examHistory.saveAttempt({ id: item.id, started: snapshot.started, ended: snapshot.ended || null, finished: snapshot.finished, snapshot }, { queueOnly: true });
      }
    }
  }
  await window.examHistory.syncPending();
}
async function retrySync() {
  document.body.classList.add('auth-loading');
  try {
    const userId = window.examAuth?.getUser()?.id;
    if (userId) { await reconcileAndSync(userId); syncNeedsReconcile = false; displayCurrent(); }
    if (state.id) await saveHistory();
    else el('syncWarning').classList.toggle('hidden', true);
  } catch (_) { el('syncWarning').classList.toggle('hidden', false); }
  finally { document.body.classList.remove('auth-loading'); }
}
let activeUserId;
async function initializeAccount(user) {
  const id = user?.id || '';
  if (activeUserId === id) return;
  activeUserId = id; historySaveFailed = false; syncNeedsReconcile = false; historySaveVersion++; KEY = id ? BASE_KEY + '-' + id : BASE_KEY;
  document.body.classList.add('auth-loading');
  loadState();
  if (id && window.examHistory) {
    try {
      await reconcileAndSync(id);
      if (activeUserId !== id) return;
      el('syncWarning').classList.toggle('hidden', true);
    } catch (_) { syncNeedsReconcile = true; el('syncWarningText').textContent = 'ยังตรวจสอบข้อมูลออนไลน์ไม่ได้ ข้อมูลใหม่จะรอในเครื่องจนกว่าจะซิงก์อีกครั้ง'; el('syncWarning').classList.toggle('hidden', false); }
  }
  if (activeUserId !== id) return;
  displayCurrent();
  document.body.classList.remove('auth-loading');
}
if (window.examAuth && window.examAuth.isConfigured) {
  document.body.classList.add('auth-loading');
  window.examAuth.subscribe((event, session) => initializeAccount(session?.user));
} else { loadState(); displayCurrent(); }
