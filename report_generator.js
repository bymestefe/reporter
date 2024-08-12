const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const PdfPrinter = require('pdfmake');
const fs = require('fs');
const { report } = require('process');
const nodemailer = require('nodemailer');
const path = require('path');

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

  async generatePDF(data, report_settings) {
    try {
        const currentDate = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const docDefinition = {
            content: [
                {
                    text: `Creator: ${report_settings.creator} | ${currentDate}`,
                    alignment: 'right',
                    fontSize: 5,
                    margin: [0, -35, 0, 0]
                },
                {
                    columns: [
                        {
                            text: report_settings.report_title,
                            style: 'header',
                            alignment: 'left',
                        },
                        {
                            image: report_settings.logo,
                            width: 50,
                            height: 50,
                            alignment: 'right',
                            margin: [0, 0, 0, 0]
                        },
                    ],
                },
                this.createTable(data),
            ],
            styles: this.getStyles(),
            pageOrientation: report_settings.orientation,
        };

        const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
        const pdfPath = `${report_settings.report_name}.pdf`;
        const newPdfPath = path.join('pdfs', `${report_settings.report_name}.pdf`);
        pdfDoc.pipe(fs.createWriteStream(newPdfPath));
        pdfDoc.end();

        pdfDoc.on('end', () => {
            fs.chmod(newPdfPath, 0o777, (err) => {
                if (err) {
                    console.error(`Failed to set permissions for ${newPdfPath}:`, err);
                }
            });
        });

    } catch (err) {
        console.error('Error generating PDF:', err);
    }
  }

  async generatePdfWithChart(data, labels, report_settings) {

    const chartType = report_settings.chart_type;
    const title = report_settings.report_title;
    const imageBuffer = await this.createChartImage(chartType, data, labels, title);
    const imageBase64 = imageBuffer.toString('base64');
    const fonts = {
        Roboto: {
            normal: 'fonts/Roboto-Regular.ttf',
            bold: 'fonts/Roboto-Medium.ttf',
            italics: 'fonts/Roboto-Italic.ttf',
            bolditalics: 'fonts/Roboto-MediumItalic.ttf'
        }
    };

    const printer = new PdfPrinter(fonts);

    const docDefinition = {
        content: [
            {
                image: `data:image/png;base64,${imageBase64}`,
                width: 730
            },
        ],
        pageOrientation: 'landscape',
        styles: {
            header: {
                fontSize: 22,
                bold: true,
                margin: [0, 0, 0, 10]
            }
        },
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const pdfPath = `${report_settings.report_name}.pdf`;
    const newPdfPath = path.join('pdfs', `${report_settings.report_name}.pdf`);
    pdfDoc.pipe(fs.createWriteStream(newPdfPath));
    pdfDoc.end();

    pdfDoc.on('end', () => {
        fs.chmod(newPdfPath, 0o777, (err) => {
            if (err) {
                console.error(`Failed to set permissions for ${newPdfPath}:`, err);
            }
        });
    });

  }

  async sendReportsInOneEmail(reports) {
    try {
        if (reports.length === 0) {
            console.log('No reports to send.');
            return;
        }

        let smtp_settings = reports[0].smtp_settings;
        let recipient_emails = reports[0].mail_to;

        if (!recipient_emails || recipient_emails.length === 0) {
            console.log('No recipient emails provided.');
            return;
        }

        let transporter = nodemailer.createTransport({
            host: smtp_settings.host,
            port: smtp_settings.port,
            secure: smtp_settings.secure,
            auth: {
                user: smtp_settings.user,
                pass: smtp_settings.pass
            }
        });
        let attachments = reports.map(report => ({
            filename: `${report.report_name}.pdf`,
            path: path.join('pdfs', `${report.report_name}.pdf`)
        }));

        let mailOptions = {
            from: smtp_settings.user,
            to: recipient_emails.join(', '),
            subject: 'Prodarc Reporter - Reports',
            text: 'Please find the attached reports.',
            attachments: attachments
        };

        let info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
    } catch (error) {
        console.error('Error sending email:', error);
    }
  }

  async createChartImage(chartType, data, labels, title, indexAxis='x', width = 800, height = 600) {
    const dataCount = data.length;
    const { backgroundColors, borderColors } = this.generateColors(data,dataCount);
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, plugins: {
        requireLegacy: ['chartjs-plugin-datalabels']
    } });

    const configuration = {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: '',
                data: data,
                fill: false,
                borderColor: 'black',
                tension: 0,
                backgroundColor: backgroundColors,
                borderColor: borderColors
            }],
        },
        options: {
            responsive: true,
            indexAxis: indexAxis,
            plugins: {
              legend: {
                display: true,
                title: {
                    display: true,
                    text: title,
                    color: 'black',
                    bold: true

                },
                position: 'top',
              },
            }
          },
    };

    return await chartJSNodeCanvas.renderToBuffer(configuration);
  }

  createTable(data) {
    const body = [];
    body.push(Object.keys(data[0]).map(key => ({
        text: key.charAt(0).toUpperCase() + key.slice(1),
        style: 'tableHeader',
        fontSize: 8
    })));

    let count = Object.keys(data[0]).length;
    let width = 100 / count;
    let widths = new Array(count).fill(`${width}%`);

    data.forEach(row => {
        body.push(Object.values(row).map(value => ({
            text: value,
            fontSize: 7
        })));
    });

    return {
        table: {
            headerRows: 1,
            widths: widths,
            body: body,
        },
        layout: {
            hLineWidth: function (i, node) {
                return (i === 0 || i === node.table.body.length) ? 2 : 1;
            },
            vLineWidth: function (i, node) {
                return (i === 0 || i === node.table.widths.length) ? 2 : 1;
            },
            hLineColor: function (i, node) {
                return (i === 0 || i === node.table.body.length) ? 'black' : 'gray';
            },
            vLineColor: function (i, node) {
                return (i === 0 || i === node.table.widths.length) ? 'black' : 'gray';
            },
            fillColor: function (rowIndex, node, columnIndex) {
                if (rowIndex === 0) {
                    return '#686D76';
                }
                return (rowIndex % 2 === 0) ? '#CCCCCC' : null;
            }
        }
    };
  }

  getStyles() {
    return {
        header: {
            fontSize: 14,
            bold: true,
            margin: [0, 16, 0, 0]
        },
        subheader: {
            fontSize: 12,
            bold: true,
            margin: [0, 10, 0, 5]
        },
        tableExample: {
            margin: [0, 10, 0, 5]
        },
        tableHeader: {
            bold: true,
            fontSize: 13,
            color: '#EEEEEE'
        }
    };
  }

  generateColors(data,dataCount) {
    const colors = {
        backgroundColors: [],
        borderColors: []
    };
    let sum = data.reduce((a, b) => a + b, 0);
    let degree_sum = 0;

    for (let i = 0; i < dataCount; i++) {
        const hue = data[i] / sum * 360;
        degree_sum += hue;
        const [r, g, b] = this.hslToRgb(degree_sum, 100, 50);

        colors.backgroundColors.push(`rgba(${r}, ${g}, ${b}, 0.4)`);
        colors.borderColors.push(`rgba(${r}, ${g}, ${b}, 0)`);
    }

    return colors;
  }

  hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;

    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }

}

module.exports = PDFReportGenerator;
