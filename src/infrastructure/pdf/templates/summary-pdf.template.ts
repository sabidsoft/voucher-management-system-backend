import { getSharedPdfStyles, PDF_HEAD_FONTS, escapeHtml } from '../utils/pdf-shared-styles.util';

interface SummaryPdfData {
  voucherTypeLabel: string; // "আয়ের ভাউচারের সারসংক্ষেপ" | "ব্যয়ের ভাউচারের সারসংক্ষেপ"
  accentColor: string;
  totalVouchers: number;
  totalAmount: string; // already formatted with Bengali numerals
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

  <div class="signature-block">
    <div class="signature-content">
      <div class="signature-space"></div>
      <div class="signature-line">
        <div class="signature-name">${escapeHtml(data.signatoryName)}</div>
        <div class="signature-detail">${escapeHtml(data.signatoryTitle)}</div>
        <div class="signature-detail">${escapeHtml(data.constituencyLabel)}</div>
        <div class="signature-detail">${escapeHtml(data.signatoryOrganization)}</div>
      </div>
    </div>
  </div>
</body>
</html>
`;
}