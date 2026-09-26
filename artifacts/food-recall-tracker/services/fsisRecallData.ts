export interface NormalizedFsisRecall {
  id: string;
  productName: string;
  companyName: string;
  reason: string;
  date: string;
  classification: string;
  summary: string;
  officialUrl: string;
  recallType: string;
  relatedToOutbreak: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function textValue(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const values = value
      .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''))
      .filter(Boolean);
    if (values.length > 0) return values.join(', ');
  }
  return fallback;
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|li)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isActiveRecall(record: Record<string, unknown>, recallType: string) {
  if (/active/i.test(recallType)) return true;
  return /^(1|true|yes)$/i.test(textValue(record.field_active_notice, ''));
}

function isRelatedToOutbreak(value: unknown) {
  if (typeof value === 'boolean') return value;
  return /^(1|true|yes)$/i.test(textValue(value, ''));
}

function isRecentRecall(date: string, now: number) {
  const parsed = new Date(date).getTime();
  const yearAgo = now - 365 * 24 * 60 * 60 * 1000;
  return !Number.isNaN(parsed) && parsed >= yearAgo && parsed <= now + 24 * 60 * 60 * 1000;
}

function inferCompanyName(title: string) {
  const match = title.match(/^(.+?)\s+recalls?\b/i);
  return match && !/^(?:FSIS|USDA|FDA)\b/i.test(match[1])
    ? match[1].trim()
    : 'Company not provided';
}

export function normalizeFsisRecallRecords(payload: unknown, now = Date.now()) {
  if (!Array.isArray(payload)) return [];

  return payload
    .filter(isRecord)
    .map((record, index): NormalizedFsisRecall | null => {
      const productName = textValue(record.field_title, 'Product name unavailable');
      const companyName = textValue(
        record.field_establishment,
        inferCompanyName(productName),
      );
      const reason = textValue(record.field_recall_reason, 'Reason not provided');
      const date = textValue(record.field_recall_date, 'Date not provided');
      const summary = stripHtml(textValue(record.field_summary, 'Summary not provided'));
      const officialUrl = textValue(
        record.field_recall_url,
        'https://www.fsis.usda.gov/recalls',
      ).replace(/^http:\/\//i, 'https://');
      const recallType = textValue(record.field_recall_type, 'Active Recall');
      const id = textValue(
        record.field_recall_number_export ?? record.field_recall_number ?? record.nid,
        `${productName}|${date}|${officialUrl}|${index}`,
      );

      if (!isActiveRecall(record, recallType) || !isRecentRecall(date, now)) return null;

      return {
        id,
        productName,
        companyName,
        reason,
        date,
        classification: textValue(record.field_recall_classification, 'Classification not provided'),
        summary,
        officialUrl,
        recallType,
        relatedToOutbreak: isRelatedToOutbreak(record.field_related_to_outbreak),
      };
    })
    .filter((recall): recall is NormalizedFsisRecall => recall !== null);
}