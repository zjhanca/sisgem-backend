const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.connect((err) => {
  if (err) {
    console.error('error al conectar a postgresql:', err.message);
  } else {
    console.log('conectado a postgresql correctamente');
  }
});

module.exports = pool;
