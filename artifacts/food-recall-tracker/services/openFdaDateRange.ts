export interface OpenFdaReportDateRange {
  from: string;
  to: string;
}

function formatOpenFdaDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function getOpenFdaReportDateRange(now = new Date()): OpenFdaReportDateRange {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const targetDay = to.getUTCDate();
  const from = new Date(to);
  from.setUTCDate(1);
  from.setUTCMonth(from.getUTCMonth() - 6);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0),
  ).getUTCDate();
  from.setUTCDate(Math.min(targetDay, lastDayOfTargetMonth));

  return {
    from: formatOpenFdaDate(from),
    to: formatOpenFdaDate(to),
  };
}

export function addOpenFdaReportDateRange(
  search: string,
  range: OpenFdaReportDateRange,
) {
  return `${search} AND report_date:[${range.from} TO ${range.to}]`;
}