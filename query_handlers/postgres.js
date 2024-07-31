const pool = require('../configs/db_config');

class QueueDatabase {

  constructor() {
    this.lastProcessedId = null;
  }

  async createTableIfNotExists() {
    const createQueueItemsTableQuery = `
      CREATE TABLE IF NOT EXISTS queue_items (
        id SERIAL PRIMARY KEY,
        status VARCHAR(50) NOT NULL,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
  
    const createReportResultsTableQuery = `
      CREATE TABLE IF NOT EXISTS report_results (
        id SERIAL PRIMARY KEY,
        report_name TEXT NOT NULL,
        result JSON,
        path TEXT NOT NULL,
        status VARCHAR(50) NOT NULL CHECK (status IN ('processing', 'completed', 'error occured')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
  
    try {
      await pool.query(createQueueItemsTableQuery);
      await pool.query(createReportResultsTableQuery);
      console.log('Tables are ready.');
    } catch (err) {
      console.error('Error creating tables', err.stack);
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

  static async updateReportResult (id, status) {
    const updateQuery = {
      text: 'UPDATE report_results SET status = $2 WHERE id = $1',
      values: [id, status]
    };

    try {
      await pool.query(updateQuery);
      console.log(`Updated report result with ID ${id} to status ${status}`);
    } catch (error) {
      console.error('Error updating report result:', error);
    }
  }

  checkNewRows = async () => {
    let queryText;
    let queryValues;

    if (this.lastProcessedId) {
      queryText = 'SELECT * FROM queue_items WHERE id > $1 and status = $2';
      queryValues = [this.lastProcessedId, 'pending'];
    } else {
      queryText = 'SELECT * FROM queue_items WHERE status = $1';
      queryValues = ['pending'];
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
