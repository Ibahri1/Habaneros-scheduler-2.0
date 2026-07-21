export function upcomingSundays(today = new Date()) {
  const first = new Date(today);
  first.setHours(12, 0, 0, 0);
  first.setDate(first.getDate() + ((7 - first.getDay()) % 7));
  return [0, 1, 2, 3].map((offset) => {
    const date = new Date(first);
    date.setDate(first.getDate() + offset * 7);
    return date;
  });
}

export function toIsoDate(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

export function formatDate(date, locale) {
  return date.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" });
}

export function formatWeek(value, locale) {
  return formatDate(parseLocalDate(value), locale);
}

export function parseLocalDate(value) {
  if (value instanceof Date) {
    const date = new Date(value);
    date.setHours(12, 0, 0, 0);
    return date;
  }
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  const date = year && month && day ? new Date(year, month - 1, day) : new Date();
  date.setHours(12, 0, 0, 0);
  return date;
}

export function mondayWeekStart(value) {
  const date = parseLocalDate(value);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return toIsoDate(date);
}

export function addDays(value, days) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return date;
}
