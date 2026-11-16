import { useEffect, useState } from 'react';
import { api, post } from './api.js';
import { fmt, dmy, notify, confirmAsk, Chips, Empty, PromptModal, Row } from './ui.jsx';
import StudentSheet from './StudentSheet.jsx';
import { StudentCard } from './Students.jsx';

function GroupView({ g, me, onBack }) {
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [dlg, setDlg] = useState(false);
  const [sum, setSum] = useState(null);
  const load = () => {
    api(`/groups/${g.id}/students`).then(setList).catch((e) => notify(e.message));
    api(`/groups/${g.id}/summary`).then(setSum).catch((e) => notify(e.message));
  };
  const m = (n) => `${fmt(n)} so'm`;
  async function transfer() {
    if (!(await confirmAsk(`Guruhdan tashqariga ${m(sum.extBalance)} o'tkazildi deb belgilansinmi?`))) return;
    try {
      const r = await post(`/groups/${g.id}/transfer`);
      notify(`Belgilandi: ${m(r.amount)} (${r.students} ta o'quvchi)`);
      load();
    } catch (e) { notify(e.message); }
  }
  useEffect(() => { load(); }, []);
  return (
    <div className="page">
      <div className="topbar">
        <button className="btn" onClick={onBack}>‹ Orqaga</button>
        <b>{g.name}</b>
        <button className="btn primary" onClick={() => setDlg(true)}>Boshlanish sanasi</button>
      </div>
      {sum && (
        <div className="block">
          <div className="block-t">📊 Guruh hisobi</div>
          <Row label="O'quvchilar" value={sum.count} />
          <Row label="✅ To'liq to'laganlar" value={sum.paidFull} />
          <Row label="🔻 Qarzdorlar" value={`${sum.inDebt}${sum.overdue ? ` (muddati o'tgan: ${sum.overdue})` : ''}`} />
          <Row label="Qarz jami" value={m(sum.debt)} strong />
          <Row label="Kassaga tushgan" value={m(sum.cashIn)} />
          <Row label="Boshlanishi" value={sum.noStart ? `${dmy(sum.startDate)} (sanasiz: ${sum.noStart})` : dmy(sum.startDate)} />
          <Row label="Tugashi" value={dmy(sum.endDate)} strong />
          <Row label="Yakuniy to'lov muddati" value={dmy(sum.deadline)} />
          <div className="block-t" style={{ marginTop: 10 }}>🏦 Tashqariga</div>
          <Row label="Kerak" value={m(sum.extToTransfer)} />
          <Row label="O'tkazilgan" value={m(sum.extTransferred)} />
          <Row label="Qolgan" value={m(sum.extBalance)} strong />
          {sum.extBalance > 0 && <button className="btn primary wide" onClick={transfer}>Hammasi o'tkazildi ✓</button>}
          <div className="block-t" style={{ marginTop: 10 }}>👨‍🏫 Instruktor va foyda</div>
          <Row label="Instruktorga qolgan" value={m(sum.instrOwed)} />
          <Row label="Olingan foyda" value={m(sum.receivedProfit)} />
          <Row label="Kutilgan foyda" value={m(sum.expectedProfit)} />
        </div>
      )}
      {list === null ? <Empty text="Yuklanmoqda…" /> : list.length === 0 ? <Empty text="Guruhda o'quvchi yo'q" /> : (
        list.map((s) => (
          <div key={s.id}>
            <StudentCard s={s} onClick={() => setOpenId(s.id)} />
            <div className="muted sub">Boshlanish: {dmy(s.startDate)} · Tugash: {dmy(s.endDate)}</div>
          </div>
        ))
      )}
      {dlg && (
        <PromptModal title="Guruh: boshlanish sanasi" onClose={() => setDlg(false)}
          fields={[{ name: 'date', label: 'Sanasi yo\'q o\'quvchilarga qo\'yiladi', type: 'date' }]}
          onSubmit={async (v) => {
            const r = await post(`/groups/${g.id}/start-date`, { date: v.date });
            notify(`Sana qo'yildi: ${r.ok} ta o'quvchi${r.failed.length ? `. Xato: ${r.failed.map((x) => `#${x.id} ${x.msg}`).join('; ')}` : ''}`);
            await load();
          }} />
      )}
      {openId && <StudentSheet id={openId} me={me} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

export default function Manage() {
  const [tab, setTab] = useState('groups');
  const [groups, setGroups] = useState(null);
  const [instr, setInstr] = useState(null);
  const [open, setOpen] = useState(null);
  const [dlg, setDlg] = useState(null);
  const me = { role: 'admin' };

  const loadGroups = () => api('/groups').then(setGroups).catch((e) => notify(e.message));
  const loadInstr = () => api('/instructors').then(setInstr).catch((e) => notify(e.message));
  useEffect(() => { loadGroups(); loadInstr(); }, []);

  if (open) return <GroupView g={open} me={me} onBack={() => { setOpen(null); loadGroups(); }} />;

  return (
    <div className="page">
      <Chips items={[['groups', 'Guruhlar'], ['instr', 'Instruktorlar']]} value={tab} onChange={setTab} />
      {tab === 'groups' && (
        <>
          <button className="btn primary wide" onClick={() => setDlg('group')}>+ Yangi guruh</button>
          {groups === null ? <Empty text="Yuklanmoqda…" /> : groups.length === 0 ? <Empty text="Guruh yo'q" /> : groups.map((g) => (
            <div key={g.id} className="card" onClick={() => setOpen(g)}>
              <div className="card-main"><div className="card-title">{g.name}</div></div>
              <div className="card-side">{g.count} ta</div>
            </div>
          ))}
        </>
      )}
      {tab === 'instr' && (
        <>
          <button className="btn primary wide" onClick={() => setDlg('instr')}>+ Instruktor qo'shish</button>
          {instr === null ? <Empty text="Yuklanmoqda…" /> : instr.length === 0 ? <Empty text="Instruktor yo'q" /> : instr.map((i) => (
            <div key={i.id} className="block">
              <div className="card-title">{i.name} <span className="muted">({i.telegramId})</span></div>
              <div className="muted">O'quvchilar: {i.count}</div>
              <div className="kv"><span>Hisoblangan</span><span>{fmt(i.accrued)}</span></div>
              <div className="kv"><span>To'langan</span><span>{fmt(i.paid)}</span></div>
              <div className="kv"><span>Qolgan</span><span className="strong">{fmt(i.unpaid)}</span></div>
            </div>
          ))}
        </>
      )}

      {dlg === 'group' && (
        <PromptModal title="Yangi guruh" onClose={() => setDlg(null)} fields={[{ name: 'name', label: 'Nomi', placeholder: 'B-1 dekabr' }]}
          onSubmit={async (v) => { await post('/groups', { name: v.name }); await loadGroups(); }} />
      )}
      {dlg === 'instr' && (
        <PromptModal title="Instruktor qo'shish" onClose={() => setDlg(null)}
          fields={[{ name: 'telegramId', label: 'Telegram ID (instruktor botga /start yuborsa ko\'rsatadi)', type: 'number' }, { name: 'name', label: 'Ism' }]}
          onSubmit={async (v) => { await post('/instructors', { telegramId: v.telegramId, name: v.name }); await loadInstr(); }} />
      )}
    </div>
  );
}