const QueueDatabase = require('./query_handlers/postgres');
const Helpers = require('./helpers');

const PDFReportGenerator = require('./report_generator');

const main = async () => {
  const queueDb = new QueueDatabase();
  await queueDb.createTableIfNotExists();
  const PdfGenerator = new PDFReportGenerator();
  Helpers.runInterval(queueDb.checkNewRows, PdfGenerator);
};

main();