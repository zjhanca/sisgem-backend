const router = require('express').Router()
const pool   = require('../config/db')
const { verificarToken } = require('../middleware/auth')

router.get('/', verificarToken, async (req, res) => {
  const { tipo } = req.query
  try {
    let query  = 'SELECT * FROM estados WHERE 1=1'
    const params = []
    if (tipo) { params.push(tipo); query += ` AND tipo=$${params.length}` }
    query += ' ORDER BY orden ASC, id ASC'
    const r = await pool.query(query, params)
    res.json({ ok: true, datos: r.rows })
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }) }
})

module.exports = router