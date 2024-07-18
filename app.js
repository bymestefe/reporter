const QueueDatabase = require('./query_handlers/postgres');
const ArchiveDbClickhouse = require('./query_handlers/clickhouse');

const main = async () => {
  await QueueDatabase.createTableIfNotExists();
  const queueItems = await QueueDatabase.getQueueItems();
  console.log(queueItems);
  await QueueDatabase.closeConnection();
};

main();