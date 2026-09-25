/**
 * Lightweight client-side CSV export utility.
 * No external dependencies required.
 */

export function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) {
    return '""';
  }
  const stringified = String(field);
  // If field contains quotes, commas, or newlines, quote and escape quotes
  if (/[",\r\n]/.test(stringified)) {
    return `"${stringified.replace(/"/g, '""')}"`;
  }
  return `"${stringified}"`;
}

export function generateCsvString(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsvField).join(","));
  return [headerLine, ...dataLines].join("\r\n");
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const csvContent = generateCsvString(headers, rows);

  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
