const pool = require('../config/db');

async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT p.*, e.nombre AS estado
      FROM pagos p
      LEFT JOIN estados e ON p.estado_id = e.id
      ORDER BY p.id DESC
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { pedido_id, monto, metodo } = req.body;
  if (!pedido_id || !monto || +monto <= 0)
    return res.status(400).json({ ok: false, mensaje: 'pedido y monto son obligatorios' });
  try {
    const r = await pool.query(
      `INSERT INTO pagos (pedido_id,monto,metodo,estado_id) VALUES ($1,$2,$3,5) RETURNING *`,
      [pedido_id, monto, metodo || 'efectivo']
    );
    await pool.query(`UPDATE pedidos SET estado_id=2 WHERE id=$1`, [pedido_id]);
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { monto, metodo, estado_id } = req.body;
  if (!monto || +monto <= 0)
    return res.status(400).json({ ok: false, mensaje: 'monto invalido' });
  try {
    const r = await pool.query(
      `UPDATE pagos SET monto=$1,metodo=$2,estado_id=$3 WHERE id=$4 RETURNING *`,
      [monto, metodo, estado_id, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'pago no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function cambiarEstado(req, res) {
  const { id } = req.params;
  const { estado_id } = req.body;
  if (!estado_id) return res.status(400).json({ ok: false, mensaje: 'estado requerido' });
  try {
    const r = await pool.query(
      `UPDATE pagos SET estado_id=$1 WHERE id=$2 RETURNING *`, [estado_id, id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      SELECT p.*, e.nombre AS estado
      FROM pagos p
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE p.id=$1
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'pago no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, actualizar, cambiarEstado, detalle };