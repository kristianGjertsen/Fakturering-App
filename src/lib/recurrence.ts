import type { RepeatDraft, ScheduleFrequency } from "../types";

const dayMs = 24 * 60 * 60 * 1000;

function parseDateAndTime(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
}

function isoDate(date: Date) {
  return date.toISOString();
}

export function calculateNextRunAt(repeat: RepeatDraft) {
  const start = parseDateAndTime(repeat.startDate, repeat.sendTime);
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
