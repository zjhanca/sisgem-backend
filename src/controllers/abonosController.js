const pool = require('../config/db');

async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT a.*, e.nombre AS estado
      FROM abonos a
      LEFT JOIN estados e ON a.estado_id = e.id
      ORDER BY a.id DESC
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { pedido_id, monto, metodo, comprobante } = req.body;
  if (!pedido_id || !monto || +monto <= 0)
    return res.status(400).json({ ok: false, mensaje: 'pedido y monto son obligatorios' });
  try {
    const r = await pool.query(
      `INSERT INTO abonos (pedido_id,monto,metodo,comprobante,estado_id)
       VALUES ($1,$2,$3,$4,7) RETURNING *`,
      [pedido_id, monto, metodo || 'efectivo', comprobante || null]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { monto, metodo, estado_id, comprobante } = req.body;
  if (!monto || +monto <= 0)
    return res.status(400).json({ ok: false, mensaje: 'monto invalido' });
  try {
    const r = await pool.query(
      `UPDATE abonos SET monto=$1,metodo=$2,estado_id=$3,comprobante=$4 WHERE id=$5 RETURNING *`,
      [monto, metodo, estado_id, comprobante || null, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'abono no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function cambiarEstado(req, res) {
  const { id } = req.params;
  const { estado_id } = req.body;
  if (!estado_id) return res.status(400).json({ ok: false, mensaje: 'estado requerido' });
  try {
    const r = await pool.query(
      `UPDATE abonos SET estado_id=$1 WHERE id=$2 RETURNING *`, [estado_id, id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      SELECT a.*, e.nombre AS estado
      FROM abonos a
      LEFT JOIN estados e ON a.estado_id = e.id
      WHERE a.id=$1
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'abono no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, actualizar, cambiarEstado, detalle };