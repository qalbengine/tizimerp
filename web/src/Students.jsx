import { useEffect, useRef, useState } from 'react';
import { api, post } from './api.js';
import { fmt, Chips, Modal, Empty, notify } from './ui.jsx';
import StudentSheet from './StudentSheet.jsx';

const FILTERS = [['all', 'Hammasi'], ['grouped', 'Guruhli'], ['ungrouped', 'Guruhsiz'], ['debtors', 'Qarzdor']];

export function StudentCard({ s, onClick, checked }) {
  return (
    <div className="card" onClick={onClick}>
      {checked !== undefined && <span className={'check' + (checked ? ' on' : '')}>{checked ? '✓' : ''}</span>}
      <div className="card-main">
        <div className="card-title">{s.fullName} <span className="badge">{s.category}</span></div>
        <div className="muted">{s.group ? s.group.name : 'Guruhsiz'}{s.instructor ? ` · ${s.instructor.name}` : ''}</div>
      </div>
      <div className={'card-side' + (s.debt > 0 ? ' red' : ' green')}>
        {s.debt > 0 ? fmt(s.debt) : "To'langan"}
      </div>
    </div>
  );
}

function GroupPicker({ ids, onClose, onDone }) {
  const [groups, setGroups] = useState(null);
  const [name, setName] = useState('');
  useEffect(() => { api('/groups').then(setGroups).catch((e) => notify(e.message)); }, []);

  async function assign(groupId) {
    try {
      const r = await post('/students/assign-group', { ids, groupId });
      notify(`${r.count} ta o'quvchi "${r.group}" guruhiga biriktirildi`);
      onDone();
    } catch (e) { notify(e.message); }
  }
  async function createAndAssign() {
    try { const g = await post('/groups', { name }); await assign(g.id); } catch (e) { notify(e.message); }
  }
  return (
    <Modal title={`${ids.length} ta o'quvchi: guruhni tanlang`} onClose={onClose}>
      {groups === null ? <Empty text="Yuklanmoqda…" /> : groups.map((g) => (
        <button key={g.id} className="btn wide" onClick={() => assign(g.id)}>{g.name} ({g.count})</button>
      ))}
      <label className="field"><span>Yangi guruh</span>
        <input value={name} placeholder="Masalan: B-1 dekabr" onChange={(e) => setName(e.target.value)} /></label>
      <button className="btn primary wide" disabled={name.trim().length < 2} onClick={createAndAssign}>Yaratib biriktirish</button>
    </Modal>
  );
}

export default function Students({ me }) {
  const admin = me.role === 'admin';
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [select, setSelect] = useState(false);
  const [sel, setSel] = useState([]);
  const [picker, setPicker] = useState(false);
  const timer = useRef();

  const load = () => {
    const term = q.trim().length >= 2 ? q.trim() : '';
    return api(`/students?filter=${filter}&q=${encodeURIComponent(term)}`).then(setList).catch((e) => notify(e.message));
  };
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, 250);
    return () => clearTimeout(timer.current);
  }, [q, filter]);

  const toggle = (id) => setSel((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const stopSelect = () => { setSelect(false); setSel([]); };

  return (
    <div className="page">
      <div className="topbar">
        <input className="search" placeholder="Ism, telefon yoki #ID" value={q} onChange={(e) => setQ(e.target.value)} />
        {admin && (
          <button className={'btn' + (select ? ' primary' : '')} onClick={() => (select ? stopSelect() : setSelect(true))}>
            {select ? 'Bekor' : 'Belgilash'}
          </button>
        )}
      </div>
      <Chips items={FILTERS} value={filter} onChange={(f) => { setFilter(f); setSel([]); }} />

      {list === null ? <Empty text="Yuklanmoqda…" />
        : list.length === 0 ? <Empty text="O'quvchi topilmadi" />
          : (
            <>
              <div className="muted pad">Jami: {list.length}{list.length >= 300 ? '+' : ''}</div>
              {list.map((s) => (
                <StudentCard key={s.id} s={s} checked={select ? sel.includes(s.id) : undefined}
                  onClick={() => (select ? toggle(s.id) : setOpenId(s.id))} />
              ))}
            </>
          )}

      {select && (
        <div className="selbar">
          <button className="btn" onClick={() => setSel(sel.length === list.length ? [] : list.map((s) => s.id))}>
            {list && sel.length === list.length ? 'Tozalash' : 'Hammasi'}
          </button>
          <button className="btn primary" disabled={!sel.length} onClick={() => setPicker(true)}>
            Guruhga biriktirish ({sel.length})
          </button>
        </div>
      )}

      {picker && <GroupPicker ids={sel} onClose={() => setPicker(false)} onDone={() => { setPicker(false); stopSelect(); load(); }} />}
      {openId && <StudentSheet id={openId} me={me} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
