require('dotenv').config();
const { Pool } = require('pg');


const pool = new Pool({
  user: process.env.POSTGRES_APP_DB_USERNAME,
  host: process.env.POSTGRES_APP_DB_HOST,
  database: process.env.POSTGRES_APP_DB_DATABASE,
  password: process.env.POSTGRES_APP_DB_PASSWORD,
  port: 5432,
});

module.exports = pool;