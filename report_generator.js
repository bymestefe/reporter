const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const PdfPrinter = require('pdfmake');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const archiver = require('archiver');
const SMTPHelper = require('./helpers/smtp_helpers');
const logMessage = require('./helpers/logger');

class PDFReportGenerator {
  constructor() {
    this.fonts = {
      Roboto: {
        normal: 'fonts/Roboto-Regular.ttf',
        bold: 'fonts/Roboto-Medium.ttf',
        italics: 'fonts/Roboto-Italic.ttf',
        bolditalics: 'fonts/Roboto-MediumItalic.ttf'
      }
    };
    this.printer = new PdfPrinter(this.fonts);
  }

  generatePDF(data, reportSettings) {
    return new Promise((resolve, reject) => {
      try {
        const pdfPath = this.getFilePath(reportSettings.report_name, 'pdfs');
        const docDefinition = this.buildDocDefinition(data, reportSettings);

        const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
        const writeStream = fs.createWriteStream(pdfPath);

        writeStream.on('finish', async () => {
          await this.setFilePermissions(pdfPath);
          resolve();
        });

        writeStream.on('error', (err) => reject(`Error generating PDF: ${err}`));

        pdfDoc.pipe(writeStream);
        pdfDoc.end();
      } catch (err) {
        reject(`Error generating PDF: ${err}`);
      }
    });
  }

  generatePdfWithChart(data, labels, reportSettings) {
    return new Promise(async (resolve, reject) => {
      try {
        const imageBuffer = await this.createChartImage(
          reportSettings.chart_type,
          data,
          labels,
          reportSettings.report_title
        );
        const pdfPath = this.getFilePath(reportSettings.report_name, 'pdfs');
        const docDefinition = this.buildChartDocDefinition(imageBuffer);

        const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
        const writeStream = fs.createWriteStream(pdfPath);

        writeStream.on('finish', async () => {
          await this.setFilePermissions(pdfPath);
          resolve();
        });

        writeStream.on('error', (err) => reject(`Error generating PDF with chart: ${err}`));

        pdfDoc.pipe(writeStream);
        pdfDoc.end();
      } catch (err) {
        reject(`Error generating PDF with chart: ${err}`);
      }
    });
  }

  async sendReportsInOneEmail(reports) {
    try {
      if (!reports || reports.length === 0) return logMessage('No reports to send.', 'INFO');

      const { smtp_settings, mail_to } = reports[0];
      if (!mail_to || mail_to.length === 0) return logMessage('No recipients found for smtp.', 'INFO');

      const zipFilePath = await this.createArchive(reports);
      
      if (smtp_settings.authType !== 'NTLM') {
        await this.sendEmailWithNodemailer(smtp_settings, mail_to, zipFilePath);
      } else {
        await this.sendEmailWithNTLM(smtp_settings, mail_to, zipFilePath);
      }
    } catch (error) {
      logMessage(`Error sending email: ${error}`);
    }
  }

  buildDocDefinition(data, reportSettings) {
    const currentDate = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    return {
      content: [
        { text: `Creator: ${reportSettings.creator} | ${currentDate}`, alignment: 'right', fontSize: 5, margin: [0, -35, 0, 0] },
        { columns: [{ text: reportSettings.report_title, style: 'header', alignment: 'left' }, { image: reportSettings.logo, width: 50, height: 50, alignment: 'right', margin: [0, 0, 0, 0] }] },
        this.createTable(data)
      ],
      styles: this.getStyles(),
      pageOrientation: reportSettings.orientation
    };
  }

  buildChartDocDefinition(imageBuffer) {
    return {
      content: [{ image: `data:image/png;base64,${imageBuffer.toString('base64')}`, width: 730 }],
      pageOrientation: 'landscape',
      styles: { header: { fontSize: 22, bold: true, margin: [0, 0, 0, 10] } }
    };
  }

  async createChartImage(chartType, data, labels, title, indexAxis = 'x', width = 800, height = 600) {
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });
    const colors = this.generateColors(data);
    
    const config = {
      type: chartType,
      data: { labels, datasets: [{ data, backgroundColor: colors.background, borderColor: colors.border }] },
      options: {
        responsive: true,
        indexAxis,
        plugins: { legend: { display: true, title: { display: true, text: title, color: 'black', bold: true }, position: 'top' } }
      }
    };

    return await chartJSNodeCanvas.renderToBuffer(config);
  }

  async createArchive(reports) {
    const zipName = `${reports[0].report_name}.zip`;
    const zipFilePath = path.join('archive', zipName);
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);
    reports.forEach(report => {
      const filePath = this.getFilePath(report.report_name, 'pdfs');
      if (fs.existsSync(filePath)) archive.file(filePath, { name: `${report.report_name}.pdf` });
    });

    await archive.finalize();
    return zipFilePath;
  }

  async sendEmailWithNodemailer(smtpSettings, recipients, zipFilePath) {
    const transporter = nodemailer.createTransport({
      host: smtpSettings.host,
      port: smtpSettings.port,
      secure: smtpSettings.secure,
      auth: { user: smtpSettings.user, pass: smtpSettings.pass }
    });

    await transporter.sendMail({
      from: smtpSettings.user,
      to: recipients.join(', '),
      subject: 'Prodarc Reporter - Reports',
      text: 'Please find the attached reports.',
      attachments: [{ filename: path.basename(zipFilePath), path: zipFilePath }]
    });
  }

  async sendEmailWithNTLM(smtpSettings, recipients, zipFilePath) {
    const smtp = new SMTPHelper(smtpSettings.host, smtpSettings.port, smtpSettings.authUser, smtpSettings.pass, 'NTLM', smtpSettings.secure);
    await smtp.connect();
    await smtp.authenticate();
    await smtp.sendMail(smtpSettings.user, recipients, 'Prodarc Reporter - Reports', 'Please find the attached reports.', true, [zipFilePath]);
    await smtp.quit();
  }

  async setFilePermissions(filePath) {
    return new Promise((resolve, reject) => {
      fs.chmod(filePath, 0o777, (err) => {
        if (err) return reject(`Failed to set permissions for ${filePath}: ${err}`);
        resolve();
      });
    });
  }

  createTable(data) {
    if (!data || data.length === 0) {
        return {
            table: {
                headerRows: 1,
                widths: ['100%'],
                body: [
                    [{ text: 'Data not found', style: 'tableHeader', fontSize: 14, alignment: 'center' }]
                ]
            },
            layout: this.getTableLayout()
        };
    }

    const headers = Object.keys(data[0]).map(key => ({ text: key.charAt(0).toUpperCase() + key.slice(1), style: 'tableHeader', fontSize: 8 }));
    const body = [headers, ...data.map(row => Object.values(row).map(value => ({ text: value, fontSize: 7 })))];

    let count = Object.keys(data[0]).length;
    let width = 100 / count;
    let widths = new Array(count).fill(`${width}%`);

    return { table: { headerRows: 1, widths: widths, body: body }, layout: this.getTableLayout() };
}

  getTableLayout() {
    return {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 2 : 1,
      vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length) ? 2 : 1,
      hLineColor: (i, node) => (i === 0 || i === node.table.body.length) ? 'black' : 'gray',
      vLineColor: (i, node) => (i === 0 || i === node.table.widths.length) ? 'black' : 'gray',
      fillColor: (rowIndex) => rowIndex === 0 ? '#686D76' : (rowIndex % 2 === 0 ? '#CCCCCC' : null)
    };
  }

  generateColors(data) {
    const sum = data.reduce((a, b) => a + b, 0);
    let degreeSum = 0;

    return data.reduce(
      (colors, value) => {
        const hue = (value / sum) * 360;
        degreeSum += hue;
        const [r, g, b] = this.hslToRgb(degreeSum, 100, 50);
        colors.background.push(`rgba(${r}, ${g}, ${b}, 0.4)`);
        colors.border.push(`rgba(${r}, ${g}, ${b}, 1)`);
        return colors;
      },
      { background: [], border: [] }
    );
  }

  hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return [Math.round(255 * (l - a * Math.max(-1, Math.min(k(0) - 3, Math.min(9 - k(0), 1))))), Math.round(255 * (l - a * Math.max(-1, Math.min(k(8) - 3, Math.min(9 - k(8), 1))))), Math.round(255 * (l - a * Math.max(-1, Math.min(k(4) - 3, Math.min(9 - k(4), 1)))))];
  }

  getStyles() {
    return {
      header: { fontSize: 22, bold: true, margin: [0, 0, 0, 10] },
      subheader: { fontSize: 16, bold: true, margin: [0, 10, 0, 5] },
      tableHeader: { bold: true, fontSize: 10, color: 'white' }
    };
  }

  getFilePath(reportName, dir) {
    return path.join(dir, `${reportName}.pdf`);
  }
}

module.exports = PDFReportGenerator;
