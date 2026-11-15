import { useEffect, useState } from 'react';
import { api } from './api.js';
import { fmt, dmy, Chips, Empty, notify } from './ui.jsx';
import StudentSheet from './StudentSheet.jsx';

export function Debts({ me }) {
  const admin = me.role === 'admin';
  const [mode, setMode] = useState('debtors');
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = () => {
    setList(null);
    return api(mode === 'debtors' ? '/debtors' : '/expiring?days=7').then(setList).catch((e) => notify(e.message));
  };
  useEffect(() => { load(); }, [mode]);

  const total = (list || []).reduce((a, s) => a + s.debt, 0);

  return (
    <div className="page">
      {admin && <Chips items={[['debtors', 'Qarzdorlar'], ['expiring', 'Muddati tugayotgan']]} value={mode} onChange={setMode} />}
      {list === null ? <Empty text="Yuklanmoqda…" />
        : list.length === 0 ? <Empty text={mode === 'debtors' ? "Qarzdor yo'q" : "7 kun ichida muddati tugaydigan o'quvchi yo'q"} />
          : (
            <>
              <div className="muted pad">{list.length} ta{mode === 'debtors' ? ` · jami ${fmt(total)} so'm` : ''}</div>
              {list.map((s) => (
                <div key={s.id} className="card" onClick={() => setOpenId(s.id)}>
                  <div className="card-main">
                    <div className="card-title">{s.fullName} <span className="badge">{s.category}</span></div>
                    <div className="muted">
                      {mode === 'expiring'
                        ? <>{s.overdue ? <b className="red">MUDDAT O'TGAN · </b> : ''}muddat {dmy(s.deadline)}{s.instructor ? ` · ${s.instructor.name}` : ''}</>
                        : <>{s.dueNow > 0 ? <b className="red">muddatli {fmt(s.dueNow)} · </b> : ''}{s.group ? s.group.name : 'Guruhsiz'}</>}
                    </div>
                  </div>
                  <div className="card-side red">{fmt(s.debt)}</div>
                </div>
              ))}
            </>
          )}
      {openId && <StudentSheet id={openId} me={me} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
