const pool = require('../config/db');
const MINIMO_FIADO = 10000;

function redondear50(precio) {
  return Math.round(+precio / 50) * 50;
}

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

async function calcularPrecioVenta(client, producto_id, costo_unitario) {
  const r = await client.query(
    `SELECT c.margen FROM productos p
     LEFT JOIN categorias c ON p.categoria_id = c.id
     WHERE p.id = $1`, [producto_id]
  );
  const margen = r.rows[0]?.margen != null ? +r.rows[0].margen : 45;
  return redondear50(+costo_unitario * (1 + margen / 100));
}

async function descontarDeLote(client, producto_id, cantidad, lote_id) {
  let idLote = lote_id;
  if (!idLote || idLote === 'activo') {
    const activo = await client.query(
      `SELECT id FROM lotes_producto WHERE producto_id = $1 AND activo = true ORDER BY fecha ASC LIMIT 1`,
      [producto_id]
    );
    if (!activo.rows.length) return [];
    idLote = activo.rows[0].id;
  }
  const lote = await client.query(
    `SELECT id, cantidad_restante, activo FROM lotes_producto WHERE id = $1`, [idLote]
  );
  if (!lote.rows.length) return [];
  const aDescontar = Math.min(cantidad, lote.rows[0].cantidad_restante);
  await client.query(
    `UPDATE lotes_producto SET cantidad_restante = cantidad_restante - $1 WHERE id = $2`,
    [aDescontar, idLote]
  );
  const quedaEnLote = lote.rows[0].cantidad_restante - aDescontar;
  if (quedaEnLote <= 0 && lote.rows[0].activo) {
    await client.query(`UPDATE lotes_producto SET activo = false WHERE id = $1`, [idLote]);
    const siguiente = await client.query(
      `SELECT id, costo_unitario FROM lotes_producto
       WHERE producto_id = $1 AND id != $2 AND cantidad_restante > 0
       ORDER BY fecha ASC LIMIT 1`,
      [producto_id, idLote]
    );
    if (siguiente.rows.length) {
      await client.query(`UPDATE lotes_producto SET activo = true WHERE id = $1`, [siguiente.rows[0].id]);
      const precioVenta = await calcularPrecioVenta(client, producto_id, siguiente.rows[0].costo_unitario);
      await client.query(`UPDATE productos SET precio = $1 WHERE id = $2`, [precioVenta, producto_id]);
    }
  }
  return [{ lote_id: idLote, cantidad: aDescontar }];
}

async function devolverALotesOrigen(client, producto_id, lotesOrigen) {
  if (!Array.isArray(lotesOrigen) || lotesOrigen.length === 0) return;
  for (const { lote_id, cantidad } of lotesOrigen) {
    const lote = await client.query(
      `SELECT id, activo, costo_unitario FROM lotes_producto WHERE id = $1`, [lote_id]
    );
    if (!lote.rows.length) continue;
    await client.query(
      `UPDATE lotes_producto SET cantidad_restante = cantidad_restante + $1 WHERE id = $2`,
      [cantidad, lote_id]
    );
    if (!lote.rows[0].activo) {
      await client.query(`UPDATE lotes_producto SET activo = false WHERE producto_id = $1`, [producto_id]);
      await client.query(`UPDATE lotes_producto SET activo = true WHERE id = $1`, [lote_id]);
      const precioVenta = await calcularPrecioVenta(client, producto_id, lote.rows[0].costo_unitario);
      await client.query(`UPDATE productos SET precio = $1 WHERE id = $2`, [precioVenta, producto_id]);
    }
  }
}

async function crear(req, res) {
  const { cliente_id, cliente_nombre, tipo_venta, productos, domicilio, notas, es_fiado, monto_fiado, origen } = req.body;
  const usuario_id = req.usuario.id;
  if (!cliente_id && !cliente_nombre?.trim())
    return res.status(400).json({ ok: false, mensaje: 'selecciona un cliente o ingresa un nombre' });
  if (!productos?.length)
    return res.status(400).json({ ok: false, mensaje: 'agrega al menos un producto' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const totalesPorProducto = {};
    for (const item of productos)
      totalesPorProducto[item.producto_id] = (totalesPorProducto[item.producto_id] || 0) + +item.cantidad;
    for (const producto_id of Object.keys(totalesPorProducto)) {
      const s = await client.query('SELECT stock, nombre FROM productos WHERE id=$1', [producto_id]);
      if (!s.rows[0] || s.rows[0].stock < totalesPorProducto[producto_id])
        throw new Error(`Stock insuficiente: ${s.rows[0]?.nombre || producto_id}`);
    }
    const total = productos.reduce((s, p) => s + p.precio_unitario * p.cantidad, 0);
    if (es_fiado && total < MINIMO_FIADO) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        mensaje: `El mínimo para ventas a crédito (fiado) es de $${MINIMO_FIADO.toLocaleString('es-CO')}`
      });
    }
    const montoFiadoSolicitado = es_fiado ? (monto_fiado != null ? +monto_fiado : total) : 0;
    if (cliente_id && montoFiadoSolicitado > 0) {
      const clienteData = await client.query(
        'SELECT permite_fiado, limite_fiado FROM clientes WHERE id=$1', [cliente_id]
      );
      if (clienteData.rows.length) {
        const { permite_fiado, limite_fiado } = clienteData.rows[0];
        if (!permite_fiado) {
          await client.query('ROLLBACK');
          return res.status(400).json({ ok: false, mensaje: 'Este cliente no tiene fiado habilitado' });
        }
        if (limite_fiado != null && +limite_fiado > 0) {
          const deudaRes = await client.query(`
            SELECT COALESCE(SUM(p.total - COALESCE(pg.pagado, 0)), 0) AS deuda
            FROM pedidos p
            LEFT JOIN estados e ON p.estado_id = e.id
            LEFT JOIN (
              SELECT pagos.pedido_id, SUM(pagos.monto) AS pagado
              FROM pagos
              LEFT JOIN estados ep ON pagos.estado_id = ep.id
              WHERE LOWER(ep.nombre) NOT LIKE '%anula%'
              GROUP BY pagos.pedido_id
            ) pg ON pg.pedido_id = p.id
            WHERE p.cliente_id = $1 AND LOWER(e.nombre) NOT LIKE '%anula%'
          `, [cliente_id]);
          const deudaActual = +deudaRes.rows[0].deuda || 0;
          const cupoDisponible = Math.max(0, +limite_fiado - deudaActual);
          if (montoFiadoSolicitado > cupoDisponible) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              ok: false,
              mensaje: `Cupo de fiado insuficiente. Disponible: $${cupoDisponible.toLocaleString('es-CO')}, solicitado: $${montoFiadoSolicitado.toLocaleString('es-CO')}`
            });
          }
        }
      }
    }
    const res2 = await client.query(
      `INSERT INTO pedidos (cliente_id,cliente_nombre,usuario_id,tipo_venta,estado_id,total,notas,fecha_limite_anulacion,origen,es_fiado)
       VALUES ($1,$2,$3,$4,1,$5,$6, NOW() + INTERVAL '72 hours',$7,$8) RETURNING id`,
      [cliente_id||null, cliente_nombre?.trim()||null, usuario_id, tipo_venta||'mostrador', total, notas||null, origen||'web', !!es_fiado]
    );
    const pedido_id = res2.rows[0].id;
    for (const item of productos) {
      const lotesOrigen = await descontarDeLote(client, item.producto_id, item.cantidad, item.lote_id);
      await client.query(
        `INSERT INTO pedido_productos (pedido_id,producto_id,cantidad,precio_unitario,subtotal,estado_id,lotes_origen)
         VALUES ($1,$2,$3,$4,$5,1,$6)`,
        [pedido_id, item.producto_id, item.cantidad, item.precio_unitario,
         item.precio_unitario * item.cantidad, JSON.stringify(lotesOrigen)]
      );
    }
    for (const producto_id of Object.keys(totalesPorProducto)) {
      await client.query('UPDATE productos SET stock=stock-$1 WHERE id=$2', [totalesPorProducto[producto_id], producto_id]);
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
       WHERE p.id=$1`, [id]
    );
    if (!pedidoActual.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' });
    }
    if (esAnulacion) {
      const limite = pedidoActual.rows[0].fecha_limite_anulacion;
      if (limite && new Date(limite) < new Date()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, mensaje: 'el plazo de 72 horas para anular esta venta ya expiró' });
      }
      const yaEstabaAnulado = pedidoActual.rows[0].estado_actual?.toLowerCase().includes('anula');
      if (!yaEstabaAnulado) {
        const items = await client.query(
          'SELECT producto_id, cantidad, lotes_origen FROM pedido_productos WHERE pedido_id=$1', [id]
        );
        for (const item of items.rows) {
          await devolverALotesOrigen(client, item.producto_id, item.lotes_origen);
        }
        const estadoPagoAnulado = await client.query(
          `SELECT id FROM estados WHERE LOWER(nombre) LIKE '%anula%' AND tipo='pago' LIMIT 1`
        );
        const idPagoAnulado = estadoPagoAnulado.rows[0]?.id;
        if (idPagoAnulado) {
          await client.query(
            `UPDATE pagos SET estado_id=$1 WHERE pedido_id=$2 AND estado_id != $1`,
            [idPagoAnulado, id]
          );
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

async function marcarEntregado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(
      'UPDATE pedidos SET entregado = true WHERE id = $1 RETURNING id, entregado',
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const pedido = await pool.query(`
      SELECT p.*,
        COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre, 'cliente ocasional') AS cliente,
        c.id AS cliente_id_ref, e.nombre AS estado,
        c.telefono, c.tipo_documento, c.numero_documento,
        (SELECT metodo FROM pagos WHERE pedido_id = p.id ORDER BY id ASC LIMIT 1) AS metodo_pago
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

async function listarProductos(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      SELECT pp.cantidad, pp.precio_unitario, pp.subtotal,
        pr.nombre, pr.imagen_url, pr.codigo_barras
      FROM pedido_productos pp
      JOIN productos pr ON pp.producto_id=pr.id
      WHERE pp.pedido_id = $1
    `, [id]);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

// Cron — marca pedidos móviles sin recoger y devuelve stock
async function marcarSinRecoger() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Buscar pedidos que deben marcarse como sin recoger
    const pedidos = await client.query(`
      SELECT id FROM pedidos
      WHERE estado_id = 1
        AND origen = 'movil'
        AND es_fiado = false
        AND fecha_pedido < NOW() - INTERVAL '6 hours'
    `);

    if (!pedidos.rows.length) {
      await client.query('COMMIT');
      return 0;
    }

    for (const { id } of pedidos.rows) {
      // Devolver stock y lotes de cada producto del pedido
      const items = await client.query(
        'SELECT producto_id, cantidad, lotes_origen FROM pedido_productos WHERE pedido_id=$1', [id]
      );

      for (const item of items.rows) {
        // Devolver stock al producto
        await client.query(
          'UPDATE productos SET stock = stock + $1 WHERE id = $2',
          [item.cantidad, item.producto_id]
        );
        // Devolver a lotes de origen
        let lotesOrigen = item.lotes_origen
        if (typeof lotesOrigen === 'string') {
          try { lotesOrigen = JSON.parse(lotesOrigen) } catch { lotesOrigen = [] }
        }
        await devolverALotesOrigen(client, item.producto_id, lotesOrigen)
      }

      // Marcar como sin recoger (estado 18)
      await client.query(
        'UPDATE pedidos SET estado_id = 18 WHERE id = $1', [id]
      );
    }

    await client.query('COMMIT');
    console.log(`[cron] ${pedidos.rows.length} pedido(s) marcados como "Sin recoger" — stock devuelto`);
    return pedidos.rows.length;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[cron] Error marcarSinRecoger:', err.message);
    return 0;
  } finally {
    client.release();
  }
}

module.exports = { listar, crear, cambiarEstado, detalle, listarProductos, marcarEntregado, marcarSinRecoger };