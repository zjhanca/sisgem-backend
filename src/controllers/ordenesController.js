const pool = require('../config/db');
 
async function listar(req, res) {
  const { estado_id } = req.query;
  try {
    let query = `
      SELECT o.*, p.nombre AS proveedor, e.nombre AS estado
      FROM ordenes_compra o
      LEFT JOIN proveedores p ON o.proveedor_id=p.id
      LEFT JOIN estados e ON o.estado_id=e.id
      WHERE 1=1
    `;
    const params = [];
    if (estado_id) { params.push(estado_id); query += ` AND o.estado_id=$${params.length}`; }
    query += ' ORDER BY o.id DESC';
    const r = await pool.query(query, params);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function crear(req, res) {
  const { proveedor_id, productos } = req.body;
  if (!proveedor_id) return res.status(400).json({ ok: false, mensaje: 'proveedor requerido' });
  if (!productos?.length) return res.status(400).json({ ok: false, mensaje: 'agrega al menos un producto' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const total = productos.reduce((s, p) => s + p.costo_unitario * p.cantidad, 0);
    const ord = await client.query(
      'INSERT INTO ordenes_compra (proveedor_id,estado_id,total) VALUES ($1,10,$2) RETURNING id',
      [proveedor_id, total]
    );
    const orden_id = ord.rows[0].id;
    for (const p of productos) {
      await client.query(
        `INSERT INTO ordenes_compra_detalle (orden_compra_id,producto_id,cantidad,costo_unitario,subtotal,estado_id)
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
 
async function cambiarEstado(req, res) {
  const { id } = req.params;
  const { estado_id } = req.body;
  if (!estado_id) return res.status(400).json({ ok: false, mensaje: 'estado requerido' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orden = await client.query('SELECT estado_id FROM ordenes_compra WHERE id=$1', [id]);
    if (!orden.rows.length) return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });
    // verificar si el nuevo estado es "aprobado/recibido" — buscar por nombre
    const nuevoEst = await client.query('SELECT nombre FROM estados WHERE id=$1', [estado_id]);
    const nombreNuevo = nuevoEst.rows[0]?.nombre?.toLowerCase() || '';
    const esAprobado = nombreNuevo.includes('aproba') || nombreNuevo.includes('recibi') || +estado_id === 11;
    const yaAprobado = orden.rows[0].estado_id === +estado_id;
    if (esAprobado && !yaAprobado) {
      // actualizar stock automaticamente
      const detalle = await client.query(
        'SELECT producto_id, cantidad FROM ordenes_compra_detalle WHERE orden_compra_id=$1', [id]
      );
      for (const item of detalle.rows) {
        await client.query('UPDATE productos SET stock=stock+$1 WHERE id=$2', [item.cantidad, item.producto_id]);
      }
    }
    const r = await client.query('UPDATE ordenes_compra SET estado_id=$1 WHERE id=$2 RETURNING *', [estado_id, id]);
    await client.query('COMMIT');
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally { client.release(); }
}
 
async function detalle(req, res) {
  const { id } = req.params;
  try {
    const orden = await pool.query(`
      SELECT o.*, p.nombre AS proveedor, e.nombre AS estado
      FROM ordenes_compra o
      LEFT JOIN proveedores p ON o.proveedor_id=p.id
      LEFT JOIN estados e ON o.estado_id=e.id
      WHERE o.id=$1
    `, [id]);
    if (!orden.rows.length) return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });
    const det = await pool.query(`
      SELECT od.*, pr.nombre AS producto, pr.codigo_barras, pr.stock AS stock_actual
      FROM ordenes_compra_detalle od
      JOIN productos pr ON od.producto_id=pr.id
      WHERE od.orden_compra_id=$1
    `, [id]);
    res.json({ ok: true, datos: { ...orden.rows[0], productos: det.rows } });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
module.exports = { listar, crear, cambiarEstado, detalle };
 
