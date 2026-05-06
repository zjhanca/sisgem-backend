const pool = require('../config/db');
 
async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT a.*, e.nombre AS estado,
        COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre, 'ocasional') AS cliente
      FROM abonos a
      LEFT JOIN estados e ON a.estado_id=e.id
      LEFT JOIN pedidos p ON a.pedido_id=p.id
      LEFT JOIN clientes c ON p.cliente_id=c.id
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
    // generar numero consecutivo automatico
    const seq = await pool.query("SELECT nextval('abono_comprobante_seq') AS num");
    const numero_comprobante = `AB-${String(seq.rows[0].num).padStart(6, '0')}`;
    const r = await pool.query(
      `INSERT INTO abonos (pedido_id,monto,metodo,comprobante,numero_comprobante,estado_id)
       VALUES ($1,$2,$3,$4,$5,7) RETURNING *`,
      [pedido_id, monto, metodo||'efectivo', comprobante||null, numero_comprobante]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function cambiarEstado(req, res) {
  const { id } = req.params;
  const { estado_id } = req.body;
  // solo se puede anular
  const est = await pool.query('SELECT nombre FROM estados WHERE id=$1', [estado_id]);
  if (!est.rows[0]?.nombre?.toLowerCase().includes('anula'))
    return res.status(400).json({ ok: false, mensaje: 'solo se puede anular un abono' });
  try {
    const r = await pool.query('UPDATE abonos SET estado_id=$1 WHERE id=$2 RETURNING *', [estado_id, id]);
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
module.exports = { listar, crear, cambiarEstado };
 
