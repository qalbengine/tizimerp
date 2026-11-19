import { useEffect, useState } from 'react';
import { api, post } from './api.js';
import { money, dmy, Row, Skeleton, ErrorState, Empty, notify, confirmAsk } from './ui.jsx';

function GroupCard({ g, open, onToggle, onChanged }) {
  const paidPct = g.count ? Math.round((g.paidFull / g.count) * 100) : 0;
  async function transfer() {
    if (!(await confirmAsk(`${g.name}: tashqariga ${money(g.extBalance)} o'tkazildi deb belgilansinmi?`))) return;
    try { const r = await post(`/groups/${g.id}/transfer`); notify(`Belgilandi: ${money(r.amount)}`); onChanged(); } catch (e) { notify(e.message); }
  }
  async function instrPaid() {
    if (!(await confirmAsk(`${g.name}: instruktori bor hamma o'quvchi uchun ulush (${money(g.instrOwed)}) to'landimi?`))) return;
    try { const r = await post(`/groups/${g.id}/instructor-paid`); notify(`${r.count} ta o'quvchi, ${money(r.sum)} to'langan deb belgilandi`); onChanged(); } catch (e) { notify(e.message); }
  }
  return (
    <div className="block gcard">
      <button className="gcard-head" onClick={onToggle} aria-expanded={open}>
        <div>
          <div className="card-title">{g.name}</div>
          <div className="muted">{g.count} ta · to'liq to'lagan {g.paidFull} · qarzdor {g.inDebt}{g.overdue ? ` (muddati o'tgan ${g.overdue})` : ''}</div>
        </div>
        <div className="gcard-side">
          <div className={g.debt ? 'red' : 'green'}><b>{money(g.debt)}</b></div>
          <div className="muted">qarz</div>
        </div>
      </button>
      <div className="pp"><div className="pp-bar"><div className="pp-fg green" style={{ width: paidPct + '%' }} /></div><span className="pp-pct">{paidPct}%</span></div>
      {open && (
        <div className="gcard-body">
          <div className="block-t">💰 To'lovlar</div>
          <Row label="Kassaga tushgan" value={money(g.cashIn)} strong />
          <Row label="Qarz (qolgan)" value={money(g.debt)} />
          <Row label="Chegirmada" value={`${g.discountCount} ta · ${money(g.discounts)}`} />
          <div className="block-t">🏦 Tashqi to'lov</div>
          <Row label="1-bosqich: tushgan / jami" value={`${money(g.ext1.paid)} / ${money(g.ext1.due)}`} />
          <Row label="2-bosqich: tushgan / jami" value={`${money(g.ext2.paid)} / ${money(g.ext2.due)}`} />
          <Row label="O'tkazilgan" value={money(g.extTransferred)} />
          <Row label="Hali o'tkazilmagan" value={money(g.extBalance)} strong />
          {g.id !== 0 && g.extBalance > 0 && <button className="btn wide" onClick={transfer}>Hammasi o'tkazildi ✓</button>}
          <div className="block-t">👨‍🏫 Instruktor</div>
          <Row label="Hisoblangan" value={money(g.instrAccrued)} />
          <Row label="To'langan" value={money(g.instrPaid)} />
          <Row label="Qolgan" value={money(g.instrOwed)} strong />
          {g.id !== 0 && g.instrOwed > 0 && <button className="btn wide" onClick={instrPaid}>Instruktor ulushi to'landi ✓</button>}
          <div className="block-t">📈 Foyda</div>
          <Row label="Olingan foyda (instruktorsiz)" value={money(g.receivedProfit)} />
          <Row label="Kutilgan foyda (hammasi to'lansa)" value={money(g.expectedProfit)} />
          {g.id !== 0 && <>
            <div className="block-t">📅 Muddatlar</div>
            <Row label="Boshlanishi" value={g.noStart ? `${dmy(g.startDate)} (sanasiz: ${g.noStart})` : dmy(g.startDate)} />
            <Row label="Tugashi" value={dmy(g.endDate)} />
            <Row label="Yakuniy to'lov muddati" value={dmy(g.deadline)} />
          </>}
          {g.debtors.length > 0 && (
            <>
              <div className="block-t">🔻 Qarzdorlar ({g.debtors.length})</div>
              {g.debtors.map((s) => (
                <div className="kv" key={s.id}>
                  <span>{s.fullName}{s.overdue ? ' · muddati o\'tgan' : ''}</span>
                  <span className="red">{money(s.debt)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Groups() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const load = () => { setErr(''); return api('/report/groups').then(setList).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); }, []);
  if (err) return <ErrorState text={err} onRetry={load} />;
  if (!list) return <Skeleton rows={4} />;
  if (!list.length) return <Empty icon="📂" text="Guruh yo'q" />;
  const tot = list.reduce((a, g) => ({ debt: a.debt + g.debt, cash: a.cash + g.cashIn, n: a.n + g.count }), { debt: 0, cash: 0, n: 0 });
  return (
    <>
      <div className="muted pad">{list.length} ta guruh · {tot.n} o'quvchi · kassaga {money(tot.cash)} · qarz {money(tot.debt)}</div>
      {list.map((g) => <GroupCard key={g.id} g={g} open={open === g.id} onToggle={() => setOpen(open === g.id ? null : g.id)} onChanged={load} />)}
    </>
  );
}
