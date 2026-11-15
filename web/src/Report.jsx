import { useEffect, useState } from 'react';
import { api } from './api.js';
import { fmt, Chips, Row, Empty, notify } from './ui.jsx';

const PERIODS = [['today', 'Bugun'], ['month', 'Shu oy'], ['all', 'Hammasi']];

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
      {!r ? <Empty text="Yuklanmoqda…" /> : (
        <div className="block">
          <Row label="Kassaga tushgan (davrda)" value={m(r.cashInPeriod)} strong />
          <Row label="Tashqariga o'tkazilishi kerak" value={m(r.extToTransfer)} />
          <Row label="Tashqariga o'tkazilgan" value={m(r.extTransferred)} />
          <Row label="Instruktorga hisoblangan" value={m(r.instrAccrued)} />
          <Row label="Instruktorga to'langan" value={m(r.instrPaid)} />
          <Row label="Chegirmalar jami" value={m(r.discounts)} />
          <Row label="Kutilgan foyda" value={m(r.expectedProfit)} strong />
          <Row label="Olingan foyda" value={m(r.receivedProfit)} strong />
          <Row label="Qarz" value={m(r.debt)} strong />
          <Row label="O'quvchilar (shu davrda ro'yxatga olingan)" value={r.count} />
        </div>
      )}
    </div>
  );
}
