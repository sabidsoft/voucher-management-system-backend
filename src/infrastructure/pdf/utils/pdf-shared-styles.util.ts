// Shared styling for every voucher-related PDF (single-voucher detail,
// summary report, and future variants) — the header/signature block
// look identical across all of them, so this is written once and
// reused, instead of duplicating this CSS block per template file.
export function getSharedPdfStyles(accentColor: string): string {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Noto Sans Bengali', sans-serif;
    color: #232220;
    font-size: 13px;
    line-height: 1.6;
  }
  .header {
    border-bottom: 3px solid ${accentColor};
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  .header-top {
    text-align: center;
    margin-bottom: 12px;
  }
  .logo {
    width: 56px;
    height: 56px;
    object-fit: contain;
    margin: 0 auto 10px;
    display: block;
  }
  .header-text {
    text-align: center;
  }
  .office-name {
    font-size: 18px;
    font-weight: 800;
    color: #232220;
  }
  .constituency-label {
    font-size: 12px;
    color: #6F6D67;
    margin-top: 2px;
  }
  .voucher-type-row {
    text-align: center;
  }
  .voucher-type {
    display: inline-block;
    padding: 6px 20px;
    border-radius: 999px;
    background: ${accentColor};
    color: white;
    font-weight: 700;
    font-size: 14px;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 20px;
    font-size: 13px;
  }
  .meta-row div { color: #6F6D67; }
  .meta-row b { color: #232220; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }
  td {
    padding: 12px 4px;
    border-bottom: 1px solid #E6E4DE;
    vertical-align: middle;
  }
  .label-cell {
    width: 35%;
    font-weight: 700;
    color: #6F6D67;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .value-cell {
    font-weight: 600;
    color: #232220;
  }
  .amount-row .value-cell {
    font-size: 20px;
    font-weight: 800;
    color: #232220;
  }
  .signature-wrapper {
    /* Non-flex wrapper carrying the break-avoidance rule — Chromium's
       print/PDF engine unreliably respects page-break-inside/
       break-inside on flex containers directly, but does respect it
       on a plain block-level ancestor. */
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .signature-block {
    margin-top: 70px;
    display: flex;
    justify-content: space-between;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .signature-content {
    text-align: center;
    width: 240px;
  }
  .signature-space {
    height: 40px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .signature-img {
    max-width: 150px;
    max-height: 38px;
    object-fit: contain;
  }
  .signature-line {
    border-top: 1.5px solid #232220;
    padding-top: 8px;
  }
  .signature-name {
    font-weight: 800;
    font-size: 14px;
    color: #232220;
  }
  .signature-detail {
    font-size: 11px;
    color: #6F6D67;
    margin-top: 2px;
  }
  `;
}

// Shared <head> markup (fonts) — identical across every PDF template.
export const PDF_HEAD_FONTS = `
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;700;800&display=swap" rel="stylesheet" />
`;

// Minimal HTML-escaping for values interpolated into any PDF template
// — all values come from our own database, not directly from
// unauthenticated user input, but escaping costs nothing and avoids
// any accidental markup breakage if a field ever contains "<" or "&".
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}