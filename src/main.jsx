import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, CircleX, ClipboardList, Clock3, Download, File, History, House, RotateCcw, Send } from "lucide-react";
import { createRoot } from "react-dom/client";
import { Auth } from "./auth.jsx";
import { reconcile } from "./reconcile.js";
import "../history.js";
import {
  BASE_KEY,
  DURATION,
  newAttempt,
  normalize,
  captureLegacy,
  question,
  label,
  result,
} from "./exam-model.js";
import "./styles.css";
import "./redesign.css";
const history = window.examHistory;
const snapshotRecord = (a) => ({
  id: a.id,
  started: a.started,
  ended: a.ended || null,
  finished: a.finished,
  snapshot: JSON.parse(JSON.stringify(a)),
});
function App() {
  const [user, setUser] = useState(undefined),
    [attempt, setAttempt] = useState(null),
    [page, setPage] = useState("home"),
    [now, setNow] = useState(Date.now()),
    [loading, setLoading] = useState(true),
    [storageWarning, setStorageWarning] = useState(false),
    [syncWarning, setSyncWarning] = useState(""),
    [failed, setFailed] = useState(false),
    [records, setRecords] = useState([]),
    [historyMessage, setHistoryMessage] = useState(""),
    [filter, setFilter] = useState("all");
  const ref = useRef(null),
    historyOrigin = useRef("home"),
    key = useRef(BASE_KEY),
    owner = useRef(""),
    needsReconcile = useRef(false),
    discarding = useRef(false),
    version = useRef(0),
    epoch = useRef(0);
  const setCurrent = (a) => {
    ref.current = a;
    setAttempt(a);
  };
  const onUser = useCallback((u) => {
    if (owner.current !== (u?.id || "")) setLoading(true);
    setUser(u);
  }, []);
  async function saveHistory(a) {
    const saveVersion = ++version.current,
      account = owner.current;
    try {
      await history.saveAttempt(snapshotRecord(a), {
        queueOnly: needsReconcile.current,
      });
      if (
        owner.current === account &&
        ref.current?.id === a.id &&
        version.current === saveVersion
      ) {
        setFailed(false);
        if (!needsReconcile.current) setSyncWarning("");
      }
    } catch (_) {
      if (owner.current !== account || ref.current?.id !== a.id) return;
      setFailed(true);
      if (account) needsReconcile.current = true;
      setSyncWarning(
        account
          ? "บันทึกออนไลน์ไม่สำเร็จ โปรดลองซิงก์อีกครั้งก่อนเปลี่ยนอุปกรณ์"
          : "บันทึกประวัติ Guest ไม่สำเร็จ โปรดตรวจสอบพื้นที่จัดเก็บแล้วลองอีกครั้งก่อนเริ่มสอบใหม่",
      );
    }
  }
  function persist(a) {
    if ((window.examAuth.getUser()?.id || "") !== owner.current) return;
    setCurrent(a);
    try {
      localStorage.setItem(key.current, JSON.stringify(a));
      setStorageWarning(false);
    } catch (_) {
      setStorageWarning(true);
    }
    saveHistory(a);
  }
  function setHomePreference(attemptId) {
    try {
      if (attemptId) sessionStorage.setItem(key.current + "-home", attemptId);
      else sessionStorage.removeItem(key.current + "-home");
    } catch (_) {
      // Navigation still works when session storage is unavailable.
    }
  }
  function showCurrent(a, restoreHome = false) {
    setFilter("all");
    let homeWasSelected = false;
    if (restoreHome && a) {
      try {
        homeWasSelected = sessionStorage.getItem(key.current + "-home") === a.id;
      } catch (_) {}
    } else {
      setHomePreference(null);
    }
    setPage(!a || homeWasSelected ? "home" : a.finished ? "result" : "exam");
  }
  async function reconcileAccount(userId, current, token, onSelected) {
    return reconcile({
      history,
      current,
      isCurrent: () =>
        epoch.current === token &&
        owner.current === userId &&
        window.examAuth.getUser()?.id === userId,
      confirmCloud: () =>
        confirm(
          "พบข้อมูลรอบสอบที่ต่างกันในเครื่องและออนไลน์ ต้องการใช้ข้อมูลออนไลน์หรือไม่? หากเลือกยกเลิกจะส่งข้อมูลในเครื่องขึ้นออนไลน์",
        ),
      saveLocal: (snapshot) =>
        localStorage.setItem(key.current, JSON.stringify(snapshot)),
      normalize,
      onSelected,
    });
  }

  useEffect(() => {
    if (user === undefined) return;
    let cancelled = false;
    const token = ++epoch.current;
    const id = user?.id || "";
    owner.current = id;
    key.current = id ? BASE_KEY + "-" + id : BASE_KEY;
    needsReconcile.current = false;
    version.current++;
    setCurrent(null);
    setRecords([]);
    setLoading(true);
    setFailed(false);
    setSyncWarning("");
    (async () => {
      let a = null;
      try {
        a = normalize(JSON.parse(localStorage.getItem(key.current)));
        if (a && !a.id) {
          a = captureLegacy(a, history.makeId());
          localStorage.setItem(key.current, JSON.stringify(a));
          await history.saveAttempt(snapshotRecord(a), { queueOnly: !!id });
        }
        if (id)
          a = await reconcileAccount(id, a, token, (selected) => {
            a = selected;
          });
      } catch (_) {
        if (cancelled || token !== epoch.current) return;
        if (id) {
          needsReconcile.current = true;
          setSyncWarning(
            "ยังตรวจสอบข้อมูลออนไลน์ไม่ได้ ข้อมูลใหม่จะรอในเครื่องจนกว่าจะซิงก์อีกครั้ง",
          );
        } else setStorageWarning(true);
      }
      if (cancelled || token !== epoch.current) return;
      setCurrent(a);
      showCurrent(a, true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user === undefined]);
  useEffect(() => {
    if (!attempt || attempt.finished) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [attempt?.id, attempt?.finished]);
  useEffect(() => {
    if (
      !loading &&
      !discarding.current &&
      attempt === ref.current &&
      attempt &&
      !attempt.finished &&
      now - attempt.started >= DURATION
    ) {
      const a = {
        ...attempt,
        finished: true,
        ended: attempt.started + DURATION,
      };
      persist(a);
      showCurrent(a);
    }
  }, [now, attempt, loading]);
  const expired = () => {
    const a = ref.current;
    if (a && !a.finished && Date.now() - a.started >= DURATION) {
      const next = { ...a, finished: true, ended: a.started + DURATION };
      persist(next);
      showCurrent(next);
      return true;
    }
    return !a || a.finished;
  };
  function start() {
    try {
      const a = newAttempt(history.makeId());
      setHomePreference(null);
      persist(a);
      setNow(Date.now());
      setPage("exam");
      window.scrollTo(0, 0);
    } catch (e) {
      alert(e.message);
    }
  }
  function restart() {
    if (failed) {
      alert("ยังบันทึกประวัติไม่สำเร็จ โปรดลองบันทึกอีกครั้งก่อนเริ่มสอบใหม่");
      return;
    }
    if (confirm("เริ่มสอบใหม่? ผลสอบรอบเดิมจะอยู่ในประวัติการสอบ")) start();
  }
  async function leaveExam() {
    if (expired()) return;
    if (!confirm("ยกเลิกข้อสอบรอบนี้? คำตอบและประวัติของรอบนี้จะถูกลบ และไม่สามารถนำกลับมาได้")) return;
    if (expired()) return;
    const current = ref.current, account = owner.current, token = epoch.current;
    discarding.current = true;
    setLoading(true);
    try {
      await history.deleteAttempt(current.id);
      if (epoch.current !== token || owner.current !== account) return;
      localStorage.removeItem(key.current);
      setHomePreference(null);
      version.current++;
      setCurrent(null);
      setFailed(false);
      setStorageWarning(false);
      if (!needsReconcile.current) setSyncWarning("");
      setPage("home");
      window.scrollTo(0, 0);
    } catch (_) {
      if (epoch.current === token && owner.current === account) {
        alert("ยกเลิกข้อสอบไม่สำเร็จ โปรดตรวจสอบการเชื่อมต่อหรือพื้นที่จัดเก็บ แล้วลองอีกครั้ง");
      }
    } finally {
      discarding.current = false;
      if (epoch.current === token) setLoading(false);
    }
  }
  function resumeExam() {
    if (expired()) return;
    setHomePreference(null);
    setPage("exam");
    window.scrollTo(0, 0);
  }
  function move(i) {
    if (expired()) return;
    const a = ref.current;
    persist({ ...a, index: Math.max(0, Math.min(a.order.length - 1, i)) });
    window.scrollTo(0, 0);
  }
  function answer(i) {
    if (expired()) return;
    const a = ref.current,
      id = a.order[a.index];
    persist({ ...a, answers: { ...a.answers, [id]: i } });
  }
  function clearAnswer() {
    if (expired()) return;
    const a = ref.current,
      answers = { ...a.answers };
    delete answers[a.order[a.index]];
    persist({ ...a, answers });
  }
  function submit() {
    if (expired()) return;
    const a = ref.current,
      blank = a.order.length - Object.keys(a.answers).length;
    if (
      !confirm(
        "ยังไม่ตอบ " +
          blank +
          " ข้อ ยืนยันส่งข้อสอบ? เมื่อส่งแล้วจะเปลี่ยนคำตอบไม่ได้",
      )
    )
      return;
    const done = { ...a, finished: true, ended: Date.now() };
    persist(done);
    showCurrent(done);
    window.scrollTo(0, 0);
  }
  async function showHistory() {
    const account = owner.current;
    historyOrigin.current = page;
    setPage("history");
    window.scrollTo(0, 0);
    setRecords([]);
    setHistoryMessage("กำลังโหลดประวัติ…");
    try {
      const data = await history.listAttempts();
      if (owner.current !== account) return;
      setRecords(data);
      setHistoryMessage(
        data.offline
          ? "ออฟไลน์: แสดงเฉพาะรอบที่รอซิงก์ในเครื่องนี้"
          : data.length
            ? ""
            : "ยังไม่มีประวัติการสอบ",
      );
    } catch (_) {
      if (owner.current !== account) return;
      setHistoryMessage(
        "โหลดประวัติไม่สำเร็จ โปรดตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง",
      );
    }
  }
  function openAttempt(record) {
    if (
      ref.current &&
      !ref.current.finished &&
      ref.current.id !== record.id &&
      !confirm("คุณมีข้อสอบที่ยังทำไม่เสร็จ ต้องการเปิดรอบที่เลือกหรือไม่?")
    )
      return;
    try {
      localStorage.setItem(key.current, JSON.stringify(record.snapshot));
      const a = normalize(record.snapshot);
      if (!a) throw Error();
      setCurrent(a);
      showCurrent(a);
      window.scrollTo(0, 0);
    } catch (_) {
      setHistoryMessage("เปิดผลสอบไม่สำเร็จ โปรดตรวจสอบพื้นที่จัดเก็บ");
    }
  }
  async function copyGuest() {
    if (!confirm("คัดลอกประวัติ Guest จากเบราว์เซอร์นี้ไปยังบัญชีของคุณ?"))
      return;
    try {
      const count = await history.copyGuestAttempts();
      await showHistory();
      setHistoryMessage("คัดลอกประวัติ Guest แล้ว " + count + " รอบ");
    } catch (_) {
      setHistoryMessage("คัดลอกไม่สำเร็จ ประวัติ Guest ยังคงอยู่ในเครื่อง");
    }
  }
  async function retry() {
    const token = epoch.current;
    setLoading(true);
    try {
      const id = owner.current;
      let a = ref.current;
      if (id) {
        a = await reconcileAccount(id, a, token, (selected) => {
          setCurrent(selected);
          showCurrent(selected);
        });
        if (owner.current !== id || epoch.current !== token) return;
        needsReconcile.current = false;
        setCurrent(a);
        showCurrent(a);
      }
      if (a) await saveHistory(a);
      else setSyncWarning("");
    } catch (_) {
      if (token === epoch.current)
        setSyncWarning("ซิงก์ไม่สำเร็จ โปรดลองอีกครั้ง");
    } finally {
      if (token === epoch.current) setLoading(false);
    }
  }
  const remain =
    attempt && !attempt.finished
      ? Math.max(0, DURATION - (now - attempt.started))
      : DURATION;
  const sec = Math.ceil(remain / 1000);
  const timer = attempt?.finished
    ? "ส่งข้อสอบแล้ว"
    : [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60]
        .map((n) => String(n).padStart(2, "0"))
        .join(":");
  return (
    <div className="wrap app-shell">
      <header className="top app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">L<span>B</span></span>
          <div className="brand-copy"><div className="brand">LIFE BROKER EXAM</div>
          <div className="muted small">ห้องฝึกสอบนายหน้าประกันชีวิต</div></div>
        </div>
        {page === "exam" && attempt && !attempt.finished && <div className="header-timer"><span>เวลาที่เหลือ</span><div className="pill" aria-label={"เวลาสอบ " + timer}><Clock3 size={17} aria-hidden="true" />{timer}</div></div>}
      </header>
      <Auth onUser={onUser} showAccountControls={!loading && page === "home" && (!attempt || attempt.finished)} />
      {syncWarning && (
        <div className="notice storage-warning" role="alert">
          {syncWarning}{" "}
          <button className="secondary" onClick={retry}>
            ลองซิงก์อีกครั้ง
          </button>
        </div>
      )}
      {storageWarning && (
        <div className="notice storage-warning" role="alert">
          ไม่สามารถบันทึกข้อมูลในเบราว์เซอร์ได้ หากปิดหรือรีเฟรชหน้านี้
          คำตอบและผลสอบอาจสูญหาย
        </div>
      )}
      {loading ? (
        <p role="status">กำลังตรวจสอบข้อมูล…</p>
      ) : (
        <>
          {page === "home" && (
            <main className="home-page">
              <div className="home-hero">
                <section className="home-intro">
                  <h1>เตรียมตัวให้พร้อม<br />ก่อนวันสอบจริง</h1>
                  <div className="home-actions">
                    <button className="primary" onClick={attempt && !attempt.finished ? resumeExam : attempt ? restart : start}>{attempt && !attempt.finished ? "ทำข้อสอบต่อ" : "เริ่มทำข้อสอบ"} <ArrowRight size={18} aria-hidden="true" /></button>
                    <button className="secondary" onClick={showHistory}><History size={18} aria-hidden="true" />ดูประวัติการสอบ</button>
                  </div>
                  <p className="home-save-note muted small">{attempt && !attempt.finished ? `เวลาสอบยังนับต่อ เหลือ ${timer} ชั่วโมง` : "บันทึกคำตอบในเบราว์เซอร์เครื่องนี้ เพื่อกลับมาทำต่อก่อนหมดเวลา"}</p>
                </section>
                <aside className="home-side" aria-label="รายละเอียดข้อสอบจำลอง">
                  <div className="overview-heading"><div><div className="subject">ภาพรวมการสอบ</div><h2>ข้อสอบจำลอง</h2></div><span>100 ข้อ</span></div>
                  <div className="stats">
                    <div className="stat">จำนวน<strong>100 <small>ข้อ</small></strong></div>
                    <div className="stat">เวลาทำ<strong>150 <small>นาที</small></strong></div>
                    <div className="stat">ทั้งหมด<strong>4 <small>หมวด</small></strong></div>
                  </div>
                  <div className="overview-subjects">
                    <div className="overview-row"><span>จรรยาบรรณและศีลธรรม</span><strong>10 ข้อ</strong></div>
                    <div className="overview-row"><span>ความรู้ประกันชีวิต</span><strong>50 ข้อ</strong></div>
                    <div className="overview-row"><span>กฎหมายแพ่งและพาณิชย์</span><strong>20 ข้อ</strong></div>
                    <div className="overview-row"><span>พ.ร.บ. ประกันชีวิต</span><strong>20 ข้อ</strong></div>
                  </div>
                </aside>
              </div>
              <StudyDocument />
              <div className="notice">ข้อสอบและเฉลยอ้างอิงเอกสารปี 2567 บางข้อมีความกำกวมหรืออนุมานจากเนื้อหาในเอกสาร เกณฑ์จำลอง: จรรยาบรรณอย่างน้อย 14/20 และวิชาชีพกับกฎหมายรวมกันอย่างน้อย 108/180 คะแนน โปรดตรวจสอบกฎหมายและเกณฑ์สอบปัจจุบันกับ คปภ.</div>
            </main>
          )}
          {page === "exam" && attempt && (
            <Exam
              a={attempt}
              onAnswer={answer}
              onMove={move}
              onClear={clearAnswer}
              onSubmit={submit}
              onExit={leaveExam}
            />
          )}
          {page === "result" && attempt && (
            <Result
              a={attempt}
              onRestart={restart}
              onHistory={showHistory}
              onHome={() => { setHomePreference(attempt.id); setPage("home"); window.scrollTo(0, 0); }}
              filter={filter}
              setFilter={setFilter}
            />
          )}
          {page === "history" && (
            <main className="panel history-page">
              <div className="history-header"><h1>ประวัติการสอบ</h1></div>
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() => historyOrigin.current === "home" ? setPage("home") : showCurrent(ref.current)}
                >
                  กลับ
                </button>
                {user && (
                  <button className="secondary" onClick={copyGuest}>
                    คัดลอกประวัติ Guest เข้าบัญชี
                  </button>
                )}
              </div>
              <p role="status">{historyMessage}</p>
              <div className="subject-score-grid history-list">
                {records.map((r) => (
                  <div className="subject-score history-card" key={r.id}>
                    <strong>
                      {new Date(r.started).toLocaleString("th-TH")}
                    </strong>
                    <p>
                      {r.finished
                        ? "ทำเสร็จแล้ว · ตอบถูก " +
                          (r.snapshot.order || []).filter(
                            (i) =>
                              r.snapshot.bank?.[i] &&
                              r.snapshot.answers?.[i] ===
                                r.snapshot.bank[i].answer &&
                              Number.isInteger(r.snapshot.bank[i].answer),
                          ).length +
                          " ข้อ"
                        : "ยังทำไม่เสร็จ"}
                    </p>
                    <button
                      className="secondary"
                      onClick={() => openAttempt(r)}
                    >
                      {r.finished ? "ดูผลสอบ" : "ทำข้อสอบต่อ"}
                    </button>
                  </div>
                ))}
              </div>
            </main>
          )}
        </>
      )}
    </div>
  );
}
function StudyDocument() {
  return <section className="study-document" aria-label="เอกสารประกอบการติวสอบ">
    <div className="document-copy"><span className="document-type" aria-hidden="true"><File size={29} strokeWidth={1.6} /><b>PDF</b></span><div><strong>เอกสารประกอบการติวสอบ</strong><span>ฉบับปี 2567 · PDF ประมาณ 9 MB</span></div></div>
    <a className="secondary" href={`${import.meta.env.BASE_URL}life-broker-study-2567.pdf`} download="เอกสารประกอบการบรรยายติวสอบนายหน้าประกันชีวิต_2567.pdf"><Download size={18} aria-hidden="true" />ดาวน์โหลดเอกสาร</a>
  </section>;
}
function Exam({ a, onAnswer, onMove, onClear, onSubmit, onExit }) {
  const id = a.order[a.index],
    q = question(a, id),
    n = Object.keys(a.answers).length;
  return (
    <main className="exam-page">
      <div className="exam-exit"><button className="danger" onClick={onExit}><CircleX size={17} aria-hidden="true" /> ยกเลิกข้อสอบ</button></div>
      <div className="grid">
      <section className="panel question-panel">
        <div className="subject exam-kicker">
          {q.subject} • หน้า {q.page} ของ PDF
        </div>
        <div className="top" style={{ marginTop: 10 }}>
          <strong>
            ข้อ {a.index + 1} / {a.order.length}
          </strong>
          <span className="exam-progress-meta"><span className="muted small">ตอบแล้ว {n} ข้อ</span><a className="answer-sheet-link" href="#answer-sheet">ดูกระดาษคำตอบ <ArrowDown size={14} aria-hidden="true" /></a></span>
        </div>
        <div className="progress">
          <div style={{ width: (n / a.order.length) * 100 + "%" }} />
        </div>
        <div className="question-label">คำถาม</div>
        <div className="question">{q.question}</div>
        <div>
          {a.optionOrders[id].map((j, pos) => (
            <button
              key={j}
              className={"option" + (a.answers[id] === j ? " selected" : "")}
              aria-pressed={a.answers[id] === j}
              onClick={() => onAnswer(j)}
            >
              <b>{label(q, j, pos)}</b>
              <span>{q.options[j]}</span>
            </button>
          ))}
        </div>
        <div className="actions exam-navigation">
          <button className="secondary" onClick={() => onMove(a.index - 1)}>
            <ArrowLeft size={18} aria-hidden="true" /> ก่อนหน้า
          </button>
          <button className="secondary" onClick={() => onMove(a.index + 1)}>
            ถัดไป <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="actions exam-tools">
          <button className="secondary" onClick={onClear}>
            <RotateCcw size={17} aria-hidden="true" /> ล้างคำตอบข้อนี้
          </button>
          <button className="danger" onClick={onSubmit}>
            <Send size={17} aria-hidden="true" /> ส่งข้อสอบ
          </button>
        </div>
      </section>
      <aside id="answer-sheet" className="panel exam-sidebar" tabIndex={-1}>
        <div className="sidebar-heading"><h3><ClipboardList size={19} aria-hidden="true" /> กระดาษคำตอบ</h3><span>{n} / {a.order.length}</span></div>
        <p className="muted small sidebar-legend">
          แตะหมายเลขเพื่อไปยังข้อที่ต้องการ · สีเข้มคือข้อที่ตอบแล้ว
        </p>
        <div className="numbers">
          {a.order.map((i, j) => (
            <button
              key={i}
              className={
                "num" +
                (a.answers[i] !== undefined ? " answered" : "") +
                (j === a.index ? " current" : "")
              }
              aria-label={
                "ข้อ " +
                (j + 1) +
                (a.answers[i] !== undefined ? " ตอบแล้ว" : " ยังไม่ตอบ")
              }
              aria-current={j === a.index ? "step" : undefined}
              onClick={() => onMove(j)}
            >
              {j + 1}
            </button>
          ))}
        </div>
        <p className="muted small sidebar-unanswered">ยังไม่ตอบ {a.order.length - n} ข้อ</p>
      </aside>
      </div>
    </main>
  );
}
function Result({ a, onRestart, onHistory, onHome, filter, setFilter }) {
  const r = result(a),
    n = Object.keys(a.answers).length,
    used = Math.max(0, Math.min(DURATION, (a.ended || Date.now()) - a.started));
  const reviews = a.order
    .map((id, pos) => {
      const q = question(a, id),
        answer = a.answers[id],
        valid =
          Number.isInteger(q.answer) &&
          q.answer >= 0 &&
          q.answer < q.options.length,
        status =
          answer === undefined
            ? "blank"
            : !valid
              ? "pending"
              : answer === q.answer
                ? "correct"
                : "incorrect";
      return { id, pos, q, answer, valid, status };
    })
    .filter((v) => filter === "all" || v.status === filter);
  return (
    <main className="panel result-page">
      <div className="result-header"><div><div className="subject">ผลการทำข้อสอบ</div>
      <h1>ส่งข้อสอบเรียบร้อย</h1></div><div className="result-actions">
      <button className="primary" onClick={onRestart}>
        <RotateCcw size={18} aria-hidden="true" /> เริ่มสอบใหม่
      </button>{" "}
      <button className="secondary" onClick={onHistory}>
        <History size={18} aria-hidden="true" /> ประวัติการสอบ
      </button>
      <button className="secondary" onClick={onHome}>
        <House size={18} aria-hidden="true" /> กลับหน้าแรก
      </button></div></div>
      {r.verified > 0 && (
        <div className="score-card" aria-label="คะแนนสอบ">
          <div>
            <div className="score-label">คะแนนจากข้อที่มีเฉลย</div>
            <div className="score-value">
              {r.standard
                ? `${r.correct * 2} / ${r.verified * 2} คะแนน`
                : `${r.correct} / ${r.verified} ข้อ`}
            </div>
          </div>
          <div className="score-detail">
            ตอบผิด {r.gradedAnswered - r.correct} ข้อ · ไม่ตอบในข้อที่มีเฉลย{" "}
            {r.verified - r.gradedAnswered} ข้อ
          </div>
        </div>
      )}
      <div className="stats">
        <div className="stat">
          ตอบแล้ว
          <strong>
            {n} / {a.order.length}
          </strong>
        </div>
        <div className="stat">
          ยังไม่ตอบ<strong>{a.order.length - n} ข้อ</strong>
        </div>
        <div className="stat">
          เวลาใช้ไป<strong>{Math.floor(used / 60000)} นาที</strong>
        </div>
      </div>
      <h2>ผลการสอบตามเกณฑ์จำลอง</h2>
      {r.standard ? (
        <div
          className={
            "pass-summary " +
            (r.pass === null
              ? ""
              : r.pass
                ? "pass-summary--pass"
                : "pass-summary--fail")
          }
        >
          <strong>
            {r.pass === null
              ? "ยังสรุปผลผ่านไม่ได้ เพราะบางข้อยังไม่มีเฉลย"
              : r.pass
                ? "ผ่านทั้งสองส่วน"
                : "ยังไม่ผ่านเกณฑ์"}
          </strong>
          <p>
            ส่วนที่ 1 จรรยาบรรณ: {r.p1 * 2} / {r.rules.subjects[0].count * 2}{" "}
            คะแนน · ต้องได้อย่างน้อย {r.rules.ethicsCorrect * 2} คะแนน
          </p>
          <p>
            ส่วนที่ 2 วิชาชีพและกฎหมาย: {r.p2 * 2} /{" "}
            {r.rules.subjects.slice(1).reduce((n, s) => n + s.count, 0) * 2}{" "}
            คะแนน · ต้องได้อย่างน้อย {r.rules.professionalCorrect * 2} คะแนน
          </p>
        </div>
      ) : (
        <div className="pass-summary">
          ผลสอบรอบเดิม แสดงคะแนนตามจำนวนข้อในรอบที่เริ่มไว้
        </div>
      )}
      <h2>คะแนนแยกตามหมวด</h2>
      <div className="subject-score-grid">
        {[...r.subjects].map(([name, s]) => (
          <div className="subject-score" key={name}>
            <strong>{name}</strong>
            <div className="subject-score-value">
              {r.standard
                ? `${s.correct * 2} / ${s.total * 2} คะแนน`
                : `${s.correct} / ${s.total} ข้อ`}
            </div>
            <div className="subject-score-detail">
              ถูก {s.correct} ข้อ · ผิด {s.wrong} ข้อ · ไม่ตอบ {s.blank} ข้อ
              {s.pending ? ` · รอเฉลย ${s.pending} ข้อ` : ""}
            </div>
          </div>
        ))}
      </div>
      <h2>ทบทวนคำตอบ</h2>
      <div className="review-filters" role="group" aria-label="กรองคำตอบ">
        {[
          ["all", "ทั้งหมด"],
          ["incorrect", "ตอบผิด"],
          ["blank", "ไม่ได้ตอบ"],
        ].map(([id, title]) => (
          <button
            key={id}
            className="secondary"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {title}
          </button>
        ))}
      </div>
      {!reviews.length && (
        <p className="muted" role="status">
          ไม่มีข้อสอบในรายการนี้
        </p>
      )}
      {reviews.map(({ id, pos, q, answer, valid, status }) => (
        <article className={"review review--" + status} key={id}>
          <div className="review-head">
            <strong className="review-meta">
              ข้อ {pos + 1} • {q.subject} (PDF หน้า {q.page})
            </strong>
            <span className="review-badge">
              {
                {
                  correct: "ตอบถูก",
                  incorrect: "ตอบผิด",
                  blank: "ไม่ได้ตอบ",
                  pending: "รอตรวจเฉลย",
                }[status]
              }
            </span>
          </div>
          <p className="review-question">{q.question}</p>
          <div className="review-options">
            {a.optionOrders[id].map((j, index) => (
              <div
                key={j}
                className={
                  "review-option" +
                  (valid && j === q.answer ? " is-answer" : "") +
                  (j === answer && valid && j !== q.answer
                    ? " is-selected-wrong"
                    : "")
                }
              >
                <span className="review-letter">{label(q, j, index)}</span>
                <span className="review-option-text">{q.options[j]}</span>
                <span className="review-tags">
                  {j === answer && <span>คำตอบของคุณ</span>}
                  {valid && j === q.answer && <span>เฉลย</span>}
                </span>
              </div>
            ))}
          </div>
          {(!valid || q.explanation) && (
            <p className="review-note">
              {!valid ? "เฉลย: รอการตรวจสอบ" : "คำอธิบาย: " + q.explanation}
            </p>
          )}
        </article>
      ))}
      <div className="actions">
        <button className="primary" onClick={onRestart}>
          เริ่มสอบใหม่
        </button>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
