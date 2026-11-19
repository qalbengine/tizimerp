import { money, dmy } from './ui.jsx';
import { payState, STATE_INFO, paidPercent } from './studentLogic.js';

export function PaymentStatus({ s }) {
  const st = STATE_INFO[payState(s)];
  return <span className={'pstatus ' + st.tone}>{st.label}</span>;
}

// Progress: rang + matn (rang yolg'iz emas): foiz va holat yozuvi doim ko'rinadi
export function PaymentProgress({ s }) {
  const pct = paidPercent(s);
  const tone = STATE_INFO[payState(s)].tone;
  return (
    <div className="pp" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`To'langan ${pct}%`}>
      <div className="pp-bar"><div className={'pp-fg ' + tone} style={{ width: pct + '%' }} /></div>
      <span className="pp-pct">{pct}%</span>
    </div>
  );
}

export function StudentStats({ stats, onPick }) {
  const items = [
    ['👥', 'Jami o\'quvchilar', stats.total, '', 'all'],
    ['⚠️', 'Qarzdor o\'quvchilar', stats.debtors, stats.debtors ? 'red' : '', 'debtors'],
    ['✅', "To'liq to'laganlar", stats.paid, 'green', 'paid'],
    ['💳', 'Umumiy qarzdorlik', money(stats.debt), stats.debt ? 'red' : '', 'debtors'],
  ];
  return (
    <div className="kpis">
      {items.map(([icon, label, value, tone, filter], i) => (
        <button key={i} className="kpi" onClick={() => onPick && onPick(filter)}>
          <span className="kpi-icon" aria-hidden="true">{icon}</span>
          <span className={'kpi-v ' + tone}>{value}</span>
          <span className="kpi-l">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function StudentCard({ s, onClick, checked }) {
  const owes = s.debt > 0;
  const state = payState(s);
  return (
    <div className={'scard' + (checked ? ' checked' : '')} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick && onClick(); } }}>
      <div className="scard-top">
        {checked !== undefined && <span className={'check' + (checked ? ' on' : '')}>{checked ? '✓' : ''}</span>}
        <div className="scard-main">
          <div className="scard-name">{s.fullName}</div>
          <div className="scard-meta">
            <span className="muted">#{s.id}</span>
            <span className="badge">{s.category}</span>
            <span className={s.group ? 'muted' : 'muted dim'}>{s.group ? s.group.name : 'Guruhsiz'}</span>
            {s.registeredAt && <span className="muted">· {dmy(s.registeredAt)}</span>}
          </div>
        </div>
        <div className="scard-side">
          <PaymentStatus s={s} />
          {owes && <div className="scard-debt red">{money(s.debt)}</div>}
        </div>
      </div>
      <div className="scard-money">
        <div><span>Kurs narxi</span><b>{money(s.net)}</b></div>
        <div><span>To'langan</span><b className="green">{money(s.paid)}</b></div>
        <div><span>Qoldiq qarz</span><b className={owes ? 'red' : ''}>{money(s.debt)}</b></div>
      </div>
      <PaymentProgress s={s} />
      {owes && (state === 'overdue' || s.deadline) && (
        <div className={'scard-due ' + (state === 'overdue' ? 'red' : 'muted')}>
          To'lov muddati: {dmy(s.deadline)}{state === 'overdue' ? " · muddati o'tgan" : ''}
          {s.dueNow > 0 && state !== 'overdue' ? ` · hozir to'lanishi kerak: ${money(s.dueNow)}` : ''}
        </div>
      )}
    </div>
  );
}