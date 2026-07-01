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

export function formatDate(date) {
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export function formatWeek(value) {
  return formatDate(new Date(value + "T12:00:00"));
}
