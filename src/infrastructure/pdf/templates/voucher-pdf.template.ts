import { getSharedPdfStyles, PDF_HEAD_FONTS, escapeHtml } from '../utils/pdf-shared-styles.util';

interface VoucherPdfData {
  voucherTypeLabel: string; // "আয়ের ভাউচার" | "ব্যয়ের ভাউচার"
  accentColor: string; // e.g. "#2F5FD6" (income) or "#C0503A" (expense)
  voucherNumber: string;
  date: string; // already formatted, e.g. "২৫ জুলাই ২০২৬"
  amount: string; // already formatted with Bengali numerals, e.g. "১০,০০০.০০"
  categoryLabel: string; // "আয়ের উৎস" | "ব্যয়ের খাত"
  categoryValue: string;
  description: string;
  // Formatted date+time (e.g. "০৫ আগস্ট ২০২৬, ১০:৩২ AM") — when the
  // voucher record was actually created, distinct from `date` above
  // (the business/voucher date, user-entered, no time component).
  createdAt: string;
  operatorName: string;
  officeName: string;
  constituencyLabel: string;
  signatoryName: string;
  signatoryTitle: string;
  signatoryOrganization: string;
  // Same optional-data-URI pattern as logoDataUri below — kept
  // optional so the signature-space still renders (blank, for a
  // physical pen-signature) if no image is provided.
  signatureDataUri?: string;
  // Second signatory (the MP) — sits on the RIGHT side of the
  // signature-block, deliberately with NO signatureDataUri: this is
  // signed by hand, not pre-filled. Reuses constituencyLabel above
  // rather than duplicating it, since both signatories share the same
  // constituency.
  secondarySignatoryName: string;
  secondarySignatoryTitle: string;
  secondarySignatoryOrganization: string;
  // A complete data URI (e.g. "data:image/webp;base64,...."), already
  // encoded by the caller — kept optional so the header still renders
  // cleanly if no logo file exists yet.
  logoDataUri?: string;
}

// Builds the full HTML document Puppeteer renders to PDF. Bengali text
// is embedded via Google Fonts' Noto Sans Bengali — requires the
// server to have internet access at render time. If the deployment
// environment has no outbound internet access, swap this <link> for a
// locally bundled .ttf loaded via a base64 @font-face instead.
export function buildVoucherPdfHtml(data: VoucherPdfData): string {
  return `
<!DOCTYPE html>
<html lang="bn">
<head>
${PDF_HEAD_FONTS}
<style>${getSharedPdfStyles(data.accentColor)}</style>
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

  <div class="meta-row">
    <div>ভাউচার নং: <b>${escapeHtml(data.voucherNumber)}</b></div>
    <div>তারিখ: <b>${escapeHtml(data.date)}</b></div>
  </div>

  <table>
    <tr>
      <td class="label-cell">${escapeHtml(data.categoryLabel)}</td>
      <td class="value-cell">${escapeHtml(data.categoryValue)}</td>
    </tr>
    <tr>
      <td class="label-cell">বিবরণ</td>
      <td class="value-cell">${escapeHtml(data.description)}</td>
    </tr>
    <tr>
      <td class="label-cell">এন্ট্রি করেছেন</td>
      <td class="value-cell">${escapeHtml(data.operatorName)}</td>
    </tr>
    <tr>
      <td class="label-cell">এন্ট্রি করার সময়</td>
      <td class="value-cell">${escapeHtml(data.createdAt)}</td>
    </tr>
    <tr class="amount-row">
      <td class="label-cell">পরিমাণ (টাকা)</td>
      <td class="value-cell">৳ ${escapeHtml(data.amount)}</td>
    </tr>
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