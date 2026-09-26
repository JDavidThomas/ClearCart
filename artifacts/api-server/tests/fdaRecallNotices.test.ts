import assert from "node:assert/strict";
import test from "node:test";
import { parseFdaRecallNoticeSearchResults } from "../src/lib/fdaRecallNotices.ts";

test("FDA recall notices preserve brand, product, company, date, and official link", () => {
  const html = `
    <table><tbody><tr>
      <td class="views-field views-field-field-change-date-2">
        <time datetime="2026-08-29T04:00:00Z">08/29/2026</time>
      </td>
      <td class="views-field views-field-brand-name">
        <a href="/safety/recalls-market-withdrawals-safety-alerts/panorama-produce-recalls-mangoes">Martina</a>
      </td>
      <td class="views-field views-field-field-product-description-1">Mangoes</td>
      <td class="views-field views-field-field-recall-reason-description-1">Potential contamination with Salmonella</td>
      <td class="views-field views-field-company-name">Panorama Produce</td>
      <td class="views-field views-field-field-terminated-recall"></td>
    </tr></tbody></table>
  `;

  assert.deepEqual(parseFdaRecallNoticeSearchResults(html), [
    {
      productDescription: "Martina Mangoes",
      reasonForRecall: "Potential contamination with Salmonella",
      recallingFirm: "Panorama Produce",
      recallDate: "2026-08-29T04:00:00Z",
      classification: "See official FDA notice",
      status: undefined,
      officialUrl:
        "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/panorama-produce-recalls-mangoes",
    },
  ]);
});

test("terminated FDA notice rows are excluded from active notice results", () => {
  const html = `
    <table><tbody><tr>
      <td class="views-field views-field-field-change-date-2">08/01/2026</td>
      <td class="views-field views-field-brand-name">Old Brand</td>
      <td class="views-field views-field-field-product-description-1">Crackers</td>
      <td class="views-field views-field-company-name">Example Foods</td>
      <td class="views-field views-field-field-terminated-recall">Terminated</td>
    </tr></tbody></table>
  `;

  assert.deepEqual(parseFdaRecallNoticeSearchResults(html), []);
});