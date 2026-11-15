import { useEffect, useState } from 'react';
import { api, post } from './api.js';
import { fmt, dmy, notify } from './ui.jsx';
import { uploadPhoto } from './image.js';

function PhotoField({ label, kind, value, onChange }) {
  const [st, setSt] = useState({ busy: false, preview: null, err: '' });
  async function pick(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setSt({ busy: true, preview: null, err: '' });
    try {
      const r = await uploadPhoto(kind, file);
      setSt({ busy: false, preview: r.preview, err: '' });
      onChange(r.fileId);
    } catch (err) {
      setSt({ busy: false, preview: null, err: err.message });
      onChange('');
    }
  }
  return (
    <div className="field">
      <span>{label}</span>
      <label className={'photo' + (value ? ' done' : '')}>
        {st.preview
          ? <img src={st.preview} alt="" />
          : <div className="photo-ph">{st.busy ? 'Yuklanmoqda…' : value ? '✓ Yuklangan' : '📷 Rasm olish yoki tanlash'}</div>}
        <input className="file-input" type="file" accept="image/*" onChange={pick} />
      </label>
      {value && !st.busy && <small className="muted">Almashtirish uchun rasmni bosing</small>}
      {st.err && <div className="err">{st.err}</div>}
    </div>
  );
}

const EMPTY = { fullName: '', phone: '', phone2: '', category: 'B', groupId: '', instructorId: '', selfieFileId: '', passportFileId: '' };
const digits = (x) => String(x).replace(/\D/g, '');

export default function Register({ onClose, onChanged, onOpen }) {
  const [cfg, setCfg] = useState(null);
  const [groups, setGroups] = useState([]);
  const [instr, setInstr] = useState([]);
  const [f, setF] = useState(EMPTY);
  const [pay, setPay] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    Promise.all([api('/tariffs'), api('/groups'), api('/instructors')])
      .then(([c, g, i]) => { setCfg(c); setGroups(g); setInstr(i); setPay(String(c.minPayment)); })
      .catch((e) => { notify(e.message); onClose(); });
  }, []);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const tariff = cfg && cfg.tariffs.find((t) => t.category === f.category);
  const amount = Number(pay) || 0;
  const valid = !!cfg && !!tariff
    && f.fullName.trim().length >= 5 && digits(f.phone).length >= 9 && digits(f.phone2).length >= 9
    && !!f.selfieFileId && !!f.passportFileId
    && amount >= cfg.minPayment && amount <= tariff.total;

  async function submit() {
    setBusy(true); setErr('');
    try {
      const r = await post('/students', {
        fullName: f.fullName, phone: f.phone, phone2: f.phone2, category: f.category,
        groupId: f.groupId ? Number(f.groupId) : null, instructorId: f.instructorId ? Number(f.instructorId) : null,
        selfieFileId: f.selfieFileId, passportFileId: f.passportFileId, initialPayment: amount,
      });
      setDone(r);
      if (onChanged) onChanged();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  function again() { setDone(null); setF(EMPTY); setPay(String(cfg.minPayment)); setErr(''); }

  if (done) {
    return (
      <div className="sheet">
        <div className="center success">
          <div className="empty-icon">✅</div>
          <b>Ro'yxatga olindi</b>
          <div>#{done.id} {done.fullName}</div>
          <div className="muted">Qolgan qarz: {fmt(done.debt)} so'm · yakuniy muddat {dmy(done.deadline)}</div>
          <button className="btn primary wide" onClick={() => post(`/payments/${done.paymentId}/send-receipt`).then(() => notify('Chek botga yuborildi')).catch((e) => notify(e.message))}>PDF chekni botga yuborish</button>
          <button className="btn wide" onClick={() => { onClose(); if (onOpen) onOpen(done.id); }}>Kartani ochish</button>
          <button className="btn wide" onClick={again}>Yana bir o'quvchi qo'shish</button>
          <button className="btn wide" onClick={onClose}>Yopish</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet">
      <div className="sheet-head"><button className="btn" onClick={onClose}>‹ Orqaga</button><b>Yangi o'quvchi</b></div>
      {!cfg ? <div className="center">Yuklanmoqda…</div> : (
        <div className="form">
          <label className="field"><span>F.I.O.</span>
            <input value={f.fullName} onChange={set('fullName')} placeholder="Familiya Ism Sharif" /></label>
          <label className="field"><span>Asosiy telefon</span>
            <input type="tel" value={f.phone} onChange={set('phone')} placeholder="90 123 45 67" /></label>
          <label className="field"><span>Qo'shimcha telefon</span>
            <input type="tel" value={f.phone2} onChange={set('phone2')} placeholder="Boshqa raqam yoki yaqin odamniki" /></label>
          <label className="field"><span>Toifa</span>
            <select value={f.category} onChange={set('category')}>
              {cfg.tariffs.map((t) => <option key={t.category} value={t.category}>{t.category} · {fmt(t.total)} so'm</option>)}
            </select></label>

          <PhotoField label="Selfi rasm" kind="selfie" value={f.selfieFileId} onChange={(id) => setF((x) => ({ ...x, selfieFileId: id }))} />
          <PhotoField label="Pasport rasmi" kind="passport" value={f.passportFileId} onChange={(id) => setF((x) => ({ ...x, passportFileId: id }))} />

          <label className="field"><span>Ro'yxat to'lovi (kamida {fmt(cfg.minPayment)})</span>
            <input type="number" inputMode="numeric" value={pay} onChange={(e) => setPay(e.target.value)} /></label>
          {tariff && (
            <div className="summary">
              Jami: {fmt(tariff.total)} so'm · to'lovdan keyin qarz: <b>{fmt(Math.max(tariff.total - amount, 0))}</b>
              {amount > 0 && amount < cfg.minPayment && <div className="err">Kamida {fmt(cfg.minPayment)} so'm bo'lishi kerak</div>}
              {tariff && amount > tariff.total && <div className="err">Jami summadan oshmasin</div>}
            </div>
          )}

          <label className="field"><span>Guruh (ixtiyoriy)</span>
            <select value={f.groupId} onChange={set('groupId')}>
              <option value="">Guruhsiz</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select></label>
          <label className="field"><span>Instruktor (ixtiyoriy)</span>
            <select value={f.instructorId} onChange={set('instructorId')}>
              <option value="">Biriktirilmagan</option>
              {instr.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select></label>

          {err && <div className="err">{err}</div>}
          <button className="btn primary wide big-btn" disabled={!valid || busy} onClick={submit}>
            {busy ? 'Saqlanmoqda…' : "Ro'yxatga olish"}
          </button>
          {!valid && <div className="muted hint">Hamma maydon va ikkala rasm to'ldirilgach tugma ochiladi</div>}
        </div>
      )}
    </div>
  );
}