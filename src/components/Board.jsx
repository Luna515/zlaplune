import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import {
  dayHasPending,
  dayKey,
  monthDays,
  monthLead,
  monthRange,
  monthTitle,
  parseISO,
  todayISO,
  toInterval,
} from '../lib/dates';
import Calendar from './Calendar';
import DayPanel from './DayPanel';
import PendingList from './PendingList';

// mode = 'public' (znajomi) albo 'admin' (Ty, po zalogowaniu)
export default function Board({ mode }) {
  const isAdmin = mode === 'admin';
  const today = todayISO();
  const now = new Date();

  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [rows, setRows] = useState([]);
  const [pendingItems, setPendingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [version, setVersion] = useState(0);
  const panelRef = useRef(null);

  const [from, to] = useMemo(() => monthRange(ym.y, ym.m), [ym]);
  const days = useMemo(() => monthDays(ym.y, ym.m), [ym]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    (async () => {
      const res = isAdmin
        ? await supabase
            .from('bookings')
            .select('*')
            .gte('day', from)
            .lte('day', to)
            .order('day')
            .order('start_time')
        : await supabase.rpc('busy_slots', { p_from: from, p_to: to });
      if (cancelled) return;
      if (res.error) setLoadError('Nie udało się wczytać kalendarza. Odśwież stronę.');
      else setRows(res.data || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, isAdmin, version]);

  // admin: wszystkie oczekujące prośby, niezależnie od miesiąca
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    supabase
      .from('bookings')
      .select('*')
      .eq('status', 'pending')
      .order('day')
      .order('start_time')
      .then(({ data }) => {
        if (!cancelled) setPendingItems(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, version]);

  useEffect(() => {
    if (isAdmin) return;
    supabase.rpc('requires_code').then(({ data }) => setNeedsCode(Boolean(data)));
  }, [isAdmin]);

  const rowsByDay = useMemo(() => {
    const map = {};
    for (const r of rows) (map[r.day] ||= []).push(r);
    return map;
  }, [rows]);

  const { statusByDay, pendingByDay } = useMemo(() => {
    const status = {};
    const pending = {};
    for (const iso of days) {
      const intervals = (rowsByDay[iso] || []).map(toInterval);
      status[iso] = dayKey(intervals);
      pending[iso] = dayHasPending(intervals);
    }
    return { statusByDay: status, pendingByDay: pending };
  }, [days, rowsByDay]);

  function selectDay(iso) {
    setSelected(iso);
    if (window.matchMedia('(max-width: 899px)').matches) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(
        () => panelRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }),
        50
      );
    }
  }

  function jumpTo(iso) {
    const d = parseISO(iso);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    selectDay(iso);
  }

  function shift(delta) {
    const d = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(null);
  }

  const curMonth = now.getFullYear() * 12 + now.getMonth();
  const shown = ym.y * 12 + ym.m;
  const canPrev = isAdmin || shown > curMonth;
  const canNext = isAdmin || shown < curMonth + 12;

  return (
    <>
      {isAdmin && <PendingList items={pendingItems} onPick={jumpTo} />}
      <div className="board">
        <div>
          <Calendar
            title={monthTitle(ym.y, ym.m)}
            lead={monthLead(ym.y, ym.m)}
            days={days}
            statusByDay={statusByDay}
            pendingByDay={pendingByDay}
            loading={loading}
            selected={selected}
            today={today}
            lockPast={!isAdmin}
            onSelect={selectDay}
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
            canPrev={canPrev}
            canNext={canNext}
          />
          {loadError && (
            <p className="msg msg--error" role="alert">
              {loadError}
            </p>
          )}
        </div>

        <div ref={panelRef} className="panel-wrap">
          {selected ? (
            <DayPanel
              key={selected}
              iso={selected}
              rows={rowsByDay[selected] || []}
              isAdmin={isAdmin}
              needsCode={needsCode}
              onChanged={() => setVersion((v) => v + 1)}
            />
          ) : (
            <div className="panel panel--empty">
              <p>Wybierz dzień w kalendarzu.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
