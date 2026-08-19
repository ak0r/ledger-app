// Generic client of any already-filtered array — used by Account Detail's
// Transactions tab (docs from the product-polish pass: page sizes 20/50,
// default 20). Not wired into the Member-level Transactions page, which
// stays unpaginated (existing behavior, untouched).
export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): PaginationResult<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}
