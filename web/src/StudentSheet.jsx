import { useEffect, useState } from 'react';
import { api, post } from './api.js';
import { fmt, dmy, notify, confirmAsk, Modal, PromptModal, Bar, Row, Empty } from './ui.jsx';

function PickList({ title, load, nullLabel, onPick, onClose }) {
  const [items, setItems] = useState(null);
  useEffect(() => { load().then(setItems).catch((e) => notify(e.message)); }, []);
  return (
    <Modal title={title} onClose={onClose}>
      {items === null ? <Empty text="Yuklanmoqda…" /> : items.map((i) => (
        <button key={i.id} className="btn wide" onClick={() => onPick(i.id)}>{i.name}</button>
      ))}
      <button className="btn wide" onClick={() => onPick(null)}>{nullLabel}</button>
    </Modal>
  );
}

export default function StudentSheet({ id, me, onClose, onChanged }) {
  const admin = me.role === 'admin';
  const [s, setS] = useState(null);
  const [dlg, setDlg] = useState(null);

  const reload = () => api(`/students/${id}`).then(setS).catch((e) => { notify(e.message); onClose(); });
  useEffect(() => { reload(); }, [id]);
  const changed = async () => { await reload(); if (onChanged) onChanged(); };
  const run = async (fn, okMsg) => {
    try { await fn(); if (okMsg) notify(okMsg); await changed(); } catch (e) { notify(e.message); }
  };

  if (!s) return <div className="sheet"><div className="center">Yuklanmoqda…</div></div>;

  const base = `/students/${s.id}`;
  const close = () => setDlg(null);

  return (
    <div className="sheet">
      <div className="sheet-head">
        <button className="btn" onClick={onClose}>‹ Orqaga</button>
        <b>#{s.id}</b>
      </div>

      <div className="block">
        <div className="big">{s.fullName} <span className="badge">{s.category}</span></div>
        {admin && <div className="muted">
          <a href={`tel:+998${s.phone}`}>+998{s.phone}</a>{s.phone2 && <> · <a href={`tel:+998${s.phone2}`}>+998{s.phone2}</a></>}
        </div>}
        <Row label="Guruh" value={s.group ? s.group.name : '—'} />
        <Row label="Instruktor" value={s.instructor ? s.instructor.name : '—'} />
        <Row label="Ro'yxat sanasi" value={dmy(s.registeredAt)} />
        <Row label="O'qish boshlanishi" value={dmy(s.startDate)} />
        <Row label="O'qish tugashi" value={dmy(s.endDate)} />
        <Row label="Yakuniy muddat" value={dmy(s.deadline)} />
        <Row label="Hujjat" value={s.docApproved ? 'Tasdiqlangan' : 'Tasdiqlanmagan'} />
      </div>

      <div className="block">
        <Row label="Jami" value={`${fmt(s.total)} so'm`} />
        {s.discount > 0 && <Row label={`Chegirma (${s.discountReason || ''})`} value={`−${fmt(s.discount)}`} />}
        <Row label="To'langan" value={`${fmt(s.paid)} so'm`} />
        <Row label="Qarz" value={`${fmt(s.debt)} so'm`} strong />
        {s.dueNow > 0 && <Row label="Muddatli qarz" value={`${fmt(s.dueNow)} so'm`} strong />}
        <Bar label="1-bosqich (tashqi)" due={s.stage1.due} paid={s.stage1.paid} />
        <Bar label={`2-bosqich (tashqi)${s.docApproved ? '' : ' · hujjat kutilmoqda'}`} due={s.stage2.due} paid={s.stage2.paid} />
        <Bar label="Qolgan qism" due={s.restPart.due} paid={s.restPart.paid} />
        {admin && <>
          <Row label="Instruktor ulushi" value={`${fmt(s.instructorShare)} ${s.instructorPaid ? "(to'langan)" : "(to'lanmagan)"}`} />
          <Row label="Tashqariga o'tkazilishi kerak" value={`${fmt(s.extToTransfer)} so'm`} />
          <Row label="Kutilgan foyda" value={`${fmt(s.expectedProfit)} so'm`} />
        </>}
      </div>

      <div className="block">
        <div className="block-title">To'lovlar</div>
        {s.payments.length === 0 && <Empty text="To'lov yo'q" />}
        {s.payments.map((p) => (
          <div key={p.id} className={'pay' + (p.status === 'CANCELLED' ? ' cancelled' : '')}>
            <div>
              <b>№{p.id}</b> · {fmt(p.amount)} so'm
              <div className="muted">{dmy(p.paidAt)}{p.status === 'CANCELLED' ? ` · BEKOR: ${p.cancelReason || ''}` : ''}</div>
            </div>
            <div className="pay-btns">
              <button className="btn sm" onClick={() => run(() => post(`/payments/${p.id}/send-receipt`), 'Chek botga yuborildi')}>PDF</button>
              {admin && p.status === 'ACTIVE' && <button className="btn sm danger" onClick={() => setDlg({ t: 'cancel', id: p.id })}>Bekor</button>}
            </div>
          </div>
        ))}
      </div>

      {admin && (
        <div className="actions">
          <button className="btn primary" onClick={() => setDlg({ t: 'pay' })}>To'lov qo'shish</button>
          <button className="btn" disabled={s.docApproved}
            onClick={async () => { if (await confirmAsk('Hujjat tasdiqlandimi?')) run(() => post(`${base}/doc-approve`), 'Hujjat tasdiqlandi'); }}>Hujjat tasdiqlandi</button>
          <button className="btn" onClick={() => setDlg({ t: 'edit' })}>Tahrirlash</button>
          <button className="btn" onClick={() => setDlg({ t: 'disc' })}>Chegirma</button>
          <button className="btn" onClick={() => setDlg({ t: 'start' })}>Boshlanish sanasi</button>
          <button className="btn" onClick={() => setDlg({ t: 'instr' })}>Instruktor</button>
          <button className="btn" onClick={() => setDlg({ t: 'group' })}>Guruh</button>
          <button className="btn" disabled={s.instructorPaid || !s.instructor}
            onClick={async () => { if (await confirmAsk(`Instruktor ulushi ${fmt(s.instructorShare)} so'm to'landimi?`)) run(() => post(`${base}/instructor-paid`), "Ulush to'langan deb belgilandi"); }}>Instr. to'landi</button>
          <button className="btn" disabled={s.extToTransfer <= 0} onClick={() => setDlg({ t: 'ext' })}>Tashqi o'tkazma</button>
          <button className="btn" disabled={!s.hasPhotos} onClick={() => run(() => post(`${base}/send-photos`), 'Rasmlar botga yuborildi')}>Rasmlar (botga)</button>
          <button className="btn danger"
            onClick={async () => { if (await confirmAsk("O'quvchini o'chirasizmi? (arxivda saqlanadi)")) run(async () => { await api(base, { method: 'DELETE' }); onClose(); }); }}>O'chirish</button>
        </div>
      )}

      {dlg && dlg.t === 'pay' && (
        <PromptModal title="To'lov qo'shish" onClose={close} submitText="Qabul qilish"
          fields={[{ name: 'amount', label: `Summa (qarz: ${fmt(s.debt)})`, type: 'number', placeholder: '500000' }]}
          onSubmit={async (v) => { const r = await post(`${base}/payments`, { amount: Number(v.amount) }); await changed(); return r; }} />
      )}
      {dlg && dlg.t === 'edit' && (
        <PromptModal title="Ma'lumotlarni tahrirlash" onClose={close}
          fields={[
            { name: 'fullName', label: 'F.I.O.', value: s.fullName },
            { name: 'phone', label: 'Telefon', type: 'tel', value: s.phone },
            { name: 'phone2', label: "Qo'shimcha telefon", type: 'tel', value: s.phone2 || '' },
            { name: 'category', label: 'Toifa (o\'zgarsa, tarif qayta qotadi)', type: 'select', value: s.category, options: [['B', 'B'], ['BC', 'BC'], ['C', 'C'], ['E', 'E']] },
          ]}
          onSubmit={async (v) => {
            const patch = {};
            ['fullName', 'phone', 'phone2', 'category'].forEach((k) => { if (String(v[k]).trim() !== String(s[k] || '')) patch[k] = v[k]; });
            await api(base, { method: 'PATCH', body: patch });
            await changed();
          }} />
      )}
      {dlg && dlg.t === 'cancel' && (
        <PromptModal title={`Chek №${dlg.id} ni bekor qilish`} onClose={close} submitText="Bekor qilish"
          fields={[{ name: 'reason', label: 'Sabab' }]}
          onSubmit={async (v) => { await post(`/payments/${dlg.id}/cancel`, { reason: v.reason }); await changed(); }} />
      )}
      {dlg && dlg.t === 'disc' && (
        <PromptModal title="Chegirma" onClose={close}
          fields={[{ name: 'amount', label: 'Summa (0 = olib tashlash)', type: 'number', value: s.discount }, { name: 'reason', label: 'Sabab', value: s.discountReason || '' }]}
          onSubmit={async (v) => { await post(`${base}/discount`, { amount: Number(v.amount), reason: v.reason }); await changed(); }} />
      )}
      {dlg && dlg.t === 'start' && (
        <PromptModal title="O'qish boshlanish sanasi" onClose={close}
          fields={[{ name: 'date', label: "Ro'yxatdan ko'pi bilan 10 kun keyin", type: 'date' }]}
          onSubmit={async (v) => { await post(`${base}/start-date`, { date: v.date }); await changed(); }} />
      )}
      {dlg && dlg.t === 'ext' && (
        <PromptModal title="Tashqariga o'tkazma" onClose={close}
          fields={[{ name: 'amount', label: `O'tkazilishi kerak: ${fmt(s.extToTransfer)}`, type: 'number' }]}
          onSubmit={async (v) => { await post(`${base}/transfer`, { amount: Number(v.amount) }); await changed(); }} />
      )}
      {dlg && dlg.t === 'instr' && (
        <PickList title="Instruktorni tanlang" nullLabel="Biriktirishni olib tashlash" onClose={close}
          load={() => api('/instructors')}
          onPick={(iid) => { close(); run(() => post(`${base}/assign-instructor`, { instructorId: iid })); }} />
      )}
      {dlg && dlg.t === 'group' && (
        <PickList title="Guruhni tanlang" nullLabel="Guruhdan olib tashlash" onClose={close}
          load={() => api('/groups')}
          onPick={(gid) => { close(); run(() => post(`${base}/assign-group`, { groupId: gid })); }} />
      )}
    </div>
  );
}