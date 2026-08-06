import { getSharedPdfStyles, PDF_HEAD_FONTS, escapeHtml } from '../utils/pdf-shared-styles.util';

interface SummaryPdfData {
  voucherTypeLabel: string; // "আয়ের ভাউচারের সারসংক্ষেপ" | "ব্যয়ের ভাউচারের সারসংক্ষেপ"
  accentColor: string;
  totalVouchers: number;
  totalAmount: string; // already formatted with Bengali numerals
  // The individual line-items shown in the list below the summary
  // stats — already formatted (date/amount) by the caller, same
  // pattern as the rest of this file. Serial numbers are derived from
  // array position at render time, not stored here.
  vouchers: { voucherNumber: string; date: string; amount: string }[];
  // Both optional — only rendered if the corresponding filter was
  // actually applied. Neither includes the raw search term (kept out
  // of the printed document deliberately — it's an exploratory UI
  // filter, not a formal reporting criterion).
  dateRangeLabel?: string; // e.g. "১ জানুয়ারি – ৩১ জানুয়ারি ২০২৬"
  officeName: string;
  constituencyLabel: string;
  signatoryName: string;
  signatoryTitle: string;
  signatoryOrganization: string;
  signatureDataUri?: string;
  secondarySignatoryName: string;
  secondarySignatoryTitle: string;
  secondarySignatoryOrganization: string;
  logoDataUri?: string;
}

export function buildSummaryPdfHtml(data: SummaryPdfData): string {
  // Industry-standard reports always state their scope explicitly —
  // never silently omit the date range or operator criteria just
  // because no filter was applied. "সকল সময়"/"সকল অপারেটর" mirror the
  // same "All Operators" wording already used in the frontend's filter
  // dropdown, keeping the vocabulary consistent across the app.
  const dateRangeText = data.dateRangeLabel ?? 'সকল সময়';

  return `
<!DOCTYPE html>
<html lang="bn">
<head>
${PDF_HEAD_FONTS}
<style>
${getSharedPdfStyles(data.accentColor)}
.criteria-block {
  background: #F7F6F3;
  border-radius: 10px;
  padding: 14px 18px;
  margin-bottom: 24px;
  font-size: 12.5px;
}
.criteria-block div {
  color: #6F6D67;
  margin-bottom: 4px;
}
.criteria-block div:last-child { margin-bottom: 0; }
.criteria-block b { color: #232220; }
.detail-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 24px;
  margin-bottom: 28px;
  font-size: 12px;
}
.detail-table thead {
  /* Repeats this row on every printed page when the table spans
     multiple pages — standard print-CSS behavior, not something that
     needs JS/pagination logic on our side. */
  display: table-header-group;
}
.detail-table th {
  background: ${data.accentColor};
  color: #fff;
  text-align: left;
  padding: 7px 10px;
  font-weight: 700;
}
.detail-table th:last-child,
.detail-table td:last-child {
  text-align: right;
}
.detail-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #E6E4DE;
}
.detail-table tr {
  /* Keeps a single row from being cut in half across a page-break. */
  page-break-inside: avoid;
  break-inside: avoid;
}
.detail-table .total-row td {
  font-weight: 800;
  border-top: 2px solid #232220;
  border-bottom: none;
}
.signature-block {
  /* Overrides the shared 70px value — that gap was sized for the
     much-shorter single-voucher PDF; this document already has a
     stat-table + detail-list above, so less extra space is needed
     here before the signatures. */
  margin-top: 24px !important;
}
</style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      ${data.logoDataUri ? `<img class="logo" src="${data.logoDataUri}" alt="Logo" />` : ""}
      <div class="header-text">
        <div class="office-name">${escapeHtml(data.officeName)}</div>
        <div class="constituency-label">${escapeHtml(data.constituencyLabel)}</div>
      </div>
    </div>
    <div class="voucher-type-row">
      <div class="voucher-type">${escapeHtml(data.voucherTypeLabel)}</div>
    </div>
  </div>

  <div class="criteria-block">
    <div>প্রতিবেদনের সময়কাল: <b>${escapeHtml(dateRangeText)}</b></div>
  </div>

  <table>
    <tr>
      <td class="label-cell">মোট ভাউচার</td>
      <td class="value-cell">${data.totalVouchers.toLocaleString("bn-BD")} টি</td>
    </tr>
    <tr class="amount-row">
      <td class="label-cell">মোট পরিমাণ (টাকা)</td>
      <td class="value-cell">৳ ${escapeHtml(data.totalAmount)}</td>
    </tr>
  </table>

  <table class="detail-table">
    <thead>
      <tr>
        <th>ক্রম</th>
        <th>ভাউচার নং</th>
        <th>তারিখ</th>
        <th>পরিমাণ (৳)</th>
      </tr>
    </thead>
    <tbody>
      ${data.vouchers
        .map(
          (v, i) => `
      <tr>
        <td>${(i + 1).toLocaleString('bn-BD')}</td>
        <td>${escapeHtml(v.voucherNumber)}</td>
        <td>${escapeHtml(v.date)}</td>
        <td>৳ ${escapeHtml(v.amount)}</td>
      </tr>`,
        )
        .join('')}
      <tr class="total-row">
        <td colspan="3">সর্বমোট</td>
        <td>৳ ${escapeHtml(data.totalAmount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="signature-wrapper">
  <div class="signature-block">
    <div class="signature-content">
      <div class="signature-space">
        ${data.signatureDataUri ? `<img class="signature-img" src="${data.signatureDataUri}" alt="Signature" />` : ""}
      </div>
      <div class="signature-line">
        <div class="signature-name">${escapeHtml(data.signatoryName)}</div>
        <div class="signature-detail">${escapeHtml(data.signatoryTitle)}</div>
        <div class="signature-detail">${escapeHtml(data.constituencyLabel)}</div>
        <div class="signature-detail">${escapeHtml(data.signatoryOrganization)}</div>
      </div>
    </div>
    <div class="signature-content">
      <div class="signature-space"></div>
      <div class="signature-line">
        <div class="signature-name">${escapeHtml(data.secondarySignatoryName)}</div>
        <div class="signature-detail">${escapeHtml(data.secondarySignatoryTitle)}</div>
        <div class="signature-detail">${escapeHtml(data.constituencyLabel)}</div>
        <div class="signature-detail">${escapeHtml(data.secondarySignatoryOrganization)}</div>
      </div>
    </div>
  </div>
  </div>
</body>
</html>
`;
}