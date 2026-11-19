import { useEffect, useState } from 'react';
import { api, post } from './api.js';
import { money, dmy, PromptModal, Skeleton, ErrorState, Empty, notify } from './ui.jsx';
import { range, ymd } from './periods.js';
import { Kpi } from './ReportParts.jsx';

const today = () => ymd(new Date());

export default function Expenses({ mode, anchor }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [dlg, setDlg] = useState(null);
  const r = range(mode, anchor);
  const load = () => {
    setErr('');
    return api(`/expenses?from=${r.from}&to=${r.to}`).then(setD).catch((e) => setErr(e.message));
  };
  useEffect(() => { setD(null); load(); }, [r.from, r.to]);

  if (err) return <ErrorState text={err} onRetry={load} />;
  if (!d) return <Skeleton rows={3} />;

  // kunlar bo'yicha guruhlash
  const days = [];
  for (const e of d.items) {
    const k = ymd(new Date(e.spentAt));
    let g = days[days.length - 1];
    if (!g || g.key !== k) { g = { key: k, date: e.spentAt, sum: 0, items: [] }; days.push(g); }
    g.items.push(e); g.sum += e.amount;
  }
  return (
    <>
      <div className="rgrid">
        <Kpi title="Xarajat jami" value={d.total} tone={d.total ? 'red' : ''} hint={`${d.count} ta yozuv`} />
        <button className="rcard add" onClick={() => setDlg('add')}><span className="plus">＋</span>Xarajat qo'shish</button>
      </div>

      {d.byCategory.length > 0 && (
        <div className="block">
          <div className="block-t">Turlar bo'yicha</div>
          {d.byCategory.map((c) => (
            <div className="kv" key={c.category}>
              <span>{c.category}</span>
              <span><b>{money(c.sum)}</b> <span className="muted">· {Math.round((c.sum / d.total) * 100)}%</span></span>
            </div>
          ))}
        </div>
      )}

      {days.length === 0 ? <Empty icon="🧾" text="Bu davrda xarajat yo'q" /> : days.map((g) => (
        <div className="block" key={g.key}>
          <div className="kv"><b>{dmy(g.date)}</b><b>{money(g.sum)}</b></div>
          {g.items.map((e) => (
            <div className="pay" key={e.id}>
              <div>
                <b>{e.category}</b> · {money(e.amount)}
                {e.note && <div className="muted">{e.note}</div>}
              </div>
              <button className="btn sm danger" onClick={() => setDlg({ cancel: e })}>Bekor</button>
            </div>
          ))}
        </div>
      ))}

      {dlg === 'add' && (
        <PromptModal title="Xarajat qo'shish" submitText="Saqlash" onClose={() => setDlg(null)}
          fields={[
            { name: 'amount', label: "Summa (so'm)", type: 'number', placeholder: '300000' },
            { name: 'category', label: 'Turi', type: 'select', options: d.categories.map((c) => [c, c]) },
            { name: 'note', label: 'Izoh (ixtiyoriy)', placeholder: 'Masalan: noyabr oyi ijarasi' },
            { name: 'date', label: 'Sana', type: 'date', value: today() },
          ]}
          onSubmit={async (v) => {
            await post('/expenses', { amount: Number(String(v.amount).replace(/\D/g, '')), category: v.category || d.categories[0], note: v.note, date: v.date || today() });
            notify("Xarajat qo'shildi"); await load();
          }} />
      )}
      {dlg && dlg.cancel && (
        <PromptModal title={`Bekor qilish: ${dlg.cancel.category} · ${money(dlg.cancel.amount)}`} submitText="Bekor qilish" onClose={() => setDlg(null)}
          fields={[{ name: 'reason', label: 'Sababi', placeholder: 'Masalan: xato kiritilgan' }]}
          onSubmit={async (v) => { await post(`/expenses/${dlg.cancel.id}/cancel`, { reason: v.reason }); await load(); }} />
      )}
    </>
  );
}
