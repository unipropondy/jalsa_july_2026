/**
 * Timezone utilities to enforce Asia/Singapore (SGT) timezone in the frontend.
 */

export function getSingaporeDateString(date: Date = new Date()): string {
  // Returns "YYYY-MM-DD" in Asia/Singapore
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function getSingaporeDateTimeString(date: Date = new Date()): string {
  // Returns "YYYY-MM-DD HH:mm:ss" in Asia/Singapore
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
  let hour = getPart('hour');
  if (hour === '24') hour = '00';
  return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${hour}:${getPart('minute')}:${getPart('second')}`;
}

export function formatToSingaporeDate(
  dateInput: Date | string | number,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
): string {
  if (!dateInput) return "";
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    ...options
  }).format(date);
}

export function formatToSingaporeTime(
  dateInput: Date | string | number,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true }
): string {
  if (!dateInput) return "";
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    ...options
  }).format(date);
}

export function formatToSingaporeDateTime(dateInput: Date | string | number): string {
  if (!dateInput) return "";
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "";
  const dateStr = formatToSingaporeDate(date, { day: 'numeric', month: 'short' });
  const timeStr = formatToSingaporeTime(date, { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${dateStr} • ${timeStr}`;
}

export function formatToSingaporeDateTime12h(dateInput: Date | string | number): string {
  if (!dateInput) return "";
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).formatToParts(date);
  
  const day = parts.find(p => p.type === 'day')?.value || '01';
  const month = parts.find(p => p.type === 'month')?.value || 'Jan';
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  const hour = parts.find(p => p.type === 'hour')?.value || '12';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || 'AM';
  
  return `${day}-${month}-${year} ${hour}:${minute} ${dayPeriod}`;
}
