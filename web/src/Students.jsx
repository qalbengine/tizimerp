import { useEffect, useMemo, useRef, useState } from 'react';
import { api, post } from './api.js';
import { Modal, Empty, Skeleton, ErrorState, notify } from './ui.jsx';
import StudentSheet from './StudentSheet.jsx';
import Register from './Register.jsx';
import { StudentStats, StudentCard } from './StudentParts.jsx';
import { STATUS_FILTERS, SORTS, applyFilters, computeStats, statusCounts } from './studentLogic.js';

export { StudentCard };

const PAGE = 40;
const SERVER_LIMIT = 1000;

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
  const [all, setAll] = useState(null);          // serverdan kelgan hamma o'quvchi (statistika shundan)
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');              // debounce qilingan qidiruv
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [group, setGroup] = useState('all');
  const [sort, setSort] = useState('newest');
  const [shown, setShown] = useState(PAGE);
  const [remote, setRemote] = useState(null);    // ro'yxat 1000 dan oshsa: serverdagi qidiruv natijasi
  const [openId, setOpenId] = useState(null);
  const [select, setSelect] = useState(false);
  const [sel, setSel] = useState([]);
  const [picker, setPicker] = useState(false);
  const [reg, setReg] = useState(false);
  const [exporting, setExporting] = useState(false);
  const timer = useRef();

  const load = () => {
    setError('');
    return api('/students?filter=all').then(setAll).catch((e) => { setError(e.message); setAll((x) => x || []); });
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDq(q), 200);
    return () => clearTimeout(timer.current);
  }, [q]);
  useEffect(() => { setShown(PAGE); }, [dq, status, category, group, sort]);

  const truncated = !!all && all.length >= SERVER_LIMIT;
  useEffect(() => {
    if (!truncated || dq.trim().length < 2) { setRemote(null); return; }
    let live = true;
    api(`/students?filter=all&q=${encodeURIComponent(dq.trim())}`).then((r) => live && setRemote(r)).catch(() => live && setRemote(null));
    return () => { live = false; };
  }, [dq, truncated]);

  const base = remote || all || [];
  const stats = useMemo(() => computeStats(all || []), [all]);
  const counts = useMemo(() => statusCounts(all || []), [all]);
  const groups = useMemo(() => {
    const m = new Map();
    (all || []).forEach((s) => s.group && m.set(s.group.id, s.group.name));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'uz', { numeric: true }));
  }, [all]);
  const cats = useMemo(() => [...new Set((all || []).map((s) => s.category))].sort(), [all]);

  const filtered = useMemo(
    () => applyFilters(base, { q: remote ? '' : dq, status, category, group, sort }),
    [base, remote, dq, status, category, group, sort],
  );
  const visible = filtered.slice(0, shown);
  const filtersOn = status !== 'all' || category !== 'all' || group !== 'all' || q.trim() !== '' || sort !== 'newest';
  const reset = () => { setQ(''); setDq(''); setStatus('all'); setCategory('all'); setGroup('all'); setSort('newest'); };

  const toggle = (id) => setSel((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const stopSelect = () => { setSelect(false); setSel([]); };

  async function exportExcel() {
    if (!filtered.length) return notify("Eksport qilinadigan o'quvchi yo'q");
    setExporting(true);
    try {
      await post('/students/export', { ids: filtered.map((s) => s.id) });
      notify(`${filtered.length} ta o'quvchi ro'yxati (Excel/CSV) botga yuborildi`);
    } catch (e) { notify(e.message); }
    setExporting(false);
  }

  return (
    <div className="page wide-page">
      <header className="phead">
        <div>
          <h1>O'quvchilar</h1>
          <div className="muted">O'quvchilarni boshqarish{all ? ` · jami ${all.length} ta` : ''}</div>
        </div>
        {admin && (
          <div className="phead-actions">
            <button className="btn" disabled={exporting || !all} onClick={exportExcel}>⬇ Excel</button>
            <button className="btn primary" onClick={() => setReg(true)}>+ Yangi o'quvchi</button>
          </div>
        )}
      </header>

      {all && !error && <StudentStats stats={stats} onPick={(f) => { setStatus(f); setSel([]); }} />}

      <div className="filters">
        <input className="search" type="search" placeholder="Ism, telefon yoki #ID" aria-label="Qidirish"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="selects">
          <select aria-label="Kategoriya" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Barcha kategoriya</option>
            {cats.map((c) => <option key={c} value={c}>{c} kategoriya</option>)}
          </select>
          <select aria-label="Guruh" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="all">Barcha guruhlar</option>
            {groups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select aria-label="Saralash" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="chips" role="tablist">
          {STATUS_FILTERS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={status === k} className={'chip' + (status === k ? ' on' : '')}
              onClick={() => { setStatus(k); setSel([]); }}>
              {label}{all ? <span className="chip-n">{counts[k]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="listbar">
        <span className="muted">{all ? `Topildi: ${filtered.length}${filtered.length !== (all || []).length ? ` / ${all.length}` : ''}` : ' '}</span>
        <span className="listbar-r">
          {admin && <button className={'btn sm' + (select ? ' primary' : '')} onClick={() => (select ? stopSelect() : setSelect(true))}>{select ? 'Bekor' : 'Belgilash'}</button>}
          {filtersOn && <button className="btn sm" onClick={reset}>Tozalash</button>}
        </span>
      </div>
      {truncated && !remote && <div className="muted pad">Ro'yxat {SERVER_LIMIT} tagacha ko'rsatiladi. Qidirsangiz hammasidan izlanadi.</div>}

      {all === null ? <Skeleton rows={6} />
        : error && !all.length ? <ErrorState text={error} onRetry={load} />
          : filtered.length === 0 ? <Empty text={filtersOn ? "Filtr bo'yicha o'quvchi topilmadi" : "O'quvchi yo'q"} icon="🔍" />
            : (
              <>
                <div className="slist">
                  {visible.map((s) => (
                    <StudentCard key={s.id} s={s} checked={select ? sel.includes(s.id) : undefined}
                      onClick={() => (select ? toggle(s.id) : setOpenId(s.id))} />
                  ))}
                </div>
                {filtered.length > shown && (
                  <button className="btn wide" onClick={() => setShown((n) => n + PAGE)}>
                    Yana {Math.min(PAGE, filtered.length - shown)} ta ko'rsatish ({shown} / {filtered.length})
                  </button>
                )}
              </>
            )}

      {select && (
        <div className="selbar">
          <button className="btn" onClick={() => setSel(sel.length === filtered.length ? [] : filtered.map((s) => s.id))}>
            {sel.length === filtered.length && filtered.length ? 'Tozalash' : `Hammasi (${filtered.length})`}
          </button>
          <button className="btn primary" disabled={!sel.length} onClick={() => setPicker(true)}>
            Guruhga biriktirish ({sel.length})
          </button>
        </div>
      )}

      {picker && <GroupPicker ids={sel} onClose={() => setPicker(false)} onDone={() => { setPicker(false); stopSelect(); load(); }} />}
      {reg && <Register onClose={() => setReg(false)} onChanged={load} onOpen={(id) => setOpenId(id)} />}
      {openId && <StudentSheet id={openId} me={me} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
