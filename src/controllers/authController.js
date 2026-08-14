const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 2525,
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASS,
  },
});

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ ok: false, mensaje: 'email y contrasena son requeridos' });
  try {
    const r = await pool.query(
      `SELECT u.*, r.nombre AS rol FROM usuarios u JOIN roles r ON u.rol_id=r.id
       WHERE u.email=$1 AND u.estado=true`, [email.toLowerCase().trim()]
    );
    if (!r.rows.length) return res.status(401).json({ ok: false, mensaje: 'credenciales incorrectas' });
    const usuario = r.rows[0];
    const ok = await bcrypt.compare(password, usuario.password);
    if (!ok) return res.status(401).json({ ok: false, mensaje: 'credenciales incorrectas' });
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol_id: usuario.rol_id },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '8h' }
    );
    const { password: _, ...datos } = usuario;
    res.json({ ok: true, token, usuario: datos });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function registro(req, res) {
  const { nombre, apellido, email, password, telefono, tipo_documento, numero_documento } = req.body;
  if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !password)
    return res.status(400).json({ ok: false, mensaje: 'nombre, apellido, email y contrasena son obligatorios' });
  if (password.length < 6)
    return res.status(400).json({ ok: false, mensaje: 'la contrasena debe tener minimo 6 caracteres' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar si ya existe en usuarios
    const existe = await client.query(
      'SELECT id FROM usuarios WHERE LOWER(email)=$1', [email.toLowerCase().trim()]
    );
    if (existe.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, mensaje: 'el correo ya esta registrado' });
    }

    // Obtener rol cliente
    const rolCliente = await client.query(
      "SELECT id FROM roles WHERE LOWER(nombre) LIKE '%cliente%' LIMIT 1"
    );
    const rol_id = rolCliente.rows[0]?.id || 11;

    const hash = await bcrypt.hash(password, 10);
    const usr = await client.query(
      `INSERT INTO usuarios (nombre,apellido,email,password,telefono,rol_id,tipo_documento,numero_documento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,nombre,apellido,email,rol_id`,
      [nombre.trim(), apellido.trim(), email.toLowerCase().trim(), hash,
       telefono||null, rol_id, tipo_documento||'CC', numero_documento||null]
    );
    const usuario_id = usr.rows[0].id;

    // Insertar en clientes — si ya existe por email lo actualiza (ON CONFLICT)
    await client.query(
      `INSERT INTO clientes (nombre,apellido,email,telefono,tipo_documento,numero_documento)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         apellido = EXCLUDED.apellido,
         telefono = COALESCE(EXCLUDED.telefono, clientes.telefono),
         tipo_documento = COALESCE(EXCLUDED.tipo_documento, clientes.tipo_documento),
         numero_documento = COALESCE(EXCLUDED.numero_documento, clientes.numero_documento)`,
      [nombre.trim(), apellido.trim(), email.toLowerCase().trim(),
       telefono||null, tipo_documento||'CC', numero_documento||null]
    );

    await client.query('COMMIT');

    const token = jwt.sign(
      { id: usuario_id, email: email.toLowerCase(), rol_id },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '8h' }
    );
    res.status(201).json({
      ok: true, token,
      usuario: {
        id: usuario_id,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.toLowerCase(),
        rol_id
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505')
      return res.status(400).json({ ok: false, mensaje: 'el correo ya esta registrado' });
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally { client.release(); }
}

async function verificar(req, res) {
  const { email, documento } = req.query;
  try {
    const resultado = { email_existe: false, documento_existe: false }
    if (email) {
      const r = await pool.query(
        'SELECT id FROM usuarios WHERE LOWER(email)=$1', [email.toLowerCase().trim()]
      );
      resultado.email_existe = r.rows.length > 0;
    }
    if (documento) {
      const r = await pool.query(
        'SELECT id FROM usuarios WHERE numero_documento=$1', [documento.trim()]
      );
      resultado.documento_existe = r.rows.length > 0;
    }
    res.json({ ok: true, ...resultado });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function recuperar(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ ok: false, mensaje: 'El correo es requerido' });
  try {
    const r = await pool.query(
      'SELECT id, nombre FROM usuarios WHERE LOWER(email)=$1 AND estado=true',
      [email.toLowerCase().trim()]
    );
    if (r.rows.length) {
      const usuario = r.rows[0];
      const token = crypto.randomBytes(32).toString('hex');
      const expira = new Date(Date.now() + 60 * 60 * 1000);
      await pool.query('UPDATE recuperacion_tokens SET usado=true WHERE usuario_id=$1', [usuario.id]);
      await pool.query(
        'INSERT INTO recuperacion_tokens (usuario_id, token, expira_en) VALUES ($1, $2, $3)',
        [usuario.id, token, expira]
      );
      const urlReset = `${process.env.FRONTEND_URL || 'https://sisgem-frontend.vercel.app'}/reset-password?token=${token}`;
      await transporter.sendMail({
        from: 'SISGEM <minimercado24123@gmail.com>',
        to: email,
        subject: 'Recuperación de contraseña — SISGEM',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0f1117;color:#e2e8f0;padding:32px;border-radius:16px;">
            <h2 style="color:#4ade80;margin:0 0 4px;">SISGEM</h2>
            <p style="color:#94a3b8;margin:0 0 24px;font-size:13px;">Sistema de Gestión para Minimercado</p>
            <h3 style="margin:0 0 12px;font-size:16px;">Hola, ${usuario.nombre} 👋</h3>
            <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
              Recibimos una solicitud para restablecer tu contraseña.
              Este enlace expira en <strong style="color:#e2e8f0;">1 hora</strong>.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${urlReset}" style="background:#4ade80;color:#0f1117;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">
                Restablecer Contraseña
              </a>
            </div>
            <p style="color:#64748b;font-size:12px;">Si no solicitaste esto, ignora este correo.<br><br>
              <span style="color:#4ade80;word-break:break-all;">${urlReset}</span>
            </p>
          </div>
        `
      });
    }
    res.json({ ok: true, mensaje: 'Si el correo está registrado, recibirás las instrucciones.' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al procesar la solicitud' });
  }
}

async function resetPassword(req, res) {
  const { token, nueva } = req.body;
  if (!token || !nueva)
    return res.status(400).json({ ok: false, mensaje: 'token y nueva contraseña son requeridos' });
  if (nueva.length < 6)
    return res.status(400).json({ ok: false, mensaje: 'mínimo 6 caracteres' });
  try {
    const r = await pool.query(
      'SELECT usuario_id, expira_en, usado FROM recuperacion_tokens WHERE token=$1', [token]
    );
    if (!r.rows.length) return res.status(400).json({ ok: false, mensaje: 'Token inválido' });
    const t = r.rows[0];
    if (t.usado) return res.status(400).json({ ok: false, mensaje: 'Este enlace ya fue utilizado' });
    if (new Date(t.expira_en) < new Date()) return res.status(400).json({ ok: false, mensaje: 'El enlace ha expirado' });
    const hash = await bcrypt.hash(nueva, 10);
    await pool.query('UPDATE usuarios SET password=$1 WHERE id=$2', [hash, t.usuario_id]);
    await pool.query('UPDATE recuperacion_tokens SET usado=true WHERE token=$1', [token]);
    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function cambiarPassword(req, res) {
  const { actual, nueva } = req.body;
  if (!actual || !nueva)
    return res.status(400).json({ ok: false, mensaje: 'contraseña actual y nueva son requeridas' });
  if (nueva.length < 6)
    return res.status(400).json({ ok: false, mensaje: 'la nueva contraseña debe tener mínimo 6 caracteres' });
  try {
    const r = await pool.query(
      'SELECT password FROM usuarios WHERE id=$1 AND estado=true', [req.usuario.id]
    );
    if (!r.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'usuario no encontrado' });
    const ok = await bcrypt.compare(actual, r.rows[0].password);
    if (!ok)
      return res.status(401).json({ ok: false, mensaje: 'Contraseña actual incorrecta' });
    const hash = await bcrypt.hash(nueva, 10);
    await pool.query('UPDATE usuarios SET password=$1 WHERE id=$2', [hash, req.usuario.id]);
    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { login, registro, verificar, recuperar, resetPassword, cambiarPassword };