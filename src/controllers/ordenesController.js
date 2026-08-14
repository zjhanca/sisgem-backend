const pool = require('../config/db');

function redondear50(precio) {
  return Math.round(+precio / 50) * 50;
}

async function listar(req, res) {
  const { estado_id } = req.query;
  try {
    let query = `
      SELECT o.id, o.proveedor_id, o.estado_id, o.total,
        o.fecha_compra, o.metodo_pago, o.notas, o.registrado_por,
        p.nombre AS proveedor,
        e.nombre AS estado,
        u.nombre || ' ' || u.apellido AS registrado_por_nombre
      FROM ordenes_compra o
      LEFT JOIN proveedores p ON o.proveedor_id = p.id
      LEFT JOIN estados e ON o.estado_id = e.id
      LEFT JOIN usuarios u ON o.registrado_por = u.id
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
  let body = req.body;
  if (typeof body.productos === 'string') {
    try { body.productos = JSON.parse(body.productos) } catch {}
  }
  const { proveedor_id, productos, fecha_compra, metodo_pago, notas, registrado_por } = body;
  if (!proveedor_id) return res.status(400).json({ ok: false, mensaje: 'proveedor requerido' });
  if (!productos?.length) return res.status(400).json({ ok: false, mensaje: 'agrega al menos un producto' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const estPend = await client.query(`SELECT id FROM estados WHERE tipo='compra' AND LOWER(nombre)='pendiente' LIMIT 1`);
    const estadoId = estPend.rows[0]?.id || 10;
    const total = productos.reduce((s, p) => s + +p.costo_unitario * +p.cantidad, 0);
    const regPor = registrado_por && +registrado_por > 0 ? +registrado_por : null;
    const facturaFile = req.files?.find(f => f.fieldname === 'factura');
    const facturaUrl = facturaFile
      ? `data:${facturaFile.mimetype};base64,${facturaFile.buffer.toString('base64')}`
      : null;

    const ord = await client.query(
      `INSERT INTO ordenes_compra (proveedor_id, estado_id, total, fecha_compra, metodo_pago, notas, registrado_por, factura_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [proveedor_id, estadoId, total, fecha_compra || new Date(), metodo_pago || 'Efectivo', notas || null, regPor, facturaUrl]
    );
    const orden_id = ord.rows[0].id;

    for (const p of productos) {
      await client.query(
        `INSERT INTO ordenes_compra_detalle (orden_compra_id, producto_id, cantidad, costo_unitario, subtotal, estado_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orden_id, p.producto_id, p.cantidad, p.costo_unitario, +p.costo_unitario * +p.cantidad, estadoId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ok: true, orden_id });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally { client.release(); }
}

// Recibe el costoActivo como parámetro para evitar consultarlo
// después de que el lote ya fue desactivado (lo que daría 0 siempre).
async function calcularNuevoPrecio(client, producto_id, nuevo_costo, costoActivo) {
  const r = await client.query(
    `SELECT p.precio, COALESCE(p.margen, c.margen, 45) AS margen
     FROM productos p
     LEFT JOIN categorias c ON p.categoria_id = c.id
     WHERE p.id = $1`,
    [producto_id]
  );
  const precioActual = r.rows[0]?.precio ? +r.rows[0].precio : 0;
  const margen = +r.rows[0]?.margen || 45;

  // Precio sube si el nuevo costo es mayor al activo, o si no hay precio aún
  if (+nuevo_costo > costoActivo || precioActual === 0) {
    return redondear50(+nuevo_costo * (1 + margen / 100));
  }
  return precioActual;
}

// Registra un lote nuevo. Si el nuevo costo es mayor al lote activo,
// se activa de inmediato y el precio sube ya.
// Si el costo es igual o menor y hay stock activo, queda en cola sin cambiar precio.
async function registrarLote(client, { producto_id, proveedor_id, orden_compra_id, costo_unitario, cantidad }) {
  // Leer el lote activo ANTES de cualquier cambio
  const activoActual = await client.query(
    `SELECT id, cantidad_restante, costo_unitario FROM lotes_producto
     WHERE producto_id = $1 AND activo = true
     ORDER BY fecha ASC LIMIT 1`,
    [producto_id]
  );

  const costoActivo = activoActual.rows[0]?.costo_unitario
    ? +activoActual.rows[0].costo_unitario : 0;
  const hayLoteActivoConStock = activoActual.rows.length > 0
    && activoActual.rows[0].cantidad_restante > 0;

  // Activar de inmediato si: no hay lote activo con stock,
  // O el nuevo costo es mayor (precio debe subir ya)
  const activarAhora = !hayLoteActivoConStock || +costo_unitario > costoActivo;

  // Insertar el nuevo lote
  const nuevoLote = await client.query(
    `INSERT INTO lotes_producto (producto_id, orden_compra_id, proveedor_id, costo_unitario, cantidad_inicial, cantidad_restante, activo, fecha)
     VALUES ($1,$2,$3,$4,$5,$5,$6,NOW()) RETURNING id`,
    [producto_id, orden_compra_id, proveedor_id, costo_unitario, cantidad, activarAhora]
  );

  if (activarAhora) {
    // Desactivar lote anterior si existía
    if (activoActual.rows.length > 0) {
      await client.query(
        `UPDATE lotes_producto SET activo = false WHERE id = $1`,
        [activoActual.rows[0].id]
      );
    }
    // Pasar costoActivo leído ANTES de la desactivación para comparar correctamente
    const nuevoPrecio = await calcularNuevoPrecio(client, producto_id, costo_unitario, costoActivo);
    await client.query(`UPDATE productos SET precio = $1 WHERE id = $2`, [nuevoPrecio, producto_id]);
  }

  return nuevoLote.rows[0].id;
}

async function cambiarEstado(req, res) {
  const { id } = req.params;
  const { estado_id } = req.body;
  if (!estado_id) return res.status(400).json({ ok: false, mensaje: 'estado requerido' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orden = await client.query(
      'SELECT estado_id, proveedor_id FROM ordenes_compra WHERE id=$1', [id]
    );
    if (!orden.rows.length) return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });

    const nuevoEst = await client.query('SELECT nombre FROM estados WHERE id=$1', [estado_id]);
    const nombreNuevo = nuevoEst.rows[0]?.nombre?.toLowerCase() || '';
    const esCompletado = nombreNuevo.includes('complet') || nombreNuevo.includes('activ') || nombreNuevo.includes('recibi');

    if (esCompletado) {
      const estAnterior = await client.query(
        'SELECT nombre FROM estados WHERE id=$1', [orden.rows[0].estado_id]
      );
      const nombreAnterior = estAnterior.rows[0]?.nombre?.toLowerCase() || '';
      const yaCompletado = nombreAnterior.includes('complet') || nombreAnterior.includes('activ');

      if (!yaCompletado) {
        const detalle = await client.query(
          'SELECT producto_id, cantidad, costo_unitario FROM ordenes_compra_detalle WHERE orden_compra_id=$1',
          [id]
        );
        for (const item of detalle.rows) {
          await client.query(
            'UPDATE productos SET stock = stock + $1 WHERE id = $2',
            [item.cantidad, item.producto_id]
          );
          await registrarLote(client, {
            producto_id:     item.producto_id,
            proveedor_id:    orden.rows[0].proveedor_id,
            orden_compra_id: id,
            costo_unitario:  item.costo_unitario,
            cantidad:        item.cantidad,
          });
        }
      }
    }

    const r = await client.query(
      'UPDATE ordenes_compra SET estado_id=$1 WHERE id=$2 RETURNING *',
      [estado_id, id]
    );
    await client.query('COMMIT');
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally { client.release(); }
}

async function anular(req, res) {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orden = await client.query(
      `SELECT o.estado_id, e.nombre AS estado
       FROM ordenes_compra o
       LEFT JOIN estados e ON o.estado_id=e.id
       WHERE o.id=$1`,
      [id]
    );
    if (!orden.rows.length) return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });

    const estadoNom = orden.rows[0].estado?.toLowerCase() || '';
    if (estadoNom.includes('anula'))
      return res.status(400).json({ ok: false, mensaje: 'La orden ya está anulada' });

    if (estadoNom.includes('complet') || estadoNom.includes('activ')) {
      const detalle = await client.query(
        'SELECT producto_id, cantidad FROM ordenes_compra_detalle WHERE orden_compra_id=$1', [id]
      );

      for (const item of detalle.rows) {
        const sp = await client.query(
          'SELECT stock, nombre FROM productos WHERE id=$1', [item.producto_id]
        );
        const stockActual = +(sp.rows[0]?.stock || 0);
        if (stockActual < item.cantidad) {
          await client.query('ROLLBACK');
          const nombre = sp.rows[0]?.nombre || `producto #${item.producto_id}`;
          const vendidas = item.cantidad - stockActual;
          return res.status(400).json({
            ok: false,
            mensaje: `No se puede anular: ya se vendieron ${vendidas} unidad${vendidas !== 1 ? 'es' : ''} de "${nombre}" que entraron con esta orden`
          });
        }
      }

      for (const item of detalle.rows) {
        await client.query(
          'UPDATE productos SET stock = GREATEST(0, stock - $1) WHERE id=$2',
          [item.cantidad, item.producto_id]
        );
      }

      const lotesOrden = await client.query(
        'SELECT id, producto_id, activo FROM lotes_producto WHERE orden_compra_id=$1', [id]
      );
      for (const lote of lotesOrden.rows) {
        await client.query('DELETE FROM lotes_producto WHERE id=$1', [lote.id]);
        if (lote.activo) {
          const anterior = await client.query(
            `SELECT id, costo_unitario FROM lotes_producto
             WHERE producto_id=$1 AND cantidad_restante > 0
             ORDER BY fecha ASC LIMIT 1`,
            [lote.producto_id]
          );
          if (anterior.rows.length) {
            await client.query(
              'UPDATE lotes_producto SET activo=true WHERE id=$1',
              [anterior.rows[0].id]
            );
            // Al restaurar lote anterior, costoActivo es 0 (no hay lote activo ya)
            // así que siempre recalcula con el costo del lote restaurado
            const nuevoPrecio = await calcularNuevoPrecio(
              client, lote.producto_id, anterior.rows[0].costo_unitario, 0
            );
            await client.query(
              'UPDATE productos SET precio=$1 WHERE id=$2',
              [nuevoPrecio, lote.producto_id]
            );
          }
        }
      }
    }

    const estAnul = await client.query(
      `SELECT id FROM estados WHERE tipo='compra' AND LOWER(nombre) LIKE '%anula%' LIMIT 1`
    );
    const idAnulado = estAnul.rows[0]?.id;
    if (!idAnulado)
      return res.status(500).json({ ok: false, mensaje: 'Estado anulado no encontrado en BD' });

    await client.query('UPDATE ordenes_compra SET estado_id=$1 WHERE id=$2', [idAnulado, id]);
    await client.query('COMMIT');
    res.json({ ok: true, mensaje: 'Orden anulada' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally { client.release(); }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { fecha_compra, metodo_pago, notas } = req.body;
  try {
    const check = await pool.query(
      'SELECT e.nombre FROM ordenes_compra o LEFT JOIN estados e ON o.estado_id=e.id WHERE o.id=$1', [id]
    );
    if (!check.rows.length) return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });
    const nom = check.rows[0].nombre?.toLowerCase() || '';
    if (nom.includes('complet') || nom.includes('activ'))
      return res.status(400).json({ ok: false, mensaje: 'No se puede editar una orden completada' });
    if (nom.includes('anula'))
      return res.status(400).json({ ok: false, mensaje: 'No se puede editar una orden anulada' });

    const r = await pool.query(
      'UPDATE ordenes_compra SET fecha_compra=$1, metodo_pago=$2, notas=$3 WHERE id=$4 RETURNING *',
      [fecha_compra, metodo_pago || 'Efectivo', notas || null, id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
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
      SELECT od.*, pr.nombre AS producto, pr.codigo_barras,
        pr.stock AS stock_actual, pr.precio AS precio_venta_actual,
        COALESCE(pr.margen, c.margen, 45) AS margen_efectivo,
        lp.costo_unitario AS costo_lote_activo
      FROM ordenes_compra_detalle od
      JOIN productos pr ON od.producto_id=pr.id
      LEFT JOIN categorias c ON pr.categoria_id = c.id
      LEFT JOIN lotes_producto lp ON lp.producto_id = pr.id AND lp.activo = true
      WHERE od.orden_compra_id=$1
    `, [id]);

    const estadoNom = orden.rows[0].estado?.toLowerCase() || '';
    const yaCompletada = estadoNom.includes('complet') || estadoNom.includes('activ');

    const productosConPrecio = det.rows.map(p => {
      const margen = +p.margen_efectivo || 45;
      const costoActivo = p.costo_lote_activo ? +p.costo_lote_activo : 0;
      const nuevoCosto = +p.costo_unitario;

      const precioProyectado = nuevoCosto > costoActivo || +p.precio_venta_actual === 0
        ? redondear50(nuevoCosto * (1 + margen / 100))
        : +p.precio_venta_actual;

      return {
        ...p,
        precio_venta_proyectado: precioProyectado,
        precio_aplicado: yaCompletada ? +p.precio_venta_actual : null,
        sube_precio: nuevoCosto > costoActivo,
      };
    });

    res.json({ ok: true, datos: { ...orden.rows[0], productos: productosConPrecio } });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, cambiarEstado, anular, actualizar, detalle };