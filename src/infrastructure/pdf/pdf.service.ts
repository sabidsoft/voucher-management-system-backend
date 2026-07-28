import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';

@Injectable()
export class PdfService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser: Browser | null = null;

  // Launches one Chromium instance when the module starts, reused for
  // every PDF request for the lifetime of the process — starting a
  // fresh browser per request would add several hundred ms of
  // unnecessary overhead to every single PDF download.
  async onModuleInit() {
    this.browser = await puppeteer.launch({
      // 'shell' uses chrome-headless-shell — a separate, genuinely
      // windowless binary. Puppeteer's default 'true' ("new headless"
      // mode, since v22) has a documented, currently-open bug on
      // Windows where a blank window appears for the browser's entire
      // lifetime (see puppeteer/puppeteer#13145, #13012, #13132).
      // 'shell' predates that mode and doesn't have this issue. It's
      // slightly less feature-complete than full Chrome, but that
      // doesn't matter here — we're only rendering static HTML/CSS to
      // a PDF, nothing that needs the full modern browser feature set.
      headless: 'shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async onModuleDestroy() {
    await this.browser?.close();
  }

  async generatePdfFromHtml(html: string): Promise<Buffer> {
    if (!this.browser) {
      // Defensive fallback — should never happen once onModuleInit has
      // run, but avoids a confusing null-pointer error if a PDF is
      // somehow requested before the module finishes initializing.
      this.logger.warn('Browser not initialized yet — launching on demand');
      this.browser = await puppeteer.launch({
        headless: 'shell',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }

    const page = await this.browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      // Close the page (not the browser) after every request — keeps
      // memory from growing unbounded across many PDF requests, while
      // still reusing the single browser process itself.
      await page.close();
    }
  }
}