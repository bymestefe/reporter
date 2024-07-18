const QueueDatabase = require('./query_handlers/postgres');
const Helpers = require('./helpers');

const main = async () => {
  const queueDb = new QueueDatabase();
  await queueDb.createTableIfNotExists();
  Helpers.runInterval(queueDb.checkNewRows);
};

main();