import { useState } from 'react';
import { Chips } from './ui.jsx';
import { PeriodBar } from './ReportParts.jsx';
import Overview from './ReportOverview.jsx';
import Groups from './ReportGroups.jsx';
import Instructors from './ReportInstructors.jsx';
import Expenses from './ReportExpenses.jsx';

const TABS = [['all', 'Umumiy'], ['groups', 'Guruhlar'], ['instr', 'Instruktorlar'], ['exp', 'Xarajatlar']];

export default function Report() {
  const [tab, setTab] = useState('all');
  const [mode, setMode] = useState('month');
  const [anchor, setAnchor] = useState(new Date());

  return (
    <div className="page wide-page">
      <header className="phead">
        <div>
          <h1>Hisobot</h1>
          <div className="muted">Pul qayerdan kelib, qayerga ketdi</div>
        </div>
      </header>
      <Chips items={TABS} value={tab} onChange={setTab} />
      {tab !== 'groups' && <PeriodBar mode={mode} anchor={anchor} onMode={(m) => { setMode(m); setAnchor(new Date()); }} onAnchor={setAnchor} />}
      {tab === 'all' && <Overview mode={mode} anchor={anchor} />}
      {tab === 'groups' && <Groups />}
      {tab === 'instr' && <Instructors mode={mode} anchor={anchor} />}
      {tab === 'exp' && <Expenses mode={mode} anchor={anchor} />}
    </div>
  );
}
