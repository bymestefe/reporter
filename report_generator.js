const PdfPrinter = require('pdfmake');
const fs = require('fs');

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

  async generatePDF(data, reportName = 'sample', reportHeader = 'Query Result', logo = 'logo.png') {
    try {
        const currentDate = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const docDefinition = {
            content: [
                {
                    text: currentDate,
                    alignment: 'right',
                    fontSize: 5,
                    margin: [0, -35, 0, 0]
                },
                {
                    columns: [
                        {
                            text: reportHeader,
                            style: 'header',
                            alignment: 'left',
                        },
                        {
                            image: logo,
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
            pageOrientation: 'landscape',
        };

        const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
        pdfDoc.pipe(fs.createWriteStream(`${reportName}.pdf`));
        pdfDoc.end();
    } catch (err) {
        console.error('Error generating PDF:', err);
    }
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
        const [r, g, b] = hslToRgb(degree_sum, 100, 50);

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
