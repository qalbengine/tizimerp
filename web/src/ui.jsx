import { useState } from 'react';

export const tg = window.Telegram && window.Telegram.WebApp;
export const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n || 0);
export const dmy = (x) => (x ? new Date(x).toLocaleDateString('ru-RU') : '—');
export const notify = (msg) => (tg && tg.showAlert ? tg.showAlert(String(msg)) : window.alert(msg));
export const confirmAsk = (msg) =>
  new Promise((resolve) => (tg && tg.showConfirm ? tg.showConfirm(msg, resolve) : resolve(window.confirm(msg))));

export function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>{title}</b><button className="x" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

// fields: [{ name, label, type, placeholder, value }]; onSubmit(values) xato tashlasa, modal ichida ko'rsatiladi
export function PromptModal({ title, fields, submitText = 'Saqlash', onSubmit, onClose }) {
  const [v, setV] = useState(() => Object.fromEntries(fields.map((f) => [f.name, f.value ?? ''])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setBusy(true); setErr('');
    try { await onSubmit(v); onClose(); } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal title={title} onClose={onClose}>
      {fields.map((f) => (
        <label key={f.name} className="field">
          <span>{f.label}</span>
          {f.type === 'select' ? (
            <select value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
              {f.options.map(([val, text]) => <option key={val} value={val}>{text}</option>)}
            </select>
          ) : (
            <input
              type={f.type || 'text'}
              inputMode={f.type === 'number' ? 'numeric' : undefined}
              placeholder={f.placeholder || ''}
              value={v[f.name]}
              onChange={(e) => setV({ ...v, [f.name]: e.target.value })}
            />
          )}
        </label>
      ))}
      {err && <div className="err">{err}</div>}
      <button className="btn primary wide" disabled={busy} onClick={go}>{submitText}</button>
    </Modal>
  );
}

export function Chips({ items, value, onChange }) {
  return (
    <div className="chips">
      {items.map(([k, label]) => (
        <button key={k} className={'chip' + (value === k ? ' on' : '')} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export function Bar({ label, due, paid }) {
  const pct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 100;
  return (
    <div className="bar">
      <div className="bar-top"><span>{label}</span><span>{fmt(paid)} / {fmt(due)}</span></div>
      <div className="bar-bg"><div className="bar-fg" style={{ width: pct + '%' }} /></div>
    </div>
  );
}

export function Row({ label, value, strong }) {
  return <div className="kv"><span>{label}</span><span className={strong ? 'strong' : ''}>{value}</span></div>;
}

export function Empty({ text, icon }) {
  return <div className="empty">{icon && <div className="empty-icon">{icon}</div>}{text}</div>;
}

// Pul formati: bitta joyda. Valyuta nomini o'zgartirish uchun CURRENCY ni almashtiring (masalan 'UZS').
export const CURRENCY = "so'm";
export const money = (n) => `${fmt(n)} ${CURRENCY}`;

export function Skeleton({ rows = 5 }) {
  return (
    <div aria-busy="true" aria-label="Yuklanmoqda">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skel" />)}
    </div>
  );
}

export function ErrorState({ text, onRetry }) {
  return (
    <div className="empty" role="alert">
      <div className="empty-icon">⚠️</div>
      {text}
      {onRetry && <div><button className="btn sm" style={{ marginTop: 10 }} onClick={onRetry}>Qayta urinish</button></div>}
    </div>
  );
}