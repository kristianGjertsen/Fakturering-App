export function formatCurrency(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysInputValue(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function frequencyLabel(frequency: string, intervalCount = 1) {
  const suffix = intervalCount > 1 ? ` hver ${intervalCount}.` : "";

  if (frequency === "daily") {
    return intervalCount > 1 ? `Daglig${suffix} dag` : "Daglig";
  }

  if (frequency === "weekly") {
    return intervalCount > 1 ? `Ukentlig${suffix} uke` : "Ukentlig";
  }

  return intervalCount > 1 ? `Månedlig${suffix} måned` : "Månedlig";
}
