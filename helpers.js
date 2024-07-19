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
              if (row.payload.database === "clickhouse") {
                let query = await ArchiveDbClickhouse.createSelectQuery(row.payload);
                let res = await ArchiveDbClickhouse.executeQuery(query);
                await PdfGenerator.generatePDF(res, "test", "Test Report Result", "logo.png");
              }else {
                console.log("Database is not clickhouse");
              }
              QueueDatabase.updateQueueItem(row.id, 'done');
            }

            processing = false;
        }

        await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

module.exports = Helpers;
