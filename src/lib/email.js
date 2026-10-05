import emailjs from '@emailjs/browser';
import { SITE_TITLE } from '../config';
import { formatDayLong, shortTime } from './dates';

// Dane z EmailJS (patrz README). Czytane przy wysyłce, nie przy starcie.
const cfg = () => ({
  serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID,
  templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
});

export const emailConfigured = () => {
  const c = cfg();
  return Boolean(c.serviceId && c.templateId && c.publicKey);
};

export const NOT_CONFIGURED = 'EMAIL_NOT_CONFIGURED';

// Wysyła do znajomego wiadomość o zatwierdzeniu spotkania.
// Rzuca błąd, jeśli się nie uda (wywołujący pokazuje komunikat).
export async function sendAcceptedEmail(booking) {
  if (!emailConfigured()) throw new Error(NOT_CONFIGURED);
  const { serviceId, templateId, publicKey } = cfg();

  const cancelLink = `${window.location.origin}${window.location.pathname}#/anuluj/${booking.cancel_token}`;

  await emailjs.send(
    serviceId,
    templateId,
    {
      to_email: booking.email,
      to_name: booking.name,
      date: formatDayLong(booking.day),
      time: booking.all_day
        ? 'cały dzień'
        : `${shortTime(booking.start_time)}–${shortTime(booking.end_time)}`,
      cancel_link: cancelLink,
      site_title: SITE_TITLE,
    },
    { publicKey }
  );
}
