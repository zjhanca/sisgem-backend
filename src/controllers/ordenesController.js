const pool = require('../config/db');

// Redondea al múltiplo de 50 más cercano (0, 50, 100, 150...)
// Ej: 955 → 950, 975 → 1000, 925 → 900
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
  // si viene como FormData, productos viene como string JSON
  if (typeof body.productos === 'string') {
    try { body.productos = JSON.parse(body.productos) } catch {}
  }
  const { proveedor_id, productos, fecha_compra, metodo_pago, notas, registrado_por } = body;
  if (!proveedor_id) return res.status(400).json({ ok: false, mensaje: 'proveedor requerido' });
  if (!productos?.length) return res.status(400).json({ ok: false, mensaje: 'agrega al menos un producto' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // estado pendiente de compra
    const estPend = await client.query(`SELECT id FROM estados WHERE tipo='compra' AND LOWER(nombre)='pendiente' LIMIT 1`);
    const estadoId = estPend.rows[0]?.id || 10;

    const total = productos.reduce((s, p) => s + +p.costo_unitario * +p.cantidad, 0);

    const regPor = registrado_por && +registrado_por > 0 ? +registrado_por : null

    const ord = await client.query(
      `INSERT INTO ordenes_compra (proveedor_id, estado_id, total, fecha_compra, metodo_pago, notas, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [proveedor_id, estadoId, total, fecha_compra || new Date(), metodo_pago || 'Efectivo', notas || null, regPor]
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

// Calcula el precio de venta a partir del costo unitario y el margen
// real configurado en la categoría del producto (categorias.margen).
// Si el producto no tiene categoría o la categoría no tiene margen, usa 45% por defecto.
async function calcularPrecioVenta(client, producto_id, costo_unitario) {
  const r = await client.query(
    `SELECT c.margen
     FROM productos p
     LEFT JOIN categorias c ON p.categoria_id = c.id
     WHERE p.id = $1`,
    [producto_id]
  );
  const margen = r.rows[0]?.margen != null ? +r.rows[0].margen : 45;
  return redondear50(+costo_unitario * (1 + margen / 100));
}

// Registra un lote nuevo de stock para un producto. Si no hay ningún lote
// activo con cantidad restante, este lote nuevo se activa de inmediato y
// se recalcula productos.precio. Si ya hay un lote activo con stock, el
// nuevo lote queda en cola (activo=false) y el precio NO cambia todavía.
async function registrarLote(client, { producto_id, proveedor_id, orden_compra_id, costo_unitario, cantidad }) {
  const activoActual = await client.query(
    `SELECT id, cantidad_restante FROM lotes_producto
     WHERE producto_id = $1 AND activo = true
     ORDER BY fecha ASC LIMIT 1`,
    [producto_id]
  );

  const hayLoteActivoConStock = activoActual.rows.length > 0 && activoActual.rows[0].cantidad_restante > 0;

  const nuevoLote = await client.query(
    `INSERT INTO lotes_producto (producto_id, orden_compra_id, proveedor_id, costo_unitario, cantidad_inicial, cantidad_restante, activo, fecha)
     VALUES ($1,$2,$3,$4,$5,$5,$6,NOW()) RETURNING id`,
    [producto_id, orden_compra_id, proveedor_id, costo_unitario, cantidad, !hayLoteActivoConStock]
  );

  if (!hayLoteActivoConStock) {
    // no había lote vigente con stock: este lote nuevo pasa a ser el activo y se recalcula el precio
    if (activoActual.rows.length > 0) {
      await client.query(`UPDATE lotes_producto SET activo = false WHERE id = $1`, [activoActual.rows[0].id]);
    }
    const precioVenta = await calcularPrecioVenta(client, producto_id, costo_unitario);
    await client.query(`UPDATE productos SET precio = $1 WHERE id = $2`, [precioVenta, producto_id]);
  }
  // si ya había lote activo con stock, no se toca el precio: el lote nuevo espera su turno

  return nuevoLote.rows[0].id;
}

async function cambiarEstado(req, res) {
  const { id } = req.params;
  const { estado_id } = req.body;
  if (!estado_id) return res.status(400).json({ ok: false, mensaje: 'estado requerido' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orden = await client.query('SELECT estado_id, proveedor_id FROM ordenes_compra WHERE id=$1', [id]);
    if (!orden.rows.length) return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });

    const nuevoEst = await client.query('SELECT nombre FROM estados WHERE id=$1', [estado_id]);
    const nombreNuevo = nuevoEst.rows[0]?.nombre?.toLowerCase() || '';
    const esCompletado = nombreNuevo.includes('complet') || nombreNuevo.includes('activ') || nombreNuevo.includes('recibi');

    if (esCompletado) {
      // verificar que no estaba ya en completado antes
      const estAnterior = await client.query('SELECT nombre FROM estados WHERE id=$1', [orden.rows[0].estado_id]);
      const nombreAnterior = estAnterior.rows[0]?.nombre?.toLowerCase() || '';
      const yaCompletado = nombreAnterior.includes('complet') || nombreAnterior.includes('activ');

      if (!yaCompletado) {
        const detalle = await client.query(
          'SELECT producto_id, cantidad, costo_unitario FROM ordenes_compra_detalle WHERE orden_compra_id=$1',
          [id]
        );
        for (const item of detalle.rows) {
          // sumar al stock global (como antes)
          await client.query('UPDATE productos SET stock = stock + $1 WHERE id = $2', [item.cantidad, item.producto_id]);
          // registrar el lote de costo correspondiente (puede activarse de inmediato o quedar en cola)
          await registrarLote(client, {
            producto_id: item.producto_id,
            proveedor_id: orden.rows[0].proveedor_id,
            orden_compra_id: id,
            costo_unitario: item.costo_unitario,
            cantidad: item.cantidad,
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
      'SELECT o.estado_id, e.nombre AS estado FROM ordenes_compra o LEFT JOIN estados e ON o.estado_id=e.id WHERE o.id=$1',
      [id]
    );
    if (!orden.rows.length) return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });

    const estadoNom = orden.rows[0].estado?.toLowerCase() || '';
    if (estadoNom.includes('anula')) return res.status(400).json({ ok: false, mensaje: 'La orden ya está anulada' });

    // si estaba completada, verificar que no se hayan vendido unidades antes de anular (Opción A)
    if (estadoNom.includes('complet') || estadoNom.includes('activ')) {
      const detalle = await client.query(
        'SELECT producto_id, cantidad FROM ordenes_compra_detalle WHERE orden_compra_id=$1', [id]
      );

      // bloquear si el stock actual < cantidad de la orden (ya se vendieron unidades de esta orden)
      for (const item of detalle.rows) {
        const sp = await client.query('SELECT stock, nombre FROM productos WHERE id=$1', [item.producto_id]);
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
      // eliminar los lotes generados por esta orden; si alguno estaba activo,
      // reactivar el lote anterior más reciente con stock (si existe) y recalcular precio
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
            await client.query('UPDATE lotes_producto SET activo=true WHERE id=$1', [anterior.rows[0].id]);
            const precioVenta = await calcularPrecioVenta(client, lote.producto_id, anterior.rows[0].costo_unitario);
            await client.query('UPDATE productos SET precio=$1 WHERE id=$2', [precioVenta, lote.producto_id]);
          }
        }
      }
    }

    // buscar estado anulado de compra
    const estAnul = await client.query(`SELECT id FROM estados WHERE tipo='compra' AND LOWER(nombre) LIKE '%anula%' LIMIT 1`);
    const idAnulado = estAnul.rows[0]?.id;
    if (!idAnulado) return res.status(500).json({ ok: false, mensaje: 'Estado anulado no encontrado en BD' });

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
    // bloquear edición si está completada o anulada
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
      SELECT od.*, pr.nombre AS producto, pr.codigo_barras, pr.stock AS stock_actual,
        pr.precio AS precio_venta_actual, c.margen AS margen_categoria
      FROM ordenes_compra_detalle od
      JOIN productos pr ON od.producto_id=pr.id
      LEFT JOIN categorias c ON pr.categoria_id = c.id
      WHERE od.orden_compra_id=$1
    `, [id]);

    const estadoNom = orden.rows[0].estado?.toLowerCase() || '';
    const yaCompletada = estadoNom.includes('complet') || estadoNom.includes('activ');

    const productosConPrecio = det.rows.map(p => {
      const margen = p.margen_categoria != null ? +p.margen_categoria : 45;
      return {
        ...p,
        precio_venta_proyectado: redondear50(+p.costo_unitario * (1 + margen / 100)),
        // si ya se completó, el precio actual del producto puede o no reflejar esta
        // compra específica (depende de si su lote ya quedó activo o sigue en cola)
        precio_aplicado: yaCompletada ? +p.precio_venta_actual : null,
      };
    });

    res.json({ ok: true, datos: { ...orden.rows[0], productos: productosConPrecio } });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, cambiarEstado, anular, actualizar, detalle };