const pool = require('../config/db');
 
async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT r.*, COUNT(u.id) AS total_usuarios
      FROM roles r
      LEFT JOIN usuarios u ON u.rol_id=r.id
      GROUP BY r.id ORDER BY r.id
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function crear(req, res) {
  const { nombre, descripcion } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ ok: false, mensaje: 'el nombre es obligatorio' });
  try {
    const r = await pool.query(
      'INSERT INTO roles (nombre,descripcion) VALUES ($1,$2) RETURNING *',
      [nombre.trim(), descripcion||null]
    );
    // nuevo rol sin permisos por defecto
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function actualizar(req, res) {
  const { id } = req.params;
  if (+id === 1) return res.status(400).json({ ok: false, mensaje: 'el rol administrador no puede modificarse' });
  const { nombre, descripcion, estado } = req.body;
  try {
    const r = await pool.query(
      'UPDATE roles SET nombre=$1,descripcion=$2,estado=$3 WHERE id=$4 RETURNING *',
      [nombre, descripcion||null, estado??true, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'rol no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function toggleEstado(req, res) {
  const { id } = req.params;
  if (+id === 1) return res.status(400).json({ ok: false, mensaje: 'el rol administrador no puede desactivarse' });
  try {
    const r = await pool.query('UPDATE roles SET estado=NOT estado WHERE id=$1 RETURNING *', [id]);
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function eliminar(req, res) {
  const { id } = req.params;
  if (+id === 1) return res.status(400).json({ ok: false, mensaje: 'el rol administrador no puede eliminarse' });
  try {
    const usuarios = await pool.query('SELECT COUNT(*) AS total FROM usuarios WHERE rol_id=$1', [id]);
    if (+usuarios.rows[0].total > 0)
      return res.status(400).json({ ok: false, mensaje: 'no se puede eliminar, tiene usuarios asignados' });
    await pool.query('DELETE FROM roles WHERE id=$1', [id]);
    res.json({ ok: true, mensaje: 'rol eliminado' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function detalle(req, res) {
  const { id } = req.params;
  try {
    const rol = await pool.query('SELECT * FROM roles WHERE id=$1', [id]);
    if (!rol.rows.length) return res.status(404).json({ ok: false, mensaje: 'rol no encontrado' });
    const permisos = await pool.query(`
      SELECT p.* FROM permisos p
      JOIN roles_permisos rp ON rp.permiso_id=p.id
      WHERE rp.rol_id=$1
    `, [id]);
    res.json({ ok: true, datos: { ...rol.rows[0], permisos: permisos.rows } });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function listarPermisos(req, res) {
  try {
    const r = await pool.query('SELECT * FROM permisos ORDER BY modulo, nombre');
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function asignarPermisos(req, res) {
  const { id } = req.params;
  if (+id === 1) return res.status(400).json({ ok: false, mensaje: 'el rol administrador no puede modificarse' });
  const { permiso_ids } = req.body; // array de ids
  try {
    await pool.query('DELETE FROM roles_permisos WHERE rol_id=$1', [id]);
    if (permiso_ids?.length) {
      for (const pid of permiso_ids) {
        await pool.query('INSERT INTO roles_permisos (rol_id,permiso_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, pid]);
      }
    }
    res.json({ ok: true, mensaje: 'permisos actualizados' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
module.exports = { listar, crear, actualizar, toggleEstado, eliminar, detalle, listarPermisos, asignarPermisos };
