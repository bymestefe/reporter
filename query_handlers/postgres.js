const pool = require('../configs/db_config');

class QueueDatabase {

  constructor() {
    this.lastProcessedId = null;
  }

  async createTableIfNotExists() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS queue_items (
        id SERIAL PRIMARY KEY,
        status VARCHAR(50) NOT NULL,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    try {
      await pool.query(createTableQuery);
      console.log('Table is ready.');
    } catch (err) {
      console.error('Error creating table', err.stack);
    }
  }

  buildConditionString = async (conditions, logicalOperator = 'AND') => {
    return conditions.map(cond => {
        if (cond.type === 'basic') {
            const { field, operator, data } = cond;
            const val = typeof data === 'string' ? `'${data}'` : data;
            return `${field} ${operator} ${val}`;
        } else if (cond.type === 'nested_and') {
            return `(${this.buildConditionString(cond.conditions)})`;
        } else if (cond.type === 'nested_or') {
            return `(${this.buildConditionString(cond.conditions, 'OR')})`;
        }
    }).join(` ${logicalOperator} `);
  }

  getQueueItems = async () => {
    try {
      const res = await pool.query('SELECT * FROM queue_items');
      return res.rows;
    } catch (err) {
      console.error('Error executing query', err.stack);
    }
  }

  checkNewRows = async () => {
    let queryText;
    let queryValues;

    if (this.lastProcessedId) {
      queryText = 'SELECT * FROM queue_items WHERE id > $1';
      queryValues = [this.lastProcessedId];
    } else {
      queryText = 'SELECT * FROM queue_items';
      queryValues = [];
    }

    const query = {
      text: queryText,
      values: queryValues
    };

    try {
      const result = await pool.query(query);
      const rows = result.rows;

      if (rows.length > 0) {
        console.log(`Found ${rows.length} new rows:`);
        rows.forEach(row => {
          console.log(`Row ID: ${row.id}, Status: ${row.status}, Payload: ${JSON.stringify(row.payload)}`);
        });

        this.lastProcessedId = Math.max(...rows.map(row => row.id));
      } else {
        console.log('No new rows found.');
      }
    } catch (error) {
      console.error('Error checking for new rows:', error);
    }
  }

  closeConnection = async () => {
    try {
      await pool.end();
    } catch (err) {
      console.error('Error closing connection', err.stack);
    }
  }
}

module.exports = QueueDatabase;