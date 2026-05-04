const pool = require('../config/db');

async function listar(req, res) {
  const { cliente_id, estado_id, desde, hasta } = req.query;
  try {
    let query = `
      SELECT p.*, c.nombre || ' ' || c.apellido AS cliente,
             c.id AS cliente_id, e.nombre AS estado
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE 1=1
    `;
    const params = [];
    if (cliente_id) { params.push(cliente_id); query += ` AND p.cliente_id = $${params.length}`; }
    if (estado_id)  { params.push(estado_id);  query += ` AND p.estado_id = $${params.length}`; }
    if (desde)      { params.push(desde);       query += ` AND DATE(p.fecha_pedido) >= $${params.length}`; }
    if (hasta)      { params.push(hasta);       query += ` AND DATE(p.fecha_pedido) <= $${params.length}`; }
    query += ` ORDER BY p.id DESC`;
    const r = await pool.query(query, params);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { cliente_id, tipo_venta, productos, domicilio } = req.body;
  const usuario_id = req.usuario.id;
  if (!cliente_id) return res.status(400).json({ ok: false, mensaje: 'cliente requerido' });
  if (!productos?.length) return res.status(400).json({ ok: false, mensaje: 'agrega al menos un producto' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of productos) {
      const s = await client.query(
        `SELECT stock FROM productos WHERE id=$1`, [item.producto_id]
      );
      if (!s.rows[0] || s.rows[0].stock < item.cantidad)
        throw new Error(`stock insuficiente para el producto ${item.producto_id}`);
    }
    const total = productos.reduce((s, p) => s + p.precio_unitario * p.cantidad, 0);
    const pedidoRes = await client.query(
      `INSERT INTO pedidos (cliente_id,usuario_id,tipo_venta,estado_id,total)
       VALUES ($1,$2,$3,1,$4) RETURNING id`,
      [cliente_id, usuario_id, tipo_venta || 'mostrador', total]
    );
    const pedido_id = pedidoRes.rows[0].id;
    for (const item of productos) {
      const subtotal = item.precio_unitario * item.cantidad;
      await client.query(
        `INSERT INTO pedido_productos (pedido_id,producto_id,cantidad,precio_unitario,subtotal,estado_id)
         VALUES ($1,$2,$3,$4,$5,1)`,
        [pedido_id, item.producto_id, item.cantidad, item.precio_unitario, subtotal]
      );
      await client.query(
        `UPDATE productos SET stock = stock - $1 WHERE id=$2`,
        [item.cantidad, item.producto_id]
      );
    }
    if (domicilio?.direccion_id) {
      await client.query(
        `INSERT INTO domicilios (pedido_id,direccion_id,estado_id,tarifa_id,tarifa_aplicada)
         VALUES ($1,$2,7,$3,$4)`,
        [pedido_id, domicilio.direccion_id, domicilio.tarifa_id || null, domicilio.tarifa_aplicada || 0]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ ok: true, pedido_id });
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
      `UPDATE pedidos SET estado_id=$1 WHERE id=$2 RETURNING *`,
      [estado_id, id]
    );
    if (!r.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const pedido = await pool.query(`
      SELECT p.*, c.nombre || ' ' || c.apellido AS cliente,
             c.id AS cliente_id, e.nombre AS estado
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE p.id = $1
    `, [id]);
    if (!pedido.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' });

    const productos = await pool.query(`
      SELECT pp.*, pr.nombre AS producto
      FROM pedido_productos pp
      JOIN productos pr ON pp.producto_id = pr.id
      WHERE pp.pedido_id = $1
    `, [id]);

    res.json({
      ok: true,
      datos: {
        ...pedido.rows[0],
        productos: productos.rows
      }
    });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, cambiarEstado, detalle };