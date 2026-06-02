const pool = require('../config/db');

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

async function cambiarEstado(req, res) {
  const { id } = req.params;
  const { estado_id } = req.body;
  if (!estado_id) return res.status(400).json({ ok: false, mensaje: 'estado requerido' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orden = await client.query('SELECT estado_id FROM ordenes_compra WHERE id=$1', [id]);
    if (!orden.rows.length) return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });

    const nuevoEst = await client.query('SELECT nombre FROM estados WHERE id=$1', [estado_id]);
    const nombreNuevo = nuevoEst.rows[0]?.nombre?.toLowerCase() || '';
    const esCompletado = nombreNuevo.includes('complet') || nombreNuevo.includes('activ') || nombreNuevo.includes('recibi');
    const yaEraCompletado = (() => {
      // verificar si ya estaba en completado
      return false; // se deja pasar — la lógica de no repetir stock se maneja arriba
    })();

    if (esCompletado) {
      // verificar que no estaba ya en completado antes
      const estAnterior = await client.query('SELECT nombre FROM estados WHERE id=$1', [orden.rows[0].estado_id]);
      const nombreAnterior = estAnterior.rows[0]?.nombre?.toLowerCase() || '';
      const yaCompletado = nombreAnterior.includes('complet') || nombreAnterior.includes('activ');

      if (!yaCompletado) {
        // actualizar stock y precio de venta (margen 45%)
        const detalle = await client.query(
          'SELECT producto_id, cantidad, costo_unitario FROM ordenes_compra_detalle WHERE orden_compra_id=$1',
          [id]
        );
        for (const item of detalle.rows) {
          const precioVenta = Math.ceil(+item.costo_unitario * 1.45);
          await client.query(
            'UPDATE productos SET stock = stock + $1, precio = $2 WHERE id = $3',
            [item.cantidad, precioVenta, item.producto_id]
          );
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

    // si estaba completada, devolver el stock
    if (estadoNom.includes('complet') || estadoNom.includes('activ')) {
      const detalle = await client.query(
        'SELECT producto_id, cantidad FROM ordenes_compra_detalle WHERE orden_compra_id=$1', [id]
      );
      for (const item of detalle.rows) {
        await client.query(
          'UPDATE productos SET stock = GREATEST(0, stock - $1) WHERE id=$2',
          [item.cantidad, item.producto_id]
        );
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
    const r = await pool.query(
      'UPDATE ordenes_compra SET fecha_compra=$1, metodo_pago=$2, notas=$3 WHERE id=$4 RETURNING *',
      [fecha_compra, metodo_pago || 'Efectivo', notas || null, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });
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
      SELECT od.*, pr.nombre AS producto, pr.codigo_barras, pr.stock AS stock_actual
      FROM ordenes_compra_detalle od
      JOIN productos pr ON od.producto_id=pr.id
      WHERE od.orden_compra_id=$1
    `, [id]);
    res.json({ ok: true, datos: { ...orden.rows[0], productos: det.rows } });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, cambiarEstado, anular, actualizar, detalle };