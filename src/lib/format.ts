/**
 * Timestamp formatting — pinned locale + timezone.
 *
 * The previous call sites used `toLocaleString()` with runtime defaults, so
 * rendered times depended on WHERE the code ran: IST locally (Node default)
 * but UTC on Vercel — 5½ hours off — and the server/client disagreement also
 * caused hydration mismatches ("random" times). Vcon's audience is
 * India-first, so every timestamp renders in IST, identically on server and
 * client. Switch the two constants here if that ever changes.
 */

const TIME_ZONE = "Asia/Kolkata";
const LOCALE = "en-IN";

const fmtDateTimeInst = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const fmtDateTimeFullInst = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const fmtTimeInst = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const fmtTimeShortInst = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "24 Oct, 1:02 am" — list rows and comments. */
export function fmtDateTime(iso: string): string {
  return fmtDateTimeInst.format(new Date(iso));
}

/** "24/10/2026, 1:02:40 am" — detail header. */
export function fmtDateTimeFull(iso: string): string {
  return fmtDateTimeFullInst.format(new Date(iso));
}

/** "1:02:42 am" — check start → finish. */
export function fmtTime(iso: string): string {
  return fmtTimeInst.format(new Date(iso));
}

/** "1:02 am" — decision log entries. */
export function fmtTimeShort(iso: string): string {
  return fmtTimeShortInst.format(new Date(iso));
}
