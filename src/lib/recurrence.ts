import type { RepeatDraft, ScheduleFrequency } from "../types";

const dayMs = 24 * 60 * 60 * 1000;
export const SCHEDULE_RUN_TIME = "03:00";

function parseDateAndTime(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
}

function isoDate(date: Date) {
  return date.toISOString();
}

export function calculateNextRunAt(repeat: RepeatDraft) {
  const start = parseDateAndTime(repeat.startDate, SCHEDULE_RUN_TIME);
  const now = new Date();
  let next = new Date(start);

  if (repeat.frequency === "daily") {
    while (next <= now) {
      next = new Date(next.getTime() + repeat.intervalCount * dayMs);
    }

    return isoDate(next);
  }

  if (repeat.frequency === "weekly") {
    const targetDay = repeat.dayOfWeek === 7 ? 0 : repeat.dayOfWeek;
    const currentDay = next.getDay();
    const daysUntilTarget = (targetDay - currentDay + 7) % 7;
    next = new Date(next.getTime() + daysUntilTarget * dayMs);

    while (next <= now) {
      next = new Date(next.getTime() + repeat.intervalCount * 7 * dayMs);
    }

    return isoDate(next);
  }

  next.setDate(Math.min(repeat.dayOfMonth, daysInMonth(next)));

  while (next <= now) {
    next = addMonths(next, repeat.intervalCount);
    next.setDate(Math.min(repeat.dayOfMonth, daysInMonth(next)));
  }

  return isoDate(next);
}

export function calculateScheduledRunAt(dateValue: string, timeZone = "Europe/Oslo") {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = SCHEDULE_RUN_TIME.split(":").map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0, 0);
  let candidate = new Date(desiredAsUtc);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(candidate);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const representedAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"));
    candidate = new Date(candidate.getTime() + desiredAsUtc - representedAsUtc);
  }

  return candidate.toISOString();
}

export function recurrenceFieldsForFrequency(repeat: RepeatDraft) {
  return {
    day_of_week: repeat.frequency === "weekly" ? repeat.dayOfWeek : null,
    day_of_month: repeat.frequency === "monthly" ? repeat.dayOfMonth : null,
  };
}

export function describeRecurrence(frequency: ScheduleFrequency, dayOfWeek: number | null, dayOfMonth: number | null) {
  if (frequency === "daily") {
    return "Hver dag";
  }

  if (frequency === "weekly") {
    const names: Record<number, string> = {
      1: "mandag",
      2: "tirsdag",
      3: "onsdag",
      4: "torsdag",
      5: "fredag",
      6: "lørdag",
      7: "søndag",
    };
    return `Hver ${names[dayOfWeek ?? 1]}`;
  }

  return `Hver måned den ${dayOfMonth ?? 1}.`;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
