import React, { useEffect, useRef, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
const config = window.SUPABASE_CONFIG || {};
export const client =
  config.url && config.anonKey
    ? createClient(config.url, config.anonKey, {
        auth: {
          flowType: "pkce",
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;
let currentUser = null;
window.examAuth = {
  client,
  isConfigured: !!client,
  getUser: () => currentUser,
};
export function Auth({ onUser, showAccountControls = true }) {
  const [user, setUser] = useState(null),
    [mode, setMode] = useState("signin"),
    [open, setOpen] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    if (!client) {
      onUser(null);
      return;
    }
    const { data } = client.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      setUser(currentUser);
      if (event === "PASSWORD_RECOVERY") {
        setMode("recovery");
        setOpen(true);
      }
      onUser(currentUser);
    });
    return () => data.subscription.unsubscribe();
  }, [onUser]);
  const redirectTo = location.origin + location.pathname;
  async function perform(fn) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fn();
      if (r?.error) throw r.error;
      return r;
    } catch (_) {
      setMessage(
        "ไม่สามารถดำเนินการได้ โปรดตรวจสอบข้อมูลหรือการเชื่อมต่อแล้วลองอีกครั้ง",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    if (!client) {
      setMessage("ระบบบัญชียังไม่ได้ตั้งค่า สามารถสอบแบบ Guest ได้");
      return;
    }
    const fn =
      mode === "signup"
        ? () =>
            client.auth.signUp({
              email: email.trim(),
              password,
              options: { emailRedirectTo: redirectTo },
            })
        : mode === "forgot"
          ? () =>
              client.auth.resetPasswordForEmail(email.trim(), { redirectTo })
          : mode === "recovery"
            ? () => client.auth.updateUser({ password })
            : () =>
                client.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
    const r = await perform(fn);
    if (!r) return;
    setPassword("");
    if (mode === "signup")
      setMessage("หากสมัครสำเร็จ โปรดตรวจสอบอีเมลเพื่อยืนยันบัญชี");
    else if (mode === "forgot")
      setMessage("หากอีเมลนี้มีบัญชี ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่");
    else if (mode === "recovery") {
      setMode("signin");
      setMessage("เปลี่ยนรหัสผ่านแล้ว");
    } else setOpen(false);
  }
  return (
    <div>
      {showAccountControls && <div className="auth-bar">
        {user && <span className="auth-status">
          {"บัญชี: " + (user.email || "เข้าสู่ระบบแล้ว")}
        </span>}
        {user ? (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => perform(() => client.auth.signOut())}
          >
            <LogOut size={16} aria-hidden="true" /> ออกจากระบบ
          </button>
        ) : (
          <button
            className="secondary"
            aria-expanded={open}
            aria-controls="account-panel"
            onClick={() => {
              setOpen(true);
              setMessage("");
            }}
          >
            <LogIn size={16} aria-hidden="true" /> เข้าสู่ระบบ / สมัครสมาชิก
          </button>
        )}
      </div>}
      <dialog ref={dialogRef} id="account-panel" className="auth-panel" aria-labelledby="auth-title" onClose={() => setOpen(false)}>
          <div className="auth-heading">
            <h2 id="auth-title">
              {!client ? "ระบบบัญชียังไม่พร้อม" : mode === "signin"
                ? "เข้าสู่ระบบ"
                : mode === "signup"
                  ? "สมัครสมาชิก"
                  : "ตั้งรหัสผ่านใหม่"}
            </h2>
            <button className="secondary" onClick={() => setOpen(false)}>
              ปิด
            </button>
          </div>
          <p className="auth-caption muted small">{client ? "เข้าสู่ระบบเพื่อเก็บประวัติและเปิดดูบนอุปกรณ์อื่น" : "ขณะนี้ยังเข้าสู่ระบบไม่ได้ คุณยังสามารถทำข้อสอบแบบ Guest ได้ตามปกติ"}</p>
          <p className="auth-message" role="status">
            {message}
          </p>
          {client && <form onSubmit={submit}>
            {mode !== "recovery" && (
              <>
                <label htmlFor="auth-email">อีเมล</label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                  autoComplete="email"
                />
              </>
            )}
            {mode !== "forgot" && (
              <>
                <label htmlFor="auth-password">รหัสผ่าน</label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                />
              </>
            )}
            <button className="primary" disabled={busy}>
              {mode === "signin"
                ? "เข้าสู่ระบบ"
                : mode === "signup"
                  ? "สมัครสมาชิก"
                  : mode === "forgot"
                    ? "ส่งลิงก์ตั้งรหัสผ่านใหม่"
                    : "บันทึกรหัสผ่านใหม่"}
            </button>
          </form>}
          {client && mode !== "recovery" && (
            <div className="auth-options">
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  client
                    ? perform(() =>
                        client.auth.signInWithOAuth({
                          provider: "google",
                          options: { redirectTo },
                        }),
                      )
                    : setMessage("ระบบบัญชียังไม่ได้ตั้งค่า")
                }
              >
                เข้าสู่ระบบด้วย Google
              </button>
              <button
                className="auth-link"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setMessage("");
                }}
              >
                {mode === "signin"
                  ? "ยังไม่มีบัญชี? สมัครสมาชิก"
                  : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
              </button>
              {mode !== "forgot" && (
                <button
                  className="auth-link"
                  onClick={() => {
                    setMode("forgot");
                    setMessage("");
                  }}
                >
                  ลืมรหัสผ่าน
                </button>
              )}
              <button className="auth-link" onClick={() => setOpen(false)}>
                ทำข้อสอบแบบ Guest
              </button>
            </div>
          )}
          {!client && <button className="primary auth-continue" onClick={() => setOpen(false)}>กลับไปทำข้อสอบ</button>}
      </dialog>
    </div>
  );
}
