const pool = require('../configs/db_config');

class QueueDatabase {

  constructor() {
    this.lastProcessedId = null;
  }

  async createTableIfNotExists() {
    const queries = [
      `
        CREATE TABLE IF NOT EXISTS queue_items (
          id SERIAL PRIMARY KEY,
          status VARCHAR(50) NOT NULL,
          payload JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS report_results (
          id SERIAL PRIMARY KEY,
          report_name TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          start_date TIMESTAMP,
          end_date TIMESTAMP
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS individual_report_results (
          id SERIAL PRIMARY KEY,
          report_result_id INTEGER NOT NULL REFERENCES report_results(id),
          result JSON,
          path TEXT NOT NULL,
          status VARCHAR(50) NOT NULL CHECK (status IN ('processing', 'completed', 'error occured')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS scheduled_report_items (
          id SERIAL PRIMARY KEY,
          report_name VARCHAR(255) NOT NULL,
          schedule_type VARCHAR(50) NOT NULL CHECK (schedule_type IN ('daily', 'weekly', 'monthly', 'yearly')),
          schedule_time TIME NOT NULL,
          last_run TIMESTAMP,
          payload JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `,
      `
        ALTER TABLE report_results
          ADD COLUMN IF NOT EXISTS is_scheduled INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS schedule_report_id INTEGER
      `,
      `
      ALTER TABLE scheduled_report_items
        ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
      `
    ];
  
    try {
      for (const query of queries) {
        await pool.query(query);
      }
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
      text: 'UPDATE individual_report_results SET status = $2 WHERE id = $1',
      values: [id, status]
    };

    try {
      await pool.query(updateQuery);
      console.log(`Updated report result with ID ${id} to status ${status}`);
    } catch (error) {
      console.error('Error updating report result:', error);
    }
  }

  createReportResult = async (reportName, startDate, endDate, isScheduled = 0, scheduleReportId = null) => {
    const insertQuery = {
      text: 'INSERT INTO report_results (report_name, start_date, end_date, is_scheduled, schedule_report_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      values: [reportName, startDate, endDate, isScheduled, scheduleReportId]
    };
  
    try {
      const result = await pool.query(insertQuery);
      return result.rows[0].id;
    } catch (error) {
      console.error('Error creating report result:', error);
      return null;
    }
  }

  createIndividualReportResult = async (reportResultId, result, reportName, status) => {

    let path = '/usr/local/siemplus/reporter/pdfs/' + reportName + '.pdf';
    let resultJson = JSON.stringify(result);
    const insertQuery = {
      text: 'INSERT INTO individual_report_results (report_result_id, result, path, status) VALUES ($1, $2, $3, $4) RETURNING id',
      values: [reportResultId, resultJson, path, status]
    };

    try {
      const result = await pool.query(insertQuery);
      return result.rows[0].id;
    } catch (error) {
      console.error('Error creating individual report result:', error);
      return null;
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

  checkAndTriggerScheduledReports = async () => {
    try {
      const now = new Date();
      const currentTime = now.toTimeString().split(' ')[0];

      console.log(`Checking for scheduled reports at ${currentTime}`);
  
      const result = await pool.query(`
        SELECT * FROM scheduled_report_items
        WHERE schedule_time = $1 AND status = 'active'
        AND (
          (schedule_type = 'daily') OR
          (schedule_type = 'weekly' AND EXTRACT(DOW FROM CURRENT_DATE) = EXTRACT(DOW FROM last_run + INTERVAL '1 week')) OR
          (schedule_type = 'monthly' AND EXTRACT(DAY FROM CURRENT_DATE) = EXTRACT(DAY FROM last_run + INTERVAL '1 month')) OR
          (schedule_type = 'yearly' AND EXTRACT(DOY FROM CURRENT_DATE) = EXTRACT(DOY FROM last_run + INTERVAL '1 year'))
        )
      `, [currentTime]);
  
      const scheduledReports = result.rows;
  
      for (const report of scheduledReports) {
        console.log(`Triggering report: ${report.report_name}`);

        let updatedPayload = await this.updateConditionsForScheduledReport(report.payload, report.schedule_type, report.id);

        await pool.query(`
          INSERT INTO queue_items (status, payload)
          VALUES ($1, $2)
        `, ['pending', updatedPayload]);

        await pool.query(`
          UPDATE scheduled_report_items
          SET last_run = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [report.id]);
      }
    } catch (err) {
      console.error('Error checking and triggering scheduled reports', err.stack);
    }
  }

  formatDate(date, type = 'daily') {
    const datePart = date.toISOString().split('T')[0];
    let timePart = '00:00:00'; 
    if (type != 'daily'){
      timePart = '23:59:59'; 
    }
    return `${datePart} ${timePart}`;
  }

  generateReportNameWithTime = async (reportName, includeDate = true) => {
    const sanitizedReportName = reportName.replace(/[\/\\ ]/g, '_');
  
    if (includeDate) {
      const tzString = 'Europe/Istanbul';
      const currentDate = new Date().toLocaleString('sv-SE', { timeZone: tzString }).replace(' ', '_').replace(/:/g, '-');
      return `${sanitizedReportName}-${currentDate}`;
    }
  
    return sanitizedReportName;
  }

  updateConditionsForScheduledReport = async (input, scheduleType, scheduleReportId) => {

    let newConditions = [];
    const currentDate = new Date();
    const endDate = new Date();

    switch (scheduleType) {
      case 'daily':
        currentDate.setDate(currentDate.getDate() - 1);
        break;
    case 'weekly':
        const dayOfWeek = currentDate.getDay();
        const daysSinceMonday = (dayOfWeek + 6) % 7;
        currentDate.setDate(currentDate.getDate() - daysSinceMonday - 7); 
        endDate.setDate(endDate.getDate() - daysSinceMonday - 1);
        break;
      case 'monthly':
        currentDate.setDate(1);
        currentDate.setMonth(currentDate.getMonth() - 1);
        endDate.setDate(0);
        break;
    case 'yearly':
        currentDate.setMonth(0, 1);
        currentDate.setFullYear(currentDate.getFullYear() - 1);
        endDate.setFullYear(currentDate.getFullYear());
        endDate.setMonth(11, 31);
        break;
      default:
        console.log('Invalid schedule type ', scheduleType);
    }

    let currendDateStr = this.formatDate(currentDate);
    let endDateStr = this.formatDate(endDate,scheduleType);

    newConditions.push({"type": "basic", "data": currendDateStr, "field": "archive_date", "operator": ">"});
    newConditions.push({"type": "basic", "data": endDateStr, "field": "archive_date", "operator": "<"});

    input.conditions = input.conditions.filter(condition => condition.field !== 'archive_date');
    input.conditions.push(...newConditions);
    
    if (input.query && input.query != "") {
      const query = input.query;
      const updatedQuery = query.replace(/archive_date BETWEEN '.*?' AND '.*?'/i, `archive_date BETWEEN '${currendDateStr}' AND '${endDateStr}'`);
      input.query = updatedQuery;
    }
    input.report_name = await this.generateReportNameWithTime(input.report_name, true);

    let report_id = await this.createReportResult(input.report_name, currendDateStr, endDateStr, 1, scheduleReportId);
    if (report_id != null) {
      input.result_id = await this.createIndividualReportResult(report_id, '', input.report_name, 'processing');
    }
    
    return input;
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
