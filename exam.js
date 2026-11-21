const KEY = 'life-broker-exam-v1';
const DURATION = 150 * 60 * 1000;
const letters = ['ก', 'ข', 'ค', 'ง'];
const el = id => document.getElementById(id);
let state = { started: null, finished: false, answers: {}, index: 0 };
let timerId;

// Ignore invalid or obsolete saved data rather than letting it break the exam.
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved && Number.isFinite(saved.started) && saved.started > 0) {
    const answers = {};
    if (saved.answers && typeof saved.answers === 'object') {
      for (const [key, value] of Object.entries(saved.answers)) {
        const index = Number(key);
        if (Number.isInteger(index) && index >= 0 && index < QUESTIONS.length &&
            Number.isInteger(value) && value >= 0 && value < QUESTIONS[index].options.length) answers[index] = value;
      }
    }
    state = {
      started: saved.started,
      finished: saved.finished === true,
      ended: Number.isFinite(saved.ended) ? saved.ended : undefined,
      answers,
      index: Number.isInteger(saved.index) ? Math.max(0, Math.min(QUESTIONS.length - 1, saved.index)) : 0
    };
  }
} catch (_) { /* Storage can be unavailable or contain invalid JSON. */ }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* Exam remains usable for this session. */ }
}
function show(id) { ['home', 'exam', 'result'].forEach(x => el(x).classList.toggle('hidden', x !== id)); }
function start() {
  if (!state.started || state.finished) {
    state = { started: Date.now(), finished: false, answers: {}, index: 0 };
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
  const i = state.index, q = QUESTIONS[i], n = Object.keys(state.answers).length;
  el('subject').textContent = q.subject + ' • หน้า ' + q.page + ' ของ PDF';
  el('count').textContent = 'ข้อ ' + (i + 1) + ' / ' + QUESTIONS.length;
  el('answered').textContent = 'ตอบแล้ว ' + n + ' ข้อ';
  el('bar').style.width = (n / QUESTIONS.length * 100) + '%';
  el('question').textContent = q.question;
  el('options').replaceChildren();
  q.options.forEach((option, j) => {
    const b = document.createElement('button'), k = document.createElement('b'), t = document.createElement('span');
    b.className = 'option' + (state.answers[i] === j ? ' selected' : '');
    b.setAttribute('aria-pressed', String(state.answers[i] === j));
    k.textContent = letters[j]; t.textContent = option; b.append(k, t);
    b.onclick = () => { if (expired()) return; state.answers[i] = j; save(); render(); };
    el('options').append(b);
  });
  el('numbers').replaceChildren();
  QUESTIONS.forEach((_, j) => {
    const b = document.createElement('button');
    b.className = 'num' + (state.answers[j] !== undefined ? ' answered' : '') + (j === i ? ' current' : '');
    b.textContent = j + 1;
    b.setAttribute('aria-label', 'ข้อ ' + (j + 1) + (state.answers[j] !== undefined ? ' ตอบแล้ว' : ' ยังไม่ตอบ'));
    if (j === i) b.setAttribute('aria-current', 'step');
    b.onclick = () => { if (expired()) return; state.index = j; save(); render(); window.scrollTo(0, 0); };
    el('numbers').append(b);
  });
  el('remaining').textContent = 'ยังไม่ตอบ ' + (QUESTIONS.length - n) + ' ข้อ';
}
function move(d) { if (expired()) return; state.index = Math.min(QUESTIONS.length - 1, Math.max(0, state.index + d)); save(); render(); window.scrollTo(0, 0); }
function clearAnswer() { if (expired()) return; delete state.answers[state.index]; save(); render(); }
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
  el('totalAnswered').textContent = n + ' / ' + QUESTIONS.length;
  el('totalBlank').textContent = (QUESTIONS.length - n) + ' ข้อ';
  const used = Math.max(0, Math.min(DURATION, (state.ended || Date.now()) - state.started));
  el('usedTime').textContent = Math.floor(used / 60000) + ' นาที';
  const verified = QUESTIONS.filter(q => Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length).length;
  const correct = QUESTIONS.reduce((count, q, i) => count + (Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length && state.answers[i] === q.answer ? 1 : 0), 0);
  const gradedAnswered = QUESTIONS.reduce((count, q, i) => count + (Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length && state.answers[i] !== undefined ? 1 : 0), 0);
  el('scoreCard').classList.toggle('hidden', verified === 0);
  el('score').textContent = correct + ' / ' + verified;
  el('scoreDetail').textContent = 'ตอบผิด ' + (gradedAnswered - correct) + ' ข้อ · ไม่ตอบในข้อที่มีเฉลย ' + (verified - gradedAnswered) + ' ข้อ';
  el('gradingNotice').textContent = verified ? 'ตอบถูก ' + correct + ' จาก ' + verified + ' ข้อที่มีเฉลยในชุดข้อสอบ (จากทั้งหมด ' + QUESTIONS.length + ' ข้อ) ข้อที่ยังไม่มีเฉลยไม่รวมในการคิดคะแนน' : 'ยังไม่มีชุดเฉลยที่ตรวจสอบแล้วจากเอกสาร จึงไม่สามารถคำนวณคะแนนถูกผิดหรืออธิบายข้อที่ผิดอย่างน่าเชื่อถือได้ ระบบแสดงคำตอบที่เลือกและหน้าต้นฉบับเพื่อทบทวน';
  el('reviews').replaceChildren();
  QUESTIONS.forEach((q, i) => {
    const a = state.answers[i], hasAnswer = Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;
    const result = a === undefined ? 'blank' : !hasAnswer ? 'pending' : a === q.answer ? 'correct' : 'incorrect';
    const box = document.createElement('article'), head = document.createElement('div'), h = document.createElement('strong');
    const badge = document.createElement('span'), p = document.createElement('p'), options = document.createElement('div');
    const note = document.createElement('p');
    box.className = 'review review--' + result;
    head.className = 'review-head'; h.className = 'review-meta';
    h.textContent = 'ข้อ ' + (i + 1) + ' • ' + q.subject + ' (PDF หน้า ' + q.page + ')';
    badge.className = 'review-badge';
    badge.textContent = { correct: 'ตอบถูก', incorrect: 'ตอบผิด', blank: 'ไม่ได้ตอบ', pending: 'รอตรวจเฉลย' }[result];
    head.append(h, badge); p.className = 'review-question'; p.textContent = q.question;
    options.className = 'review-options';
    q.options.forEach((option, j) => {
      const row = document.createElement('div'), letter = document.createElement('span'), text = document.createElement('span'), tags = document.createElement('span');
      row.className = 'review-option' + (hasAnswer && j === q.answer ? ' is-answer' : '') + (j === a && hasAnswer && j !== q.answer ? ' is-selected-wrong' : '');
      letter.className = 'review-letter'; letter.textContent = letters[j];
      text.className = 'review-option-text'; text.textContent = option;
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
  const blob = new Blob([JSON.stringify({ answers: state.answers, started: state.started, ended: state.ended }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'exam-results.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function resetExam() { if (confirm('ล้างคำตอบเดิมและเริ่มสอบใหม่?')) { try { localStorage.removeItem(KEY); } catch (_) {} location.reload(); } }
if (state.started) { if (state.finished) showResult(); else if (Date.now() - state.started >= DURATION) submitExam(true); else { show('exam'); render(); tick(); } }
