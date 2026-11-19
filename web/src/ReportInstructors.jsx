import { useEffect, useState } from 'react';
import { api } from './api.js';
import { money, dmy, Row, Skeleton, ErrorState, Empty } from './ui.jsx';
import { range, DEFAULT_BY } from './periods.js';
import { Kpi, ByToggle, SeriesTable } from './ReportParts.jsx';

export default function Instructors({ mode, anchor }) {
  const [by, setBy] = useState(DEFAULT_BY[mode]);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => { setBy(DEFAULT_BY[mode]); }, [mode]);
  const r = range(mode, anchor);
  const load = () => {
    setD(null); setErr('');
    api(`/report/instructors?from=${r.from}&to=${r.to}&by=${by}`).then(setD).catch((e) => setErr(e.message));
  };
  useEffect(load, [r.from, r.to, by]);

  if (err) return <ErrorState text={err} onRetry={load} />;
  if (!d) return <Skeleton rows={3} />;
  const t = d.totals;
  return (
    <>
      <div className="rgrid">
        <Kpi title="Shu davrda to'langan" value={t.paidInPeriod} tone="green" />
        <Kpi title="Hali to'lanmagan" value={t.owed} tone={t.owed ? 'red' : ''} hint="hozirgi holat" />
        <Kpi title="Jami hisoblangan" value={t.accrued} />
        <Kpi title="Jami to'langan" value={t.paidAll} hint="hamma vaqt" />
      </div>

      {d.unassigned.count > 0 && (
        <div className="block warn">
          <b>Instruktori biriktirilmagan: {d.unassigned.count} ta o'quvchi</b>
          <div className="muted">Ularning instruktor ulushi ({money(d.unassigned.accrued)}) yuqoridagi jami hisoblangan summaga kirmaydi. O'quvchi kartasidan instruktorni biriktiring.</div>
        </div>
      )}

      {d.items.length === 0 ? <Empty icon="👨‍🏫" text="Instruktor yo'q" /> : d.items.map((i) => (
        <div className="block" key={i.id}>
          <button className="gcard-head" onClick={() => setOpen(open === i.id ? null : i.id)} aria-expanded={open === i.id}>
            <div>
              <div className="card-title">{i.name}</div>
              <div className="muted">{i.count} ta o'quvchi · shu davrda {i.payments.length} ta to'lov</div>
            </div>
            <div className="gcard-side"><b className="green">{money(i.paidInPeriod)}</b><div className="muted">to'langan</div></div>
          </button>
          <Row label="Hisoblangan (jami)" value={money(i.accrued)} />
          <Row label="To'langan (jami)" value={money(i.paidAll)} />
          <Row label="Hali to'lanmagan" value={<span className={i.owed ? 'red' : 'green'}>{money(i.owed)}</span>} strong />
          {open === i.id && (
            <div className="gcard-body">
              <div className="block-t">To'lovlar (shu davrda)</div>
              {i.payments.length === 0 && <div className="muted">Yo'q</div>}
              {i.payments.map((p) => (
                <div className="kv" key={p.studentId}>
                  <span>{p.fullName}<div className="muted">{dmy(p.paidAt)}{p.group ? ` · ${p.group}` : ''}</div></span>
                  <span>{money(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {mode !== 'day' && (
        <div className="block">
          <div className="block-t">📅 Davr bo'yicha to'langan</div>
          <ByToggle by={by} onChange={setBy} />
          <SeriesTable rows={d.series} by={by} cols={[["Soni", 'count'], ["Summa", 'sum', 'strong']]} />
        </div>
      )}
    </>
  );
}
