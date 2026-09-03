const SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

/** Money is stored in minor units everywhere; format only at the edge. */
export function formatMoney(minor: number, currency = "GBP"): string {
  const symbol = SYMBOLS[currency] ?? "";
  return `${symbol}${(minor / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function parseMoney(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function timeLeft(endsAt: string | null): string {
  if (!endsAt) return "";
  const ms = Date.parse(endsAt) - Date.now();
  if (ms <= 0) return "Ended";
  const days = Math.floor(ms / 864e5);
  const hours = Math.floor((ms % 864e5) / 36e5);
  const minutes = Math.floor((ms % 36e5) / 6e4);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
