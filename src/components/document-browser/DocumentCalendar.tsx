import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../AnimatedIconButton";
import { Button } from "../Button";
import { formatCurrency } from "../../lib/format";
import { getStatusColorClasses } from "./statusColors";
import type { DocumentBrowserItem, StatusTone } from "./types";

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
const STATUS_ORDER = [
  "Utkast",
  "Klar",
  "Planlagt",
  "Sendt",
  "Purret",
  "Betalt",
  "Forfalt",
  "Kansellert",
];
export function DocumentCalendar({ items, selectedId, onSelect }: DocumentCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const itemsByDate = useMemo(() => groupItemsByDate(items), [items]);
  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth]);
  const legendItems = useMemo(() => {
    const statuses = new Map<string, StatusTone>();

    for (const item of items) {
      if (!statuses.has(item.statusLabel)) {
        statuses.set(item.statusLabel, item.statusTone ?? "neutral");
      }
    }

    return [...statuses].sort(
      ([left], [right]) => statusOrder(left) - statusOrder(right),
    );
  }, [items]);

  function changeMonth(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-3 pt-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2">
          <div>
            <h3 className="text-base font-semibold capitalize text-slate-950">
              {monthFormatter.format(visibleMonth)}
            </h3>
            <p className="text-xs text-slate-500">
              Fakturadatoer og planlagte utsendinger
            </p>
          </div>
          {legendItems.length > 0 && (
            <div
              aria-label="Fargeforklaring for statuser"
              className="flex flex-wrap items-center gap-2"
            >
              {legendItems.map(([label, tone]) => (
                <span
                  key={label}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-semibold text-slate-800 shadow-sm ${
                    getStatusColorClasses(tone).surface
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-4 rounded border-2 border-current bg-current`}
                  />
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <AnimatedIconButton
            icon={ArrowLeft}
            iconSize={16}
            variant="ghost"
            size="xs"
            aria-label="Forrige måned"
            onClick={() => changeMonth(-1)}
          >
            <span className="sr-only">Forrige måned</span>
          </AnimatedIconButton>
          <Button variant="secondary" size="xs" onClick={() => setVisibleMonth(startOfMonth(new Date()))}>
            I dag
          </Button>
          <AnimatedIconButton
            icon={ArrowRight}
            iconSize={16}
            variant="ghost"
            size="xs"
            aria-label="Neste måned"
            onClick={() => changeMonth(1)}
          >
            <span className="sr-only">Neste måned</span>
          </AnimatedIconButton>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-blue-100">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b border-blue-100 bg-slate-50">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="px-2 py-1.5 text-center text-[11px] font-semibold text-slate-500">
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
                  className={`min-h-[84px] bg-white p-1 ${inVisibleMonth ? "" : "bg-slate-50/80"}`}
                >
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className={`flex size-5 items-center justify-center rounded-full text-[10px] font-semibold ${
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

                  <div className="space-y-0.5">
                    {dayItems.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`flex h-9 w-full items-center gap-2 rounded-md border-2 px-2 text-left shadow-sm transition ${
                          getStatusColorClasses(item.statusTone).surface
                        } ${
                          selectedId === item.id
                            ? "ring-2 ring-blue-500"
                            : "hover:brightness-95"
                        }`}
                        title={`${item.title} – ${item.statusLabel}`}
                        onClick={() => onSelect(item.id)}
                      >
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-none text-slate-950">
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold leading-none text-slate-600">
                          {formatCurrency(item.amount)}
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

function statusOrder(label: string) {
  const index = STATUS_ORDER.indexOf(label);
  return index === -1 ? STATUS_ORDER.length : index;
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
