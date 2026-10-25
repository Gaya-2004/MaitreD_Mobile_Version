/**
 * Unified Date & Time utilities.
 *
 * Backend datetimes are stored in UTC (e.g. SQLite/Postgres `datetime.utcnow()`),
 * and returned as naive strings without 'Z' (e.g. "2026-10-13T05:50:00" or "2026-10-13 05:50:00").
 * When standard JavaScript Date parses a datetime string without 'Z', ECMAScript parses
 * it as local device time, causing a 5-hour-30-minute discrepancy in India (UTC+5:30).
 *
 * These utilities ensure naive UTC dates from the backend are correctly parsed as UTC
 * and rendered accurately in the user's local timezone (e.g. IST).
 */

export function parseDate(dateInput?: string | number | Date | null): Date {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? new Date() : dateInput;
  if (typeof dateInput === 'number') {
    return new Date(dateInput < 1e11 ? dateInput * 1000 : dateInput);
  }

  let str = String(dateInput).trim();
  if (!str) return new Date();

  // Pure digits: epoch timestamp in ms or seconds
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    return new Date(num < 1e11 ? num * 1000 : num);
  }

  // Replace space with 'T' if format is "YYYY-MM-DD HH:mm:ss..."
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(str)) {
    str = str.replace(' ', 'T');
  }

  // If ISO string without timezone offset or trailing 'Z', append 'Z' so JS treats it as UTC
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
    if (!str.endsWith('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(str)) {
      str += 'Z';
    }
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function formatTime(dateInput?: string | number | Date | null): string {
  const d = parseDate(dateInput);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m < 10 ? '0' + m : m} ${ampm}`;
}

export function formatDateTime(dateInput?: string | number | Date | null): string {
  const d = parseDate(dateInput);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${date} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
}

export function formatDateOnly(dateInput?: string | number | Date | null): string {
  const d = parseDate(dateInput);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatOrderDate(dateInput?: string | number | Date | null): string {
  const d = parseDate(dateInput);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const timeStr = `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m} ${ampm}`;

  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}, ${timeStr}`;
}

