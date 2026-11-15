import { useEffect, useState } from 'react';
import { api } from './api.js';
import { tg } from './ui.jsx';
import Students from './Students.jsx';
import { Debts } from './Lists.jsx';
import Report from './Report.jsx';
import Manage from './Manage.jsx';

export default function App() {
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('students');

  useEffect(() => {
    if (tg) { tg.ready(); tg.expand(); }
    api('/me').then(setMe).catch((e) => setErr(e.message));
  }, []);

  if (err) {
    return <div className="center"><b>{err}</b><p>Ilovani botdagi "Ilova" tugmasi orqali oching.</p></div>;
  }
  if (!me) return <div className="center">Yuklanmoqda…</div>;

  const admin = me.role === 'admin';
  const tabs = [['students', "O'quvchilar"], ['debts', 'Qarzdorlar'], ...(admin ? [['report', 'Hisobot'], ['manage', 'Boshqaruv']] : [])];

  return (
    <div className="app">
      <main>
        {tab === 'students' && <Students me={me} />}
        {tab === 'debts' && <Debts me={me} />}
        {tab === 'report' && admin && <Report />}
        {tab === 'manage' && admin && <Manage />}
      </main>
      <nav className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}
