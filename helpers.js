const fs = require('fs');
const ArchiveDbClickhouse = require('./query_handlers/clickhouse');
const QueueDatabase = require('./query_handlers/postgres');

class Helpers {

  static async pngToBase64(filePath) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(err);
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
  
        for (let row of data) {
          try {
            if (row.payload.database === "clickhouse") {
              let query = await ArchiveDbClickhouse.createSelectQuery(row.payload);
              let res = await ArchiveDbClickhouse.executeQuery(query);
  
              let report_settings = {
                logo: row.payload.logo || "logo.png",
                report_name: row.payload.report_name,
                report_title: row.payload.title,
                orientation: row.payload.is_landscape == 1 ? "landscape" : "portrait",
                creator: row.payload.creator || "Prodarc",
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
            } else {
              console.log("Database is not clickhouse");
            }
            QueueDatabase.updateQueueItem(row.id, 'done');
            QueueDatabase.updateReportResult(row.payload.result_id, 'completed');
          } catch (error) {
            console.error(`Error processing row ${row.id}:`, error);
            QueueDatabase.updateReportResult(row.payload.result_id, 'error occured');
          }
        }
  
        processing = false;
      }
  
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

module.exports = Helpers;
