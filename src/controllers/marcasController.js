const pool = require('../config/db');

// migración automática al arrancar
async function crearTablaMarcaProveedores() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marca_proveedores (
      marca_id    INTEGER REFERENCES marcas(id) ON DELETE CASCADE,
      proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE CASCADE,
      PRIMARY KEY (marca_id, proveedor_id)
    )
  `)
  // migrar proveedor_id existente a la tabla intermedia
  await pool.query(`
    INSERT INTO marca_proveedores (marca_id, proveedor_id)
    SELECT id, proveedor_id FROM marcas
    WHERE proveedor_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `)
}
crearTablaMarcaProveedores().catch(console.error)

async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT m.*,
        COUNT(DISTINCT p.id) AS total_productos,
        COALESCE(
          STRING_AGG(DISTINCT pr.nombre, ', ' ORDER BY pr.nombre),
          ''
        ) AS proveedor,
        COALESCE(
          JSON_AGG(DISTINCT jsonb_build_object('id', pr.id, 'nombre', pr.nombre))
          FILTER (WHERE pr.id IS NOT NULL),
          '[]'
        ) AS proveedores
      FROM marcas m
      LEFT JOIN productos p ON p.marca_id = m.id
      LEFT JOIN marca_proveedores mp ON mp.marca_id = m.id
      LEFT JOIN proveedores pr ON mp.proveedor_id = pr.id
      GROUP BY m.id ORDER BY m.id DESC
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { nombre, descripcion, logo, proveedor_ids = [], sitio_web } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'el nombre es obligatorio' });
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existe = await client.query('SELECT id FROM marcas WHERE LOWER(nombre)=LOWER($1)', [nombre.trim()]);
    if (existe.rows.length) {
      await client.query('ROLLBACK')
      return res.status(400).json({ ok: false, mensaje: 'ya existe una marca con ese nombre' });
    }
    const r = await client.query(
      `INSERT INTO marcas (nombre,descripcion,logo,sitio_web)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [nombre.trim(), descripcion||null, logo||null, sitio_web||null]
    );
    const marcaId = r.rows[0].id
    const ids = Array.isArray(proveedor_ids) ? proveedor_ids : [proveedor_ids].filter(Boolean)
    for (const pid of ids) {
      await client.query('INSERT INTO marca_proveedores (marca_id, proveedor_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [marcaId, pid])
    }
    await client.query('COMMIT')
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally { client.release() }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre, descripcion, logo, proveedor_ids = [], sitio_web, estado } = req.body;
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await client.query(
      `UPDATE marcas SET nombre=$1,descripcion=$2,logo=$3,sitio_web=$4,estado=$5
       WHERE id=$6 RETURNING *`,
      [nombre, descripcion||null, logo||null, sitio_web||null, estado??true, id]
    );
    if (!r.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ ok: false, mensaje: 'marca no encontrada' });
    }
    // reemplazar proveedores
    await client.query('DELETE FROM marca_proveedores WHERE marca_id=$1', [id])
    const ids = Array.isArray(proveedor_ids) ? proveedor_ids : [proveedor_ids].filter(Boolean)
    for (const pid of ids) {
      await client.query('INSERT INTO marca_proveedores (marca_id, proveedor_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, pid])
    }
    await client.query('COMMIT')
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally { client.release() }
}

async function toggleEstado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query('UPDATE marcas SET estado=NOT estado WHERE id=$1 RETURNING *', [id]);
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function eliminar(req, res) {
  const { id } = req.params;
  try {
    const prods = await pool.query('SELECT COUNT(*) AS total FROM productos WHERE marca_id=$1', [id]);
    if (+prods.rows[0].total > 0)
      return res.status(400).json({ ok: false, mensaje: 'no se puede eliminar, tiene productos asociados' });
    await pool.query('DELETE FROM marcas WHERE id=$1', [id]);
    res.json({ ok: true, mensaje: 'marca eliminada' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const marca = await pool.query(`
      SELECT m.*,
        COALESCE(JSON_AGG(DISTINCT jsonb_build_object('id', pr.id, 'nombre', pr.nombre))
          FILTER (WHERE pr.id IS NOT NULL), '[]') AS proveedores
      FROM marcas m
      LEFT JOIN marca_proveedores mp ON mp.marca_id = m.id
      LEFT JOIN proveedores pr ON mp.proveedor_id = pr.id
      WHERE m.id=$1 GROUP BY m.id
    `, [id]);
    if (!marca.rows.length) return res.status(404).json({ ok: false, mensaje: 'marca no encontrada' });
    const prods = await pool.query(
      'SELECT id,nombre,precio,stock,estado FROM productos WHERE marca_id=$1 ORDER BY id DESC', [id]
    );
    res.json({ ok: true, datos: { ...marca.rows[0], productos: prods.rows } });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, actualizar, toggleEstado, eliminar, detalle };