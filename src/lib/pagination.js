export const ROWS_PER_PAGE = 13;

export function paginateRows(rows, pageSize = ROWS_PER_PAGE) {
  if (rows.length === 0) return [[]];
  const pages = [];
  for (let i = 0; i < rows.length; i += pageSize) {
    pages.push(rows.slice(i, i + pageSize));
  }
  return pages;
}
