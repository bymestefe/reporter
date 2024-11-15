const fs = require('fs');
const ArchiveDbClickhouse = require('./query_handlers/clickhouse');
const QueueDatabase = require('./query_handlers/postgres');
const logMessage = require('./helpers/logger');

class Helpers {

  static async pngToBase64(filePath) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
          logMessage(`Error reading file: ${err}`);
          return;
        }
        const base64Data = Buffer.from(data).toString('base64');
        const dataUrl = `data:image/png;base64,${base64Data}`;
        return dataUrl;
    });
  }

  static async runInterval(fn, PdfGenerator) {
    let processing = false;
    while (true) {
      if (!processing) {
        processing = true;
        let data = await fn();
        let reportsToSend = [];
  
        for (let row of data) {
          try {
            if (row.payload.database === "clickhouse") {

              let query = "";
              
              if (row.payload.query && row.payload.query.includes("SELECT")) {
                query = row.payload.query;
              } else {
                query = await ArchiveDbClickhouse.createSelectQuery(row.payload);
              }

              let res = await ArchiveDbClickhouse.executeQuery(query);
              let sanitizedRpName = await this.sanitizeReportName(row.payload.report_name);
  
              let report_settings = {
                logo: row.payload.logo || "logo.png",
                report_name: sanitizedRpName,
                report_title: row.payload.title,
                orientation: row.payload.is_landscape == 1 ? "landscape" : "portrait",
                creator: row.payload.creator || "Prodarc",
                smtp_settings: row.payload.smtp_settings,
                mail_to: row.payload.mail_to,
              };
  
              if (row.payload.is_charted == 1) {
                report_settings.chart_type = row.payload.chart_type;
                const columns = row.payload.columns;
                let keyColumn = null;
                let countColumn = null;
  
                columns.forEach(column => {
                  const parts = column.split(" as ");
                  const alias = parts[1] || parts[0];
  
                  if (column.includes("count") && countColumn === null) {
                    countColumn = alias;
                  } else if (!column.includes("count") && keyColumn === null) {
                    keyColumn = alias;
                  }
                });
  
                const labels = res.map(item => item[keyColumn]);
                const data = res.map(item => parseInt(item[countColumn], 10));
                await PdfGenerator.generatePdfWithChart(data, labels, report_settings);
              } else {
                await PdfGenerator.generatePDF(res, report_settings);
              }

              reportsToSend.push(report_settings);
            } else {
              console.log("Database is not clickhouse");
            }
            QueueDatabase.updateQueueItem(row.id, 'done');
            QueueDatabase.updateReportResult(row.payload.result_id, 'completed');
          } catch (error) {
            logMessage(`Error processing row ${row.id}: ${error}`);
            QueueDatabase.updateReportResult(row.payload.result_id, 'error occured');
          }
        }

        if (reportsToSend.length > 0) {
          await PdfGenerator.sendReportsInOneEmail(reportsToSend);
        }
  
        processing = false;
      }
  
      await new Promise(resolve => setTimeout(resolve, 20000));
    }
  }

  static async sanitizeReportName(reportName) {
    return reportName.replace(/[^a-z0-9_]/gi, '_');
  } 

}

module.exports = Helpers;
