const pool = require('../config/db');

// Trae, para una lista de ids de producto, el lote activo y el siguiente lote
// en cola de cada uno (si existe), con su precio de venta proyectado según el
// margen real de la categoría. Se usa para enriquecer listar() y buscarPorCodigo().
async function adjuntarInfoLotes(rows) {
  if (!rows.length) return rows;
  const ids = rows.map(r => r.id);

  const lotes = await pool.query(`
    SELECT lp.id, lp.producto_id, lp.costo_unitario, lp.cantidad_restante, lp.activo, lp.fecha,
      c.margen
    FROM lotes_producto lp
    JOIN productos p ON p.id = lp.producto_id
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE lp.producto_id = ANY($1) AND lp.cantidad_restante > 0
    ORDER BY lp.producto_id, lp.fecha ASC
  `, [ids]);

  const porProducto = {};
  for (const l of lotes.rows) {
    (porProducto[l.producto_id] ||= []).push(l);
  }

  return rows.map(r => {
    const lotesProd = porProducto[r.id] || [];
    const activo = lotesProd.find(l => l.activo) || lotesProd[0] || null;
    const siguiente = lotesProd.find(l => l.id !== activo?.id) || null;

    const calcPrecio = (costo, margen) => Math.ceil(+costo * (1 + (margen != null ? +margen : 45) / 100));

    return {
      ...r,
      stock_lote_activo: activo ? activo.cantidad_restante : null,
      costo_lote_activo: activo ? activo.costo_unitario : null,
      siguiente_lote: siguiente ? {
        id: siguiente.id,
        cantidad_disponible: siguiente.cantidad_restante,
        costo_unitario: siguiente.costo_unitario,
        precio_venta_proyectado: calcPrecio(siguiente.costo_unitario, siguiente.margen),
      } : null,
    };
  });
}

async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT p.*, c.nombre AS categoria, pr.nombre AS proveedor, m.nombre AS marca
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id=c.id
      LEFT JOIN proveedores pr ON p.proveedor_id=pr.id
      LEFT JOIN marcas m ON p.marca_id=m.id
      ORDER BY p.id DESC
    `);
    const conLotes = await adjuntarInfoLotes(r.rows);
    res.json({ ok: true, datos: conLotes });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { nombre, descripcion, precio, categoria_id,
          proveedor_id, marca_id, codigo_barras, imagen_url, imagenes } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'nombre obligatorio' });
  try {
    if (codigo_barras) {
      const dup = await pool.query('SELECT id FROM productos WHERE codigo_barras=$1', [codigo_barras]);
      if (dup.rows.length) return res.status(400).json({ ok: false, mensaje: 'codigo de barras ya existe' });
    }
    // imagenes: usar array enviado o construir desde imagen_url
    const imgs = Array.isArray(imagenes) && imagenes.length > 0
      ? imagenes
      : (imagen_url ? [imagen_url] : [])
    const primeraImg = imgs[0] || imagen_url || null

    const r = await pool.query(
      `INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id,
         proveedor_id, marca_id, codigo_barras, imagen_url, imagenes)
       VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [nombre.trim(), descripcion||null, precio||0,
       categoria_id||null, proveedor_id||null, marca_id||null,
       codigo_barras||null, primeraImg, JSON.stringify(imgs)]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre, descripcion, precio, stock, categoria_id,
          proveedor_id, marca_id, codigo_barras, imagen_url, imagenes, estado } = req.body;
  try {
    // imagenes: usar array enviado o construir desde imagen_url
    const imgs = Array.isArray(imagenes) && imagenes.length > 0
      ? imagenes
      : (imagen_url ? [imagen_url] : [])
    const primeraImg = imgs[0] || imagen_url || null

    const r = await pool.query(
      `UPDATE productos SET nombre=$1, descripcion=$2, precio=$3, stock=$4,
         categoria_id=$5, proveedor_id=$6, marca_id=$7, codigo_barras=$8,
         imagen_url=$9, imagenes=$10, estado=$11
       WHERE id=$12 RETURNING *`,
      [nombre, descripcion||null, precio, stock,
       categoria_id||null, proveedor_id||null, marca_id||null,
       codigo_barras||null, primeraImg, JSON.stringify(imgs), estado??true, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'producto no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function toggleEstado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query('UPDATE productos SET estado=NOT estado WHERE id=$1 RETURNING *', [id]);
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function eliminar(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM productos WHERE id=$1', [id]);
    res.json({ ok: true, mensaje: 'producto eliminado' });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ ok: false, mensaje: 'tiene movimientos asociados' });
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}

async function buscarPorCodigo(req, res) {
  const { codigo } = req.params;
  try {
    const r = await pool.query(`
      SELECT p.*, c.nombre AS categoria, m.nombre AS marca
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id=c.id
      LEFT JOIN marcas m ON p.marca_id=m.id
      WHERE p.codigo_barras=$1 AND p.estado=true
    `, [codigo]);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'producto no encontrado' });
    const [conLotes] = await adjuntarInfoLotes(r.rows);
    res.json({ ok: true, datos: conLotes });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, actualizar, toggleEstado, eliminar, buscarPorCodigo };