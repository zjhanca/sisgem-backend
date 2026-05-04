const pool = require('../config/db');

async function listar(req, res) {
  const { tipo } = req.query;
  try {
    const r = tipo
      ? await pool.query(`SELECT * FROM estados WHERE tipo=$1 ORDER BY orden`, [tipo])
      : await pool.query(`SELECT * FROM estados ORDER BY tipo, orden`);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar };