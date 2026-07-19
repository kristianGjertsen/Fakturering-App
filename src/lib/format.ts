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

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function frequencyLabel(frequency: string, intervalCount = 1) {
  if (frequency === "daily") {
    if (intervalCount === 1) {
      return "Hver dag";
    }

    return `Hver ${intervalCount}. dag`;
  }

  if (frequency === "weekly") {
    if (intervalCount === 1) {
      return "Hver uke";
    }

    if (intervalCount === 2) {
      return "Annenhver uke";
    }

    return `Hver ${intervalCount}. uke`;
  }

  if (intervalCount === 1) {
    return "Hver måned";
  }

  if (intervalCount === 2) {
    return "Annenhver måned";
  }

  return `Hver ${intervalCount}. måned`;
}
