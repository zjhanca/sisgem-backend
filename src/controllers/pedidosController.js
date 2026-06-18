const pool = require('../config/db');

async function listar(req, res) {
  const { cliente_id, estado_id, desde, hasta } = req.query;
  try {
    let query = `
      SELECT p.*,
        COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre, 'cliente ocasional') AS cliente,
        c.id AS cliente_id_ref, e.nombre AS estado,
        c.permite_fiado, c.limite_fiado
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE 1=1
    `;
    const params = [];
    if (cliente_id) { params.push(cliente_id); query += ` AND p.cliente_id=$${params.length}`; }
    if (estado_id)  { params.push(estado_id);  query += ` AND p.estado_id=$${params.length}`; }
    if (desde)      { params.push(desde);       query += ` AND p.fecha_pedido>=$${params.length}`; }
    if (hasta)      { params.push(hasta);       query += ` AND p.fecha_pedido<=$${params.length}`; }
    query += ' ORDER BY p.id DESC';
    const r = await pool.query(query, params);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { cliente_id, cliente_nombre, tipo_venta, productos, domicilio, notas } = req.body;
  const usuario_id = req.usuario.id;
  if (!cliente_id && !cliente_nombre?.trim())
    return res.status(400).json({ ok: false, mensaje: 'selecciona un cliente o ingresa un nombre' });
  if (!productos?.length)
    return res.status(400).json({ ok: false, mensaje: 'agrega al menos un producto' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of productos) {
      const s = await client.query('SELECT stock, nombre FROM productos WHERE id=$1', [item.producto_id]);
      if (!s.rows[0] || s.rows[0].stock < item.cantidad)
        throw new Error(`Stock insuficiente: ${s.rows[0]?.nombre || item.producto_id}`);
    }
    const total = productos.reduce((s, p) => s + p.precio_unitario * p.cantidad, 0);
    const res2 = await client.query(
      `INSERT INTO pedidos (cliente_id,cliente_nombre,usuario_id,tipo_venta,estado_id,total,notas,fecha_limite_anulacion)
       VALUES ($1,$2,$3,$4,1,$5,$6, NOW() + INTERVAL '72 hours') RETURNING id`,
      [cliente_id||null, cliente_nombre?.trim()||null, usuario_id, tipo_venta||'mostrador', total, notas||null]
    );
    const pedido_id = res2.rows[0].id;
    for (const item of productos) {
      await client.query(
        `INSERT INTO pedido_productos (pedido_id,producto_id,cantidad,precio_unitario,subtotal,estado_id)
         VALUES ($1,$2,$3,$4,$5,1)`,
        [pedido_id, item.producto_id, item.cantidad, item.precio_unitario, item.precio_unitario * item.cantidad]
      );
      await client.query('UPDATE productos SET stock=stock-$1 WHERE id=$2', [item.cantidad, item.producto_id]);
    }
    if (domicilio?.direccion_id || domicilio?.direccion_manual) {
      const estDom = await client.query("SELECT id FROM estados WHERE nombre ILIKE '%pendiente%' AND tipo='domicilio' LIMIT 1");
      const estado_dom = estDom.rows[0]?.id || 7;
      await client.query(
        `INSERT INTO domicilios (pedido_id,direccion_id,direccion_manual,estado_id,tarifa_id,tarifa_aplicada)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [pedido_id, domicilio.direccion_id||null, domicilio.direccion_manual||null,
         estado_dom, domicilio.tarifa_id||null, domicilio.tarifa_aplicada||0]
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
    // Si el nuevo estado es "anulado", validar la ventana de 72 horas en el backend
    const estadoNuevo = await pool.query('SELECT nombre FROM estados WHERE id=$1', [estado_id]);
    const esAnulacion = estadoNuevo.rows[0]?.nombre?.toLowerCase().includes('anula');

    if (esAnulacion) {
      const pedidoActual = await pool.query('SELECT fecha_limite_anulacion FROM pedidos WHERE id=$1', [id]);
      if (!pedidoActual.rows.length) return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' });
      const limite = pedidoActual.rows[0].fecha_limite_anulacion;
      if (limite && new Date(limite) < new Date()) {
        return res.status(400).json({ ok: false, mensaje: 'el plazo de 72 horas para anular esta venta ya expiró' });
      }
    }

    const r = await pool.query('UPDATE pedidos SET estado_id=$1 WHERE id=$2 RETURNING *', [estado_id, id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' });
    const estado = await pool.query('SELECT nombre FROM estados WHERE id=$1', [estado_id]);
    if (estado.rows[0]?.nombre?.toLowerCase().includes('entregado')) {
      const entDom = await pool.query("SELECT id FROM estados WHERE nombre='Entregado domicilio' LIMIT 1");
      if (entDom.rows.length) {
        await pool.query('UPDATE domicilios SET estado_id=$1 WHERE pedido_id=$2', [entDom.rows[0].id, id]);
      }
    }
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const pedido = await pool.query(`
      SELECT p.*,
        COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre, 'cliente ocasional') AS cliente,
        c.id AS cliente_id_ref, e.nombre AS estado
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE p.id=$1
    `, [id]);
    if (!pedido.rows.length) return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' });
    const prods = await pool.query(`
      SELECT pp.*, pr.nombre AS producto, pr.codigo_barras, pr.imagen_url
      FROM pedido_productos pp
      JOIN productos pr ON pp.producto_id=pr.id
      WHERE pp.pedido_id=$1
    `, [id]);
    res.json({ ok: true, datos: { ...pedido.rows[0], productos: prods.rows } });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, cambiarEstado, detalle };