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

// Calcula el precio de venta a partir del costo unitario y el margen
// real configurado en la categoría del producto (categorias.margen).
async function calcularPrecioVenta(client, producto_id, costo_unitario) {
  const r = await client.query(
    `SELECT c.margen
     FROM productos p
     LEFT JOIN categorias c ON p.categoria_id = c.id
     WHERE p.id = $1`,
    [producto_id]
  );
  const margen = r.rows[0]?.margen != null ? +r.rows[0].margen : 45;
  return Math.ceil(+costo_unitario * (1 + margen / 100));
}

// Descuenta `cantidad` del lote de costo activo de un producto. Si el lote
// activo se agota, activa el siguiente lote en cola (por fecha) y recalcula
// productos.precio según el costo de ese nuevo lote — así el precio de venta
// solo cambia cuando se agota por completo el stock del lote anterior.
async function descontarLoteActivo(client, producto_id, cantidad) {
  let restante = cantidad;

  while (restante > 0) {
    const activo = await client.query(
      `SELECT id, cantidad_restante FROM lotes_producto
       WHERE producto_id = $1 AND activo = true
       ORDER BY fecha ASC LIMIT 1`,
      [producto_id]
    );

    if (!activo.rows.length) break; // no hay lote registrado (producto sin migrar a lotes), no hacer nada más

    const lote = activo.rows[0];
    const aDescontar = Math.min(restante, lote.cantidad_restante);

    await client.query(
      `UPDATE lotes_producto SET cantidad_restante = cantidad_restante - $1 WHERE id = $2`,
      [aDescontar, lote.id]
    );
    restante -= aDescontar;

    const quedaEnLote = lote.cantidad_restante - aDescontar;
    if (quedaEnLote <= 0) {
      // este lote se agotó: pasar al siguiente lote en cola y recalcular el precio de venta
      await client.query(`UPDATE lotes_producto SET activo = false WHERE id = $1`, [lote.id]);
      const siguiente = await client.query(
        `SELECT id, costo_unitario FROM lotes_producto
         WHERE producto_id = $1 AND id != $2 AND cantidad_restante > 0
         ORDER BY fecha ASC LIMIT 1`,
        [producto_id, lote.id]
      );
      if (siguiente.rows.length) {
        await client.query(`UPDATE lotes_producto SET activo = true WHERE id = $1`, [siguiente.rows[0].id]);
        const precioVenta = await calcularPrecioVenta(client, producto_id, siguiente.rows[0].costo_unitario);
        await client.query(`UPDATE productos SET precio = $1 WHERE id = $2`, [precioVenta, producto_id]);
      }
      // si no hay siguiente lote, no queda lote activo (se acabó todo el inventario con costo registrado)
    }
  }
}

// Devuelve `cantidad` al lote activo de un producto (usado al anular una venta).
// Mantiene la operación simple: no reactiva lotes ya cerrados ni revierte historial de precio.
async function devolverALoteActivo(client, producto_id, cantidad) {
  const activo = await client.query(
    `SELECT id FROM lotes_producto WHERE producto_id = $1 AND activo = true ORDER BY fecha ASC LIMIT 1`,
    [producto_id]
  );
  if (activo.rows.length) {
    await client.query(
      `UPDATE lotes_producto SET cantidad_restante = cantidad_restante + $1 WHERE id = $2`,
      [cantidad, activo.rows[0].id]
    );
  }
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
      // descontar del lote de costo activo; si se agota, activa el siguiente lote y recalcula el precio
      await descontarLoteActivo(client, item.producto_id, item.cantidad);
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const estadoNuevo = await client.query('SELECT nombre FROM estados WHERE id=$1', [estado_id]);
    const esAnulacion = estadoNuevo.rows[0]?.nombre?.toLowerCase().includes('anula');

    const pedidoActual = await client.query(
      `SELECT p.estado_id, p.fecha_limite_anulacion, e.nombre AS estado_actual
       FROM pedidos p LEFT JOIN estados e ON p.estado_id = e.id
       WHERE p.id=$1`,
      [id]
    );
    if (!pedidoActual.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' }); }

    if (esAnulacion) {
      const limite = pedidoActual.rows[0].fecha_limite_anulacion;
      if (limite && new Date(limite) < new Date()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, mensaje: 'el plazo de 72 horas para anular esta venta ya expiró' });
      }

      const yaEstabaAnulado = pedidoActual.rows[0].estado_actual?.toLowerCase().includes('anula');
      if (!yaEstabaAnulado) {
        // devolver cantidades al lote activo de cada producto de la venta (el trigger de
        // BD ya devuelve el stock global; aquí solo se sincroniza el lote)
        const items = await client.query(
          'SELECT producto_id, cantidad FROM pedido_productos WHERE pedido_id=$1', [id]
        );
        for (const item of items.rows) {
          await devolverALoteActivo(client, item.producto_id, item.cantidad);
        }
      }
    }

    const r = await client.query('UPDATE pedidos SET estado_id=$1 WHERE id=$2 RETURNING *', [estado_id, id]);
    const estado = await client.query('SELECT nombre FROM estados WHERE id=$1', [estado_id]);
    if (estado.rows[0]?.nombre?.toLowerCase().includes('entregado')) {
      const entDom = await client.query("SELECT id FROM estados WHERE nombre='Entregado domicilio' LIMIT 1");
      if (entDom.rows.length) {
        await client.query('UPDATE domicilios SET estado_id=$1 WHERE pedido_id=$2', [entDom.rows[0].id, id]);
      }
    }
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