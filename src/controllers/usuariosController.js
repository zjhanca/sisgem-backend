const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// transporter de Gmail SMTP — usa variables de entorno GMAIL_USER y GMAIL_PASS
// GMAIL_PASS debe ser un App Password de Google (no la contraseña normal de Gmail)
// Para obtenerlo: Google Account → Seguridad → Verificación en 2 pasos → App passwords
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// genera contraseña aleatoria segura
function generarPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const nums  = '23456789'
  const all   = upper + lower + nums
  let pass = upper[Math.floor(Math.random()*upper.length)]
           + nums[Math.floor(Math.random()*nums.length)]
  for (let i = 0; i < 6; i++) pass += all[Math.floor(Math.random()*all.length)]
  return pass.split('').sort(() => Math.random()-0.5).join('')
}

async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT u.id,u.nombre,u.apellido,u.email,u.telefono,u.estado,
             u.rol_id,u.tipo_documento,u.numero_documento,r.nombre AS rol
      FROM usuarios u JOIN roles r ON u.rol_id=r.id ORDER BY u.id DESC
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { nombre, apellido, email, telefono, rol_id, tipo_documento, numero_documento } = req.body;
  if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !rol_id)
    return res.status(400).json({ ok: false, mensaje: 'todos los campos obligatorios son requeridos' });
  try {
    const password = generarPassword();
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      `INSERT INTO usuarios (nombre,apellido,email,password,telefono,rol_id,tipo_documento,numero_documento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,nombre,apellido,email,rol_id`,
      [nombre.trim(), apellido.trim(), email.toLowerCase().trim(), hash,
       telefono||null, rol_id, tipo_documento||'CC', numero_documento||null]
    );

    // enviar contraseña por correo — el usuario ya quedó creado en BD aunque el correo falle
    const loginUrl = process.env.FRONTEND_URL || 'https://sisgem-frontend.vercel.app'
    let emailEnviado = true;
    let emailError = null;

    try {
      await transporter.sendMail({
        from: `"SISGEM" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Bienvenido a SISGEM — Tus credenciales de acceso',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e7eb">
            <h2 style="color:#1E9E50;margin:0 0 4px">SISGEM</h2>
            <p style="color:#6b7280;margin:0 0 24px;font-size:13px">Sistema de Gestión para Minimercado</p>
            <h3 style="margin:0 0 12px;font-size:16px;color:#1D3326">Hola, ${nombre.trim()} 👋</h3>
            <p style="color:#6b7280;font-size:14px;line-height:1.6">
              Tu cuenta ha sido creada en SISGEM. Aquí están tus credenciales de acceso:
            </p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:0 0 8px;font-size:13px"><strong>Correo:</strong> ${email.toLowerCase().trim()}</p>
              <p style="margin:0;font-size:13px"><strong>Contraseña temporal:</strong>
                <span style="font-family:monospace;background:#1E9E50;color:white;padding:2px 8px;border-radius:4px;margin-left:4px">${password}</span>
              </p>
            </div>
            <p style="color:#ef4444;font-size:13px;font-weight:600">Por seguridad, cambia tu contraseña después de iniciar sesión.</p>
            <div style="text-align:center;margin:24px 0">
              <a href="${loginUrl}/login" style="background:#1E9E50;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
                Iniciar Sesión
              </a>
            </div>
          </div>
        `
      });
      console.log(`[usuarios.crear] Correo enviado a ${email}`);
    } catch (mailErr) {
      emailEnviado = false;
      emailError = mailErr.message;
      console.error(`[usuarios.crear] Error al enviar correo a ${email}:`, mailErr.message);
    }

    res.status(201).json({
      ok: true,
      datos: r.rows[0],
      email_enviado: emailEnviado,
      ...(!emailEnviado && { email_error: emailError, password_temporal: password }),
    });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ ok: false, mensaje: 'el correo ya esta registrado' });
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre, apellido, email, password, telefono, rol_id, tipo_documento, numero_documento, estado } = req.body;
  try {
    let query, params;
    if (password) {
      if (password.length < 6) return res.status(400).json({ ok: false, mensaje: 'minimo 6 caracteres' });
      const hash = await bcrypt.hash(password, 10);
      query = `UPDATE usuarios SET nombre=$1,apellido=$2,email=$3,password=$4,telefono=$5,
               rol_id=$6,tipo_documento=$7,numero_documento=$8,estado=$9 WHERE id=$10
               RETURNING id,nombre,apellido,email,rol_id,estado`;
      params = [nombre, apellido, email.toLowerCase(), hash, telefono||null,
                rol_id, tipo_documento||'CC', numero_documento||null, estado??true, id];
    } else {
      query = `UPDATE usuarios SET nombre=$1,apellido=$2,email=$3,telefono=$4,
               rol_id=$5,tipo_documento=$6,numero_documento=$7,estado=$8 WHERE id=$9
               RETURNING id,nombre,apellido,email,rol_id,estado`;
      params = [nombre, apellido, email.toLowerCase(), telefono||null,
                rol_id, tipo_documento||'CC', numero_documento||null, estado??true, id];
    }
    const r = await pool.query(query, params);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'usuario no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function toggleEstado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query('UPDATE usuarios SET estado=NOT estado WHERE id=$1 RETURNING *', [id]);
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function eliminar(req, res) {
  const { id } = req.params;
  try {
    const pedidos = await pool.query('SELECT COUNT(*) AS total FROM pedidos WHERE usuario_id=$1', [id]);
    if (+pedidos.rows[0].total > 0)
      return res.status(400).json({ ok: false, mensaje: 'no se puede eliminar, tiene pedidos asociados' });
    await pool.query('DELETE FROM usuarios WHERE id=$1', [id]);
    res.json({ ok: true, mensaje: 'usuario eliminado' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function cambiarContrasena(req, res) {
  const id = req.usuario.id
  const { actual, nueva } = req.body
  if (!actual || !nueva)
    return res.status(400).json({ ok: false, mensaje: 'contraseña actual y nueva son requeridas' })
  if (nueva.length < 6)
    return res.status(400).json({ ok: false, mensaje: 'la nueva contraseña debe tener mínimo 6 caracteres' })
  try {
    const r = await pool.query('SELECT password FROM usuarios WHERE id=$1', [id])
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'usuario no encontrado' })
    const ok = await bcrypt.compare(actual, r.rows[0].password)
    if (!ok) return res.status(400).json({ ok: false, mensaje: 'La contraseña actual es incorrecta' })
    const hash = await bcrypt.hash(nueva, 10)
    await pool.query('UPDATE usuarios SET password=$1 WHERE id=$2', [hash, id])
    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' })
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }) }
}

module.exports = { listar, crear, actualizar, toggleEstado, eliminar, cambiarContrasena };