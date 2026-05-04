const pool = require('../config/db');

async function listar(req, res) {
  const { estado_id } = req.query;
  try {
    let query = `
      SELECT o.*, p.nombre AS proveedor, e.nombre AS estado
      FROM ordenes_compra o
      LEFT JOIN proveedores p ON o.proveedor_id = p.id
      LEFT JOIN estados e ON o.estado_id = e.id
      WHERE 1=1
    `;
    const params = [];
    if (estado_id) { params.push(estado_id); query += ` AND o.estado_id = $${params.length}`; }
    query += ` ORDER BY o.id DESC`;
    const r = await pool.query(query, params);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { proveedor_id, productos } = req.body;
  if (!proveedor_id) return res.status(400).json({ ok: false, mensaje: 'proveedor requerido' });
  if (!productos?.length) return res.status(400).json({ ok: false, mensaje: 'agrega productos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const total = productos.reduce((s, p) => s + p.costo_unitario * p.cantidad, 0);
    const ord = await client.query(
      `INSERT INTO ordenes_compra (proveedor_id,estado_id,total) VALUES ($1,10,$2) RETURNING id`,
      [proveedor_id, total]
    );
    const orden_id = ord.rows[0].id;
    for (const p of productos) {
      await client.query(
        `INSERT INTO ordenes_compra_detalle
         (orden_compra_id,producto_id,cantidad,costo_unitario,subtotal,estado_id)
         VALUES ($1,$2,$3,$4,$5,10)`,
        [orden_id, p.producto_id, p.cantidad, p.costo_unitario, p.costo_unitario * p.cantidad]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ ok: true, orden_id });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally { client.release(); }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { proveedor_id, productos } = req.body;
  if (!proveedor_id) return res.status(400).json({ ok: false, mensaje: 'proveedor requerido' });
  if (!productos?.length) return res.status(400).json({ ok: false, mensaje: 'agrega productos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const total = productos.reduce((s, p) => s + p.costo_unitario * p.cantidad, 0);
    await client.query(
      `UPDATE ordenes_compra SET proveedor_id=$1, total=$2 WHERE id=$3`,
      [proveedor_id, total, id]
    );
    await client.query(
      `DELETE FROM ordenes_compra_detalle WHERE orden_compra_id=$1`, [id]
    );
    for (const p of productos) {
      await client.query(
        `INSERT INTO ordenes_compra_detalle
         (orden_compra_id,producto_id,cantidad,costo_unitario,subtotal,estado_id)
         VALUES ($1,$2,$3,$4,$5,10)`,
        [id, p.producto_id, p.cantidad, p.costo_unitario, p.costo_unitario * p.cantidad]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, mensaje: 'orden actualizada' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally { client.release(); }
}

async function cambiarEstado(req, res) {
  const { id } = req.params;
  const { estado_id } = req.body;
  if (!estado_id) return res.status(400).json({ ok: false, mensaje: 'estado requerido' });
  try {
    const r = await pool.query(
      `UPDATE ordenes_compra SET estado_id=$1 WHERE id=$2 RETURNING *`,
      [estado_id, id]
    );
    if (!r.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const orden = await pool.query(`
      SELECT o.*, p.nombre AS proveedor, e.nombre AS estado
      FROM ordenes_compra o
      LEFT JOIN proveedores p ON o.proveedor_id = p.id
      LEFT JOIN estados e ON o.estado_id = e.id
      WHERE o.id = $1
    `, [id]);
    if (!orden.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });
    const detalle = await pool.query(`
      SELECT od.*, pr.nombre AS producto
      FROM ordenes_compra_detalle od
      JOIN productos pr ON od.producto_id = pr.id
      WHERE od.orden_compra_id = $1
    `, [id]);
    res.json({
      ok: true,
      datos: { ...orden.rows[0], productos: detalle.rows }
    });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, actualizar, cambiarEstado, detalle };