const clickhouse = require('../configs/clickhouse_config');
const logMessage = require('../helpers/logger');

class ArchiveDbClickhouse {

  static async executeQuery(queryText) {
    try {
        const result = await clickhouse.query({
            query: queryText,
            format: 'JSONEachRow',
            })
        return result.json();
    } catch (err) {
        logMessage(`Error executing query: ${err.stack}`);
    }
  }

  static buildConditionString(conditions, logicalOperator = 'AND') {
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

  static async createSelectQuery(payload) {
    if (payload.query !== undefined) {
        return payload.query;
    }

    const { db_name, table, columns, conditions, order_by } = payload;
    
    let query = `SELECT ${columns.join(', ')} FROM ${db_name}.${table}`;
    
    if (conditions && conditions.length > 0) {
        let conditionStrings = this.buildConditionString(conditions);
        query += ` WHERE ${conditionStrings}`;
    }

    if (payload.group_by) {
      query += ` GROUP BY ${payload.group_by}`;
    }
    
    if (payload.order_by) {
        query += ` ORDER BY ${order_by}`;
    }

    if (payload.limit) {
        query += ` LIMIT ${payload.limit}`;
    }

    console.log('Query:', query);
    return query;
  }

  static async closeConnection() {
    try {
        await clickhouse.end();
    } catch (err) {
        logMessage(`Error closing connection: ${err.stack}`);
    }
  }
  
}

module.exports = ArchiveDbClickhouse;