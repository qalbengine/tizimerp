import { useEffect, useState } from 'react';
import { api } from './api.js';
import { money, Row, Skeleton, ErrorState } from './ui.jsx';
import { range, DEFAULT_BY } from './periods.js';
import { Kpi, ByToggle, SeriesTable } from './ReportParts.jsx';

export default function Overview({ mode, anchor }) {
  const [by, setBy] = useState(DEFAULT_BY[mode]);
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { setBy(DEFAULT_BY[mode]); }, [mode]);
  const r = range(mode, anchor);
  const load = () => {
    setO(null); setErr('');
    api(`/report/overview?from=${r.from}&to=${r.to}&by=${by}`).then(setO).catch((e) => setErr(e.message));
  };
  useEffect(load, [r.from, r.to, by]);

  if (err) return <ErrorState text={err} onRetry={load} />;
  if (!o) return <Skeleton rows={4} />;
  const p = o.period; const d = o.debt;
  return (
    <>
      <div className="rgrid">
        <Kpi title="Kassaga tushgan" value={p.cashIn} tone="blue" hint="shu davrda" />
        <Kpi title="Xarajatlar" value={p.expenses} tone={p.expenses ? 'red' : ''} hint={`${p.expenseCount} ta yozuv`} />
        <Kpi title="Instruktorga to'langan" value={p.instrPaid} hint={`${p.instrPaidCount} ta o'quvchi uchun`} />
        <Kpi title="Sof foyda" value={p.profit} tone={p.profit < 0 ? 'red' : 'green'} hint="qo'lda qolgan pul" />
      </div>

      <div className="block">
        <div className="block-t">💰 Pul qayerga ketdi (shu davrda)</div>
        <Row label="Kassaga tushgan" value={money(p.cashIn)} strong />
        <Row label="− Tashqariga ketadigan qismi" value={money(p.ext)} />
        <Row label="= Markazda qolgan" value={money(p.center)} strong />
        <Row label="− Instruktorga to'langan" value={money(p.instrPaid)} />
        <Row label="− Xarajatlar" value={money(p.expenses)} />
        <Row label="= Sof foyda" value={<span className={p.profit < 0 ? 'red' : 'green'}>{money(p.profit)}</span>} strong />
        <div className="hint">Tashqi to'lov qismi o'quvchi to'lovidan avtomatik ajratiladi (1-bosqich, keyin 2-bosqich). Chegirma markaz ulushidan chiqadi.</div>
      </div>

      <div className="block">
        <div className="block-t">🏦 Tashqariga o'tkazma</div>
        <Row label="Shu davrda tushgan tashqi qism" value={money(o.ext.received)} />
        <Row label="Jami o'tkazilgan (hamma vaqt)" value={money(o.ext.transferredAll)} />
        <Row label="Hali o'tkazilmagan (hozir)" value={money(o.ext.balanceAll)} strong />
      </div>

      <div className="block">
        <div className="block-t">⚠️ Qarz (hozirgi holat)</div>
        <Row label="Jami qarz" value={<span className={d.total ? 'red' : 'green'}>{money(d.total)}</span>} strong />
        <Row label="Qarzdor o'quvchilar" value={`${d.count} ta`} />
        <Row label="Muddati o'tgan" value={`${d.overdue} ta · ${money(d.overdueSum)}`} />
        <Row label="Hozir to'lanishi kerak (muddatli)" value={money(d.dueNow)} />
      </div>

      <div className="block">
        <div className="block-t">👥 Yangi o'quvchilar va chegirma</div>
        <Row label="Shu davrda ro'yxatga olingan" value={`${o.registered.count} ta`} />
        <Row label="Shulardan chegirmada" value={`${o.registered.discountCount} ta`} />
        <Row label="Chegirma summasi" value={money(o.registered.discountSum)} />
        <Row label="Hamma vaqt: chegirmadagilar" value={`${o.discountsAll.discountCount} / ${o.discountsAll.count} ta · ${money(o.discountsAll.discountSum)}`} />
      </div>

      {mode !== 'day' && (
        <div className="block">
          <div className="block-t">📅 Davr bo'yicha</div>
          <ByToggle by={by} onChange={setBy} />
          <SeriesTable rows={o.series} by={by} cols={[["Kassa", 'cashIn'], ['Markaz', 'center'], ['Instr.', 'instr'], ['Xarajat', 'expense'], ['Foyda', 'profit', 'profit']]} />
        </div>
      )}
    </>
  );
}
