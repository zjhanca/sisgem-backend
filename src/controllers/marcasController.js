const pool = require('../config/db');
 
async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT m.*, COUNT(p.id) AS total_productos, pr.nombre AS proveedor
      FROM marcas m
      LEFT JOIN productos p ON p.marca_id = m.id
      LEFT JOIN proveedores pr ON m.proveedor_id = pr.id
      GROUP BY m.id, pr.nombre ORDER BY m.id DESC
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function crear(req, res) {
  const { nombre, descripcion, logo, proveedor_id, sitio_web } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'el nombre es obligatorio' });
  try {
    const existe = await pool.query('SELECT id FROM marcas WHERE LOWER(nombre)=LOWER($1)', [nombre.trim()]);
    if (existe.rows.length) return res.status(400).json({ ok: false, mensaje: 'ya existe una marca con ese nombre' });
    const r = await pool.query(
      `INSERT INTO marcas (nombre,descripcion,logo,proveedor_id,sitio_web)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [nombre.trim(), descripcion||null, logo||null, proveedor_id||null, sitio_web||null]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre, descripcion, logo, proveedor_id, sitio_web, estado } = req.body;
  try {
    const r = await pool.query(
      `UPDATE marcas SET nombre=$1,descripcion=$2,logo=$3,proveedor_id=$4,sitio_web=$5,estado=$6
       WHERE id=$7 RETURNING *`,
      [nombre, descripcion||null, logo||null, proveedor_id||null, sitio_web||null, estado??true, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'marca no encontrada' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
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
    const marca = await pool.query('SELECT * FROM marcas WHERE id=$1', [id]);
    if (!marca.rows.length) return res.status(404).json({ ok: false, mensaje: 'marca no encontrada' });
    const prods = await pool.query(
      'SELECT id,nombre,precio,stock,estado FROM productos WHERE marca_id=$1 ORDER BY id DESC', [id]
    );
    res.json({ ok: true, datos: { ...marca.rows[0], productos: prods.rows } });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
module.exports = { listar, crear, actualizar, toggleEstado, eliminar, detalle };
 
 
