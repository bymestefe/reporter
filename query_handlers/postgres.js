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

  static async updateQueueItem (id, status) {
    const updateQuery = {
      text: 'UPDATE queue_items SET status = $2 WHERE id = $1',
      values: [id, status]
    };

    try {
      await pool.query(updateQuery);
      console.log(`Updated row with ID ${id} to status ${status}`);
    } catch (error) {
      console.error('Error updating row:', error);
    }
  }

  checkNewRows = async () => {
    let queryText;
    let queryValues;

    if (this.lastProcessedId) {
      queryText = 'SELECT * FROM queue_items WHERE id > $1 and status = $2';
      queryValues = [this.lastProcessedId, 'pending'];
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
        rows.forEach(row => {
          console.log(`Row ID: ${row.id}, Status: ${row.status}, Payload: ${JSON.stringify(row.payload)}`);
        });

        this.lastProcessedId = Math.max(...rows.map(row => row.id));
      } else {
        console.log('No new rows found.');
      }
      return rows; 
    } catch (error) {
      console.error('Error checking for new rows:', error);
      return [];
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
