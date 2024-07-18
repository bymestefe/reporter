require('dotenv').config();
const { createClient } = require('@clickhouse/client');

const clickhouse = createClient({
    url: process.env.CLICKHOUSE_DB_URL,
    username: process.env.CLICKHOUSE_DB_USERNAME,
    password: process.env.CLICKHOUSE_DB_PASSWORD || '',
    database: process.env.CLICKHOUSE_DB_DATABASE,
    clickhouse_settings: { 
        async_insert: 1,
        wait_for_async_insert: 0
}});

module.exports = clickhouse;