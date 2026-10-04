import { useState } from 'react';
import { SLOTS, minToTime } from '../lib/dates';

// busy[i]    - termin zajęty
// blocked[i] - niedostępny z innego powodu (np. godzina już minęła)
export default function SlotPicker({ busy, blocked, value, onChange, disabled }) {
  const [picking, setPicking] = useState(false);

  function click(i) {
    if (disabled || busy[i] || blocked[i]) return;

    if (picking && value) {
      const lo = Math.min(value.from, i);
      const hi = Math.max(value.from, i);
      let free = true;
      for (let k = lo; k <= hi; k++) if (busy[k] || blocked[k]) free = false;
      if (free) {
        onChange({ from: lo, to: hi });
        setPicking(false);
        return;
      }
    }
    onChange({ from: i, to: i });
    setPicking(true);
  }

  const hint = disabled
    ? 'Zajmujesz cały dzień, godziny nie są potrzebne.'
    : picking
    ? 'Kliknij godzinę końca albo zostaw jedno pole.'
    : value
    ? 'Kliknij ponownie, żeby wybrać inne godziny.'
    : 'Kliknij godzinę początku.';

  return (
    <div>
      <div className="slots" role="group" aria-label="Godziny" aria-disabled={disabled}>
        {SLOTS.map((s, i) => {
          const on = value && i >= value.from && i <= value.to && !disabled;
          const cls = [
            'slot',
            busy[i] ? 'slot--busy' : '',
            !busy[i] && blocked[i] ? 'slot--past' : '',
            on ? 'slot--on' : '',
            disabled ? 'slot--off' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={s}
              type="button"
              className={cls}
              disabled={disabled || busy[i] || blocked[i]}
              aria-pressed={Boolean(on)}
              aria-label={`${minToTime(s)}${busy[i] ? ', zajęte' : ''}`}
              onClick={() => click(i)}
            >
              {minToTime(s)}
            </button>
          );
        })}
      </div>
      <p className="hint">{hint}</p>
    </div>
  );
}
