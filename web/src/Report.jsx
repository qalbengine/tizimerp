import { useEffect, useState } from 'react';
import { api } from './api.js';
import { fmt, Chips, Row, Empty, notify } from './ui.jsx';

const PERIODS = [['today', 'Bugun'], ['month', 'Shu oy'], ['all', 'Hammasi']];

function Card({ title, value, tone, hint }) {
  return (
    <div className={'rcard' + (tone ? ' ' + tone : '')}>
      <div className="rcard-t">{title}</div>
      <div className="rcard-v">{fmt(value)}</div>
      {hint && <div className="rcard-h">{hint}</div>}
    </div>
  );
}

export default function Report() {
  const [period, setPeriod] = useState('month');
  const [r, setR] = useState(null);
  useEffect(() => {
    setR(null);
    api(`/report?period=${period}`).then(setR).catch((e) => notify(e.message));
  }, [period]);

  const m = (n) => `${fmt(n)} so'm`;
  return (
    <div className="page">
      <Chips items={PERIODS} value={period} onChange={setPeriod} />
      {!r ? <Empty text="Yuklanmoqda…" icon="⏳" /> : (
        <>
          <div className="rgrid">
            <Card title="Kassaga tushgan" value={r.cashInPeriod} tone="blue" hint="tanlangan davrda" />
            <Card title="Olingan foyda" value={r.receivedProfit} tone={r.receivedProfit < 0 ? 'red' : 'green'} hint="haqiqiy qolgan pul" />
            <Card title="Kutilgan foyda" value={r.expectedProfit} hint="hammasi to'lansa" />
            <Card title="Qarz" value={r.debt} tone={r.debt > 0 ? 'red' : 'green'} hint="o'quvchilardan" />
          </div>

          <div className="block">
            <div className="block-t">🏦 Tashqariga (tashqi to'lov)</div>
            <Row label="O'tkazilishi kerak" value={m(r.extToTransfer)} />
            <Row label="O'tkazilgan" value={m(r.extTransferred)} />
            <Row label="Hali o'tkazilmagan" value={m(r.extBalance)} strong />
          </div>

          <div className="block">
            <div className="block-t">👨‍🏫 Instruktorlar</div>
            <Row label="Hisoblangan" value={m(r.instrAccrued)} />
            <Row label="To'langan" value={m(r.instrPaid)} />
            <Row label="Hali to'lanmagan" value={m(r.instrOwed)} strong />
          </div>

          <div className="block">
            <div className="block-t">📈 Foyda qanday chiqdi</div>
            <Row label="Markazda qolgan pul" value={m(r.centerIncome)} />
            <Row label="− To'langan instruktor" value={m(r.instrPaid)} />
            <Row label="= Olingan foyda" value={m(r.receivedProfit)} strong />
            <Row label="Chegirmalar jami" value={m(r.discounts)} />
            <Row label="O'quvchilar (davrda ro'yxatga olingan)" value={r.count} />
          </div>
          <div className="hint">Olingan foyda, kutilgan foyda, qarz va tashqi/instruktor hisoblari shu davrda ro'yxatga olingan o'quvchilar bo'yicha; "Kassaga tushgan" esa davrdagi barcha to'lovlar.</div>
        </>
      )}
    </div>
  );
}