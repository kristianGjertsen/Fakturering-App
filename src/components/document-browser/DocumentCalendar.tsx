import { useMemo, useState } from "react";
import { Button } from "../Button";
import { formatCurrency } from "../../lib/format";
import { statusToneClasses } from "./DocumentList";
import type { DocumentBrowserItem } from "./types";

type DocumentCalendarProps = {
  items: DocumentBrowserItem[];
  selectedId: string;
  onSelect: (id: string) => void;
};

const WEEKDAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const monthFormatter = new Intl.DateTimeFormat("nb-NO", {
  month: "long",
  year: "numeric",
});

export function DocumentCalendar({ items, selectedId, onSelect }: DocumentCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const itemsByDate = useMemo(() => groupItemsByDate(items), [items]);
  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth]);

  function changeMonth(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-4 pt-1">
        <div>
          <h3 className="text-base font-semibold capitalize text-slate-950">
            {monthFormatter.format(visibleMonth)}
          </h3>
          <p className="text-xs text-slate-500">
            Fakturadatoer og planlagte utsendinger
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" aria-label="Forrige måned" onClick={() => changeMonth(-1)}>
            ←
          </Button>
          <Button variant="secondary" size="xs" onClick={() => setVisibleMonth(startOfMonth(new Date()))}>
            I dag
          </Button>
          <Button variant="ghost" size="xs" aria-label="Neste måned" onClick={() => changeMonth(1)}>
            →
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-blue-100">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b border-blue-100 bg-slate-50">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="px-2 py-2 text-center text-xs font-semibold text-slate-500">
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 bg-blue-100/70 gap-px">
            {days.map((day) => {
              const dateKey = toDateKey(day);
              const dayItems = itemsByDate.get(dateKey) ?? [];
              const inVisibleMonth = day.getMonth() === visibleMonth.getMonth();
              const today = dateKey === toDateKey(new Date());

              return (
                <div
                  key={dateKey}
                  className={`min-h-28 bg-white p-1.5 ${inVisibleMonth ? "" : "bg-slate-50/80"}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                      today
                        ? "bg-blue-700 text-white"
                        : inVisibleMonth
                          ? "text-slate-700"
                          : "text-slate-400"
                    }`}>
                      {day.getDate()}
                    </span>
                    {dayItems.length > 3 && (
                      <span className="text-[10px] font-medium text-slate-400">+{dayItems.length - 3}</span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {dayItems.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`w-full rounded border px-1.5 py-1 text-left transition ${
                          selectedId === item.id
                            ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                            : "border-blue-100 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                        }`}
                        title={`${item.title} – ${item.statusLabel}`}
                        onClick={() => onSelect(item.id)}
                      >
                        <span className="block truncate text-[11px] font-semibold text-slate-900">
                          {item.title}
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-1">
                          <span className={`truncate rounded px-1 py-0.5 text-[9px] font-semibold ring-1 ${
                            statusToneClasses[item.statusTone ?? "neutral"]
                          }`}>
                            {item.statusLabel}
                          </span>
                          <span className="truncate text-[9px] text-slate-500">
                            {formatCurrency(item.amount)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function groupItemsByDate(items: DocumentBrowserItem[]) {
  const groups = new Map<string, DocumentBrowserItem[]>();

  for (const item of items) {
    const dateKey = item.date ? dateValueToKey(item.date) : null;
    if (!dateKey) continue;
    const dateItems = groups.get(dateKey) ?? [];
    dateItems.push(item);
    groups.set(dateKey, dateItems);
  }

  return groups;
}

function calendarDays(month: Date) {
  const firstDay = startOfMonth(month);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const firstCalendarDay = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => (
    new Date(firstCalendarDay.getFullYear(), firstCalendarDay.getMonth(), firstCalendarDay.getDate() + index)
  ));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateValueToKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : toDateKey(date);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
