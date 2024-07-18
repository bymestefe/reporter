const pool = require('../configs/db_config');

class QueueDatabase {

  static async createTableIfNotExists() {
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

  static async buildConditionString(conditions, logicalOperator = 'AND') {
    return conditions.map(cond => {
        if (cond.type === 'basic') {
            const { field, operator, data } = cond;
            const val = typeof data === 'string' ? `'${data}'` : data;
            return `${field} ${operator} ${val}`;
        } else if (cond.type === 'nested_and') {
            return `(${buildConditionString(cond.conditions)})`;
        } else if (cond.type === 'nested_or') {
            return `(${buildConditionString(cond.conditions, 'OR')})`;
        }
    }).join(` ${logicalOperator} `);
  }

  static async getQueueItems() {
    try {
      const res = await pool.query('SELECT * FROM queue_items');
      return res.rows;
    } catch (err) {
      console.error('Error executing query', err.stack);
    }
  }

  static async closeConnection() {
    try {
      await pool.end();
    } catch (err) {
      console.error('Error closing connection', err.stack);
    }
  }
  
}

module.exports = QueueDatabase;