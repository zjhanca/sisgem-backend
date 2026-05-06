const pool = require('../config/db');
 
async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT p.*, e.nombre AS estado,
        COALESCE(c.nombre || ' ' || c.apellido, ped.cliente_nombre, 'cliente ocasional') AS cliente,
        ped.total AS total_pedido
      FROM pagos p
      LEFT JOIN estados e ON p.estado_id=e.id
      LEFT JOIN pedidos ped ON p.pedido_id=ped.id
      LEFT JOIN clientes c ON ped.cliente_id=c.id
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
    const ped = await pool.query('SELECT total FROM pedidos WHERE id=$1', [pedido_id]);
    if (!ped.rows.length) return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' });
    // estado activo = 5
    const r = await pool.query(
      'INSERT INTO pagos (pedido_id,monto,metodo,estado_id) VALUES ($1,$2,$3,5) RETURNING *',
      [pedido_id, monto, metodo||'efectivo']
    );
    // si el pago cubre el total, actualizar pedido
    if (+monto >= +ped.rows[0].total) {
      await pool.query('UPDATE pedidos SET estado_id=2 WHERE id=$1', [pedido_id]);
    }
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function anular(req, res) {
  const { id } = req.params;
  try {
    const pago = await pool.query('SELECT estado_id FROM pagos WHERE id=$1', [id]);
    if (!pago.rows.length) return res.status(404).json({ ok: false, mensaje: 'pago no encontrado' });
    if (pago.rows[0].estado_id === 8) return res.status(400).json({ ok: false, mensaje: 'el pago ya esta anulado' });
    const r = await pool.query('UPDATE pagos SET estado_id=8 WHERE id=$1 RETURNING *', [id]);
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function detalle(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      SELECT p.*, e.nombre AS estado,
        COALESCE(c.nombre || ' ' || c.apellido, ped.cliente_nombre, 'ocasional') AS cliente
      FROM pagos p
      LEFT JOIN estados e ON p.estado_id=e.id
      LEFT JOIN pedidos ped ON p.pedido_id=ped.id
      LEFT JOIN clientes c ON ped.cliente_id=c.id
      WHERE p.id=$1
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'pago no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
module.exports = { listar, crear, anular, detalle };
 
