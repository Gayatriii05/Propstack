const PDFDocument = require('pdfkit');

const MONEY = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function drawTable(doc, headers, rows) {
  const colW = 90;
  const left = 50;
  const rowH = 18;
  let y = doc.y;

  doc.font('Helvetica-Bold').fontSize(9);
  headers.forEach((h, i) => {
    doc.text(h, left + i * colW, y, { width: colW - 4, lineBreak: false });
  });
  y += rowH;
  doc.moveTo(left, y).lineTo(left + headers.length * colW, y).stroke();

  doc.font('Helvetica').fontSize(9);
  rows.forEach((row) => {
    row.forEach((cell, i) => {
      doc.text(String(cell), left + i * colW, y, { width: colW - 4, lineBreak: false });
    });
    y += rowH;
    if (y > 700) {
      doc.addPage();
      y = 50;
    }
  });
  doc.moveTo(left, y).lineTo(left + headers.length * colW, y).stroke();
  doc.y = y + 10;
}

// Simple bar chart drawn natively (no chart library) for the running total.
function drawBars(doc, runningTotal) {
  if (!runningTotal.length) {
    doc.font('Helvetica').fontSize(10).text('No revenue data yet.');
    return;
  }

  const baseX = 50;
  const baseY = 700;
  const chartW = 500;
  const chartH = 150;
  const maxVal = Math.max(...runningTotal.map((r) => Number(r.running_total)));
  const slotW = chartW / runningTotal.length;

  doc.font('Helvetica-Bold').fontSize(9).text('Running total (₹)');

  doc.font('Helvetica').fontSize(7);
  runningTotal.forEach((r, i) => {
    const barH = (Number(r.running_total) / maxVal) * chartH;
    const x = baseX + i * slotW + slotW * 0.2;
    const barW = slotW * 0.6;
    const y = baseY - barH;

    doc.rect(x, y, barW, barH).fill('#2563eb');
    doc.text(String(Number(r.running_total).toLocaleString('en-IN')), x, y - 10, { width: barW, lineBreak: false });
    doc.text(String(r.month).slice(0, 7), x, baseY + 4, { width: barW, lineBreak: false });
  });
  doc.moveTo(baseX, baseY).lineTo(baseX + chartW, baseY).stroke();
}

/**
 * Builds the monthly PDF report as a Buffer.
 * @param {{occupancy: Array, revenue: Array, runningTotal: Array, summary: string}} data
 * @returns {Promise<Buffer>}
 */
function buildMonthlyReportPdf({ occupancy = [], revenue = [], runningTotal = [], summary = '' } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', compress: false });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).font('Helvetica-Bold').text('PropStack — Monthly Report', { align: 'center' });
    doc.font('Helvetica').fontSize(9).text(`Generated ${new Date().toISOString().slice(0, 10)}`, { align: 'center' });
    doc.moveDown(1.5);

    if (summary) {
      doc.fontSize(12).font('Helvetica-Bold').text('Summary');
      doc.font('Helvetica').fontSize(10).text(summary);
      doc.moveDown(1.5);
    }

    doc.fontSize(14).font('Helvetica-Bold').text('Occupancy');
    drawTable(
      doc,
      ['Property', 'Total units', 'Occupied', 'Rate %'],
      occupancy.map((r) => [r.property_name, String(r.total_units), String(r.occupied_units), `${r.occupancy_rate_pct}%`])
    );
    doc.moveDown(1);

    doc.fontSize(14).text('Monthly Revenue');
    drawTable(
      doc,
      ['Property', 'Month', 'Revenue'],
      revenue.map((r) => [r.property_name, String(r.month).slice(0, 7), MONEY(r.revenue_collected)])
    );
    doc.moveDown(1);

    drawBars(doc, runningTotal);
    doc.end();
  });
}

module.exports = { buildMonthlyReportPdf };