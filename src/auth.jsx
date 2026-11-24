import React, { useEffect, useRef, useState } from "react";
import { CircleUserRound, LogIn, LogOut, X } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
const config = window.SUPABASE_CONFIG || {};
const EMAIL_AUTH_ENABLED = true;
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
/**
 * เลือกรูปโปรไฟล์ Google เฉพาะ URL แบบ HTTPS จากโดเมนที่เชื่อถือได้
 * @param {object} user ผู้ใช้จาก Supabase
 */
function googleAvatar(user) {
  const identity = user.identities?.find((item) => item.provider === "google");
  if (!identity && user.app_metadata?.provider !== "google") return null;
  const url =
    identity?.identity_data?.avatar_url ||
    identity?.identity_data?.picture ||
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "googleusercontent.com" ||
        parsed.hostname.endsWith(".googleusercontent.com"))
      ? parsed.href
      : null;
  } catch (_) {
    return null;
  }
}
/**
 * แสดงรูปบัญชี หรือไอคอนสำรองเมื่อไม่มีรูปหรือโหลดไม่สำเร็จ
 * @param {object} props คุณสมบัติของคอมโพเนนต์
 * @param {string|null} props.url URL รูปโปรไฟล์
 */
function AccountAvatar({ url }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="account-avatar" aria-hidden="true">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <CircleUserRound size={22} />
      )}
    </span>
  );
}
/**
 * จัดการหน้าต่างเข้าสู่ระบบ สมัครสมาชิก และเลือกใช้ Guest
 * @param {object} props คุณสมบัติของคอมโพเนนต์
 * @param {Function} props.onUser แจ้งผู้ใช้ปัจจุบัน หรือ null เมื่อเลือก Guest
 * @param {boolean} [props.showAccountControls=true] แสดงปุ่มควบคุมบัญชี
 */
export function Auth({ onUser, showAccountControls = true }) {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [choiceRequired, setChoiceRequired] = useState(true);
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    const dialog = dialogRef.current;
    function preventDismiss(event) {
      if (choiceRequired) event.preventDefault();
    }
    dialog.addEventListener("cancel", preventDismiss);
    return () => dialog.removeEventListener("cancel", preventDismiss);
  }, [choiceRequired]);
  useEffect(() => {
    if (!client) {
      setOpen(true);
      return;
    }
    const { data } = client.auth.onAuthStateChange((event, session) => {
      const hadUser = Boolean(currentUser);
      currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        setChoiceRequired(false);
        setOpen(false);
        onUser(currentUser);
      } else if (
        event === "INITIAL_SESSION" ||
        (event === "SIGNED_OUT" && hadUser)
      ) {
        setChoiceRequired(true);
        setOpen(true);
      }
      if (EMAIL_AUTH_ENABLED && event === "PASSWORD_RECOVERY") {
        setMode("recovery");
        setOpen(true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [onUser]);
  /**
   * เปลี่ยนรูปแบบฟอร์มและล้างรหัสผ่านกับข้อความเดิม
   * @param {string} nextMode รูปแบบฟอร์มถัดไป เช่น signin หรือ signup
   */
  function changeMode(nextMode) {
    setMode(nextMode);
    setPassword("");
    setMessage("");
  }
  function continueAsGuest() {
    setChoiceRequired(false);
    setOpen(false);
    onUser(null);
  }
  /**
   * เรียกงานบัญชีพร้อมจัดการสถานะกำลังโหลดและข้อความผิดพลาด
   * @param {Function} fn งาน Supabase ที่คืน Promise
   */
  async function perform(fn) {
    setBusy(true);
    setMessage("");
    try {
      const result = await fn();
      if (result?.error) throw result.error;
      return result;
    } catch (_) {
      setMessage(
        "ไม่สามารถดำเนินการได้ โปรดตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  }
  /**
   * ส่งฟอร์มบัญชีตามโหมดปัจจุบัน
   * @param {Event} e เหตุการณ์ส่งฟอร์ม
   */
  async function submit(e) {
    e.preventDefault();
    if (!EMAIL_AUTH_ENABLED || !client) return;
    const redirectTo = location.origin + location.pathname;
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
    const result = await perform(fn);
    if (!result) return;
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
  const avatar = user ? googleAvatar(user) : null;
  return (
    <div className="auth-container">
      {showAccountControls && (
        <div className="auth-bar">
          {user && (
            <span className="auth-status">
              <AccountAvatar key={avatar || "fallback"} url={avatar} />
              <span className="account-name">
                {user.email || "เข้าสู่ระบบแล้ว"}
              </span>
            </span>
          )}
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
                changeMode("signin");
                setOpen(true);
              }}
            >
              <LogIn size={16} aria-hidden="true" /> เข้าสู่ระบบ
            </button>
          )}
        </div>
      )}
      <dialog
        ref={dialogRef}
        id="account-panel"
        className="auth-panel"
        aria-labelledby="auth-title"
        onClose={() => {
          if (choiceRequired) dialogRef.current?.showModal();
          else setOpen(false);
        }}
      >
        <div className="auth-heading">
          <h2 id="auth-title">
            {!client
              ? "ระบบบัญชียังไม่พร้อม"
              : mode === "signup"
                ? "สมัครสมาชิก"
                : mode === "forgot" || mode === "recovery"
                  ? "ตั้งรหัสผ่านใหม่"
                  : "เข้าสู่ระบบ"}
          </h2>
          {!choiceRequired && (
            <button
              className="auth-close"
              type="button"
              aria-label="ปิดหน้าต่างเข้าสู่ระบบ"
              onClick={() => setOpen(false)}
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="auth-caption muted small">
          {!client
            ? "ขณะนี้ยังเข้าสู่ระบบไม่ได้ คุณยังสามารถทำข้อสอบแบบ Guest ได้ตามปกติ"
            : mode === "forgot"
              ? "กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่"
              : mode === "recovery"
                ? "ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ"
                : mode === "signup"
                  ? "สมัครสมาชิกเพื่อเก็บประวัติและเปิดดูบนอุปกรณ์อื่น"
                  : "เข้าสู่ระบบเพื่อเก็บประวัติและเปิดดูบนอุปกรณ์อื่น"}
        </p>
        <p className="auth-message" role="status">
          {message}
        </p>
        {client && mode === "signin" && (
          <button
            className="secondary auth-google"
            type="button"
            disabled={busy}
            onClick={() =>
              perform(() =>
                client.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: location.origin + location.pathname },
                }),
              )
            }
          >
            <img
              className="google-logo"
              src={`${import.meta.env.BASE_URL}google-logo.png`}
              alt=""
            />{" "}
            เข้าสู่ระบบด้วย Google
          </button>
        )}
        {EMAIL_AUTH_ENABLED && client && (
          <>
            {mode === "signin" && (
              <div className="auth-divider">
                <span>หรือเข้าสู่ระบบด้วยอีเมล</span>
              </div>
            )}
            <form onSubmit={submit}>
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
                  <div className="auth-label-row">
                    <label htmlFor="auth-password">รหัสผ่าน</label>
                    {mode === "signin" && (
                      <button
                        className="auth-link"
                        type="button"
                        onClick={() => changeMode("forgot")}
                      >
                        ลืมรหัสผ่าน?
                      </button>
                    )}
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    aria-describedby={
                      mode === "signup" || mode === "recovery"
                        ? "password-hint"
                        : undefined
                    }
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                  />
                  {(mode === "signup" || mode === "recovery") && (
                    <p id="password-hint" className="auth-field-hint">
                      อย่างน้อย 8 ตัวอักษร
                    </p>
                  )}
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
            </form>
          </>
        )}
        {mode !== "recovery" && (
          <div className="auth-options">
            {EMAIL_AUTH_ENABLED && client && (
              <div className="auth-switch">
                {mode === "signin" ? "ยังไม่มีบัญชี?" : "มีบัญชีแล้ว?"}{" "}
                <button
                  className="auth-link"
                  type="button"
                  onClick={() =>
                    changeMode(mode === "signin" ? "signup" : "signin")
                  }
                >
                  {mode === "signin" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
                </button>
              </div>
            )}
            <button
              className="auth-link auth-guest"
              type="button"
              onClick={continueAsGuest}
            >
              ทำข้อสอบแบบ Guest
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
