import { money, fmt, Chips } from './ui.jsx';
import { MODES, BYS, range, shift, bucketLabel } from './periods.js';

export function Kpi({ title, value, tone, hint }) {
  return (
    <div className={'rcard' + (tone ? ' ' + tone : '')}>
      <div className="rcard-t">{title}</div>
      <div className="rcard-v">{money(value)}</div>
      {hint && <div className="rcard-h">{hint}</div>}
    </div>
  );
}

// Davr paneli: Kun / Hafta / Oy / Hammasi + ‹ sana ›
export function PeriodBar({ mode, anchor, onMode, onAnchor }) {
  const r = range(mode, anchor);
  return (
    <div className="pbar">
      <Chips items={MODES} value={mode} onChange={onMode} />
      {mode !== 'all' && (
        <div className="pnav">
          <button className="btn sm" aria-label="Oldingi" onClick={() => onAnchor(shift(mode, anchor, -1))}>‹</button>
          <b>{r.label}</b>
          <button className="btn sm" aria-label="Keyingi" onClick={() => onAnchor(shift(mode, anchor, 1))}>›</button>
        </div>
      )}
    </div>
  );
}

export function ByToggle({ by, onChange }) {
  return <Chips items={BYS} value={by} onChange={onChange} />;
}

// cols: [[sarlavha, maydon, ohang?]]  ohang: 'green' | 'red' | 'strong'
export function SeriesTable({ rows, by, cols }) {
  if (!rows.length) return <div className="muted pad">Bu davrda yozuv yo'q</div>;
  return (
    <div className="rtable" role="table">
      <div className="rrow rhead" role="row">
        <span>Davr</span>{cols.map(([t]) => <span key={t}>{t}</span>)}
      </div>
      {rows.map((r) => (
        <div className="rrow" role="row" key={r.key}>
          <span>{bucketLabel(r.key, by)}</span>
          {cols.map(([t, f, tone]) => (
            <span key={t} className={tone === 'profit' ? (r[f] < 0 ? 'red' : 'green') : tone || ''}>{fmt(r[f])}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
