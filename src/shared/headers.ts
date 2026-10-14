export interface HeaderRow {
  name: string;
  value: string;
}
export function buildHeaders(rows: HeaderRow[]): Record<string, string> {
  const names = new Set<string>();
  const entries = rows
    .filter((row) => row.name.trim() || row.value)
    .map((row) => {
      const name = row.name.trim();
      if (
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
        /[\r\n]/.test(row.value)
      )
        throw new Error("headers.invalid");
      if (names.has(name.toLowerCase())) throw new Error("headers.duplicate");
      names.add(name.toLowerCase());
      return [name, row.value] as const;
    });
  return Object.fromEntries(entries);
}
