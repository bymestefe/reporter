const clickhouse = require('../configs/clickhouse_config');

class ArchiveDbClickhouse {

  static async executeQuery(queryText) {
    try {
        const result = await clickhouse.query({
            query: queryText,
            format: 'JSONEachRow',
            })
        return result.json();
    } catch (err) {
        console.error('Error executing query', err.stack);
    }
  }

  static async closeConnection() {
    try {
        await clickhouse.end();
    } catch (err) {
        console.error('Error closing connection', err.stack);
    }
  }
  
}

module.exports = ArchiveDbClickhouse;