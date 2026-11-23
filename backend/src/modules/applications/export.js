import PDFDocument from 'pdfkit';
import { LOAN_PRODUCTS } from '../../config/loanProducts.js';

const money = (n) =>
  n === null || n === undefined
    ? '-'
    : `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

function summaryRows(app) {
  return [
    ['Application', app.ref],
    ['Status', app.status],
    ['Applicant', app.fullName],
    ['PAN', app.panNumber],
    ['Loan type', LOAN_PRODUCTS[app.loanType]?.label ?? app.loanType],
    ['Amount', app.amount],
    ['Tenure (months)', app.tenureMonths],
    ['Interest rate (% p.a.)', app.interestRate],
    ['Monthly income', app.monthlyIncome],
    ['Submitted at', app.submittedAt?.toISOString?.() ?? app.submittedAt ?? ''],
    ['Decided at', app.decidedAt?.toISOString?.() ?? app.decidedAt ?? ''],
  ];
}

export function toCsv(app, installments) {
  const lines = summaryRows(app).map((r) => r.map(csvCell).join(','));
  if (installments.length) {
    lines.push('', 'Installment,Due date,EMI,Principal,Interest,Balance,Status');
    for (const i of installments) {
      lines.push(
        [i.installmentNo, i.dueDate, i.emiAmount, i.principal, i.interest, i.balance, i.status].map(csvCell).join(','),
      );
    }
  }
  return lines.join('\r\n') + '\r\n';
}

export function streamPdf(app, installments, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text('Loan Summary', { align: 'left' });
  doc.moveDown(0.3).fontSize(10).font('Helvetica').fillColor('#555').text(`Generated ${new Date().toUTCString()}`);
  doc.moveDown().fillColor('#000');

  for (const [k, v] of summaryRows(app)) {
    const value = ['Amount', 'Monthly income'].includes(k) ? money(v) : (v ?? '-');
    doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(String(value));
  }

  if (installments.length) {
    doc.moveDown().fontSize(13).font('Helvetica-Bold').text('Repayment schedule');
    doc.moveDown(0.5).fontSize(8.5);
    const cols = [
      ['#', 30],
      ['Due date', 70],
      ['EMI', 85],
      ['Principal', 85],
      ['Interest', 80],
      ['Balance', 95],
      ['Status', 60],
    ];
    const drawRow = (cells, bold) => {
      if (doc.y > 780) doc.addPage();
      const y = doc.y;
      let x = 40;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      cells.forEach((c, idx) => {
        doc.text(String(c), x, y, { width: cols[idx][1] - 4 });
        x += cols[idx][1];
      });
      doc.y = y + 14;
    };
    drawRow(
      cols.map((c) => c[0]),
      true,
    );
    for (const i of installments) {
      drawRow(
        [
          i.installmentNo,
          i.dueDate,
          money(i.emiAmount),
          money(i.principal),
          money(i.interest),
          money(i.balance),
          i.status,
        ],
        false,
      );
    }
  }
  doc.end();
}
