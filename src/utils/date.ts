// Date calculation and formatting helpers for LendFlow
import { addDays, format, parseISO, isBefore, isToday, startOfDay, addMonths } from 'date-fns';
import { InterestType } from '@/types/database';

/**
 * Returns formatted date string in YYYY-MM-DD
 */
export function toISODateString(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Formats ISO string (YYYY-MM-DD) into readable format, e.g. "25 Sep 2026"
 */
export function formatDisplayDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const parsed = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    return format(parsed, 'dd MMM yyyy');
  } catch {
    return dateString;
  }
}

/**
 * Calculates next interest due date based on interval in days or monthly calendar mode
 */
export function calculateNextDueDate(
  currentDueDate: string,
  intervalDays: number,
  interestType: InterestType = 'SIMPLE'
): string {
  const parsed = parseISO(currentDueDate);
  if (interestType === 'MONTHLY_CALENDAR') {
    return format(addMonths(parsed, 1), 'yyyy-MM-dd');
  }
  return format(addDays(parsed, intervalDays), 'yyyy-MM-dd');
}

/**
 * Checks if a due date is in the past compared to today (Asia/Kolkata date)
 */
export function isOverdue(dueDateString: string): boolean {
  if (!dueDateString) return false;
  const parsed = startOfDay(parseISO(dueDateString));
  const today = startOfDay(new Date());
  return isBefore(parsed, today);
}

/**
 * Checks if a due date is exactly today
 */
export function isDueToday(dueDateString: string): boolean {
  if (!dueDateString) return false;
  const parsed = parseISO(dueDateString);
  return isToday(parsed);
}
