// Zgłasza nowy zapis botowi Telegram (funkcja booking-bot w Supabase).
// Błędy są ignorowane: zapis jest już w bazie, a Ty i tak zobaczysz go w panelu.
export function notifyNewBooking(token) {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base || !token) return;
  try {
    fetch(`${base}/functions/v1/booking-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'notify', token }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* brak sieci albo blokada: pomijamy */
  }
}
