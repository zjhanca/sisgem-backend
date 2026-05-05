const pool = require('../config/db');
 
async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT p.*, c.nombre AS categoria, pr.nombre AS proveedor, m.nombre AS marca
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      LEFT JOIN marcas m ON p.marca_id = m.id
      ORDER BY p.id DESC
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function crear(req, res) {
  const { nombre, descripcion, precio, stock, categoria_id,
          proveedor_id, marca_id, codigo_barras, imagen_url } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'el nombre es obligatorio' });
  if (!precio || +precio <= 0) return res.status(400).json({ ok: false, mensaje: 'precio invalido' });
  if (stock === undefined || +stock < 0) return res.status(400).json({ ok: false, mensaje: 'stock invalido' });
  try {
    if (codigo_barras) {
      const existe = await pool.query('SELECT id FROM productos WHERE codigo_barras=$1', [codigo_barras]);
      if (existe.rows.length)
        return res.status(400).json({ ok: false, mensaje: 'el codigo de barras ya existe' });
    }
    const r = await pool.query(
      `INSERT INTO productos (nombre,descripcion,precio,stock,categoria_id,
         proveedor_id,marca_id,codigo_barras,imagen_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [nombre.trim(), descripcion||null, precio, stock,
       categoria_id||null, proveedor_id||null, marca_id||null,
       codigo_barras||null, imagen_url||null]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre, descripcion, precio, stock, categoria_id,
          proveedor_id, marca_id, codigo_barras, imagen_url, estado } = req.body;
  try {
    const r = await pool.query(
      `UPDATE productos SET nombre=$1,descripcion=$2,precio=$3,stock=$4,
         categoria_id=$5,proveedor_id=$6,marca_id=$7,
         codigo_barras=$8,imagen_url=$9,estado=$10
       WHERE id=$11 RETURNING *`,
      [nombre, descripcion||null, precio, stock,
       categoria_id||null, proveedor_id||null, marca_id||null,
       codigo_barras||null, imagen_url||null, estado??true, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'producto no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function toggleEstado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query('UPDATE productos SET estado = NOT estado WHERE id=$1 RETURNING *', [id]);
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function eliminar(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM productos WHERE id=$1', [id]);
    res.json({ ok: true, mensaje: 'producto eliminado' });
  } catch (err) {
    if (err.code === '23503')
      return res.status(400).json({ ok: false, mensaje: 'no se puede eliminar, tiene movimientos' });
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}
 
async function buscarPorCodigo(req, res) {
  const { codigo } = req.params;
  try {
    const r = await pool.query(
      `SELECT p.*, c.nombre AS categoria, m.nombre AS marca
       FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       LEFT JOIN marcas m ON p.marca_id = m.id
       WHERE p.codigo_barras = $1 AND p.estado = true`, [codigo]
    );
    if (!r.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'producto no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
module.exports = { listar, crear, actualizar, toggleEstado, eliminar, buscarPorCodigo };
 
