// server/services/emailService.js
// Sends transactional emails via Nodemailer (Gmail App Password or any SMTP).
// Configure via environment variables — see .env.example.

const nodemailer = require('nodemailer')

// ─── Transport ────────────────────────────────────────────────────────────────
function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env

  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP_USER and SMTP_PASS must be set in environment variables')
  }

  const host   = SMTP_HOST || 'smtp.gmail.com'
  const port   = parseInt(SMTP_PORT || '587', 10)
  const secure = SMTP_SECURE === 'true' || port === 465

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
}

// Lazy singleton — created on first send so startup never fails without env vars
let _transport = null
function getTransport() {
  if (!_transport) _transport = createTransport()
  return _transport
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sends a 6-digit OTP to the given email address.
 * @param {string} to   – recipient email
 * @param {string} name – recipient first name (for personalisation)
 * @param {string} otp  – the 6-digit code
 */
async function sendOtpEmail(to, name, otp) {
  const from      = process.env.SMTP_FROM || `"QuizPulse" <${process.env.SMTP_USER}>`
  const transport = getTransport()

  await transport.sendMail({
    from,
    to,
    subject: `${otp} is your QuizPulse verification code`,
    text: otpPlainText(name, otp),
    html: otpHtml(name, otp),
  })
}

// ─── Templates ────────────────────────────────────────────────────────────────

function otpPlainText(name, otp) {
  return `
Hi ${name},

Your QuizPulse verification code is: ${otp}

This code expires in 10 minutes. Do not share it with anyone.

If you did not request this, you can safely ignore this email.

— The QuizPulse team
`.trim()
}

function otpHtml(name, otp) {
  const digits = String(otp).split('').map(d => `
    <span style="
      display: inline-block;
      width: 44px;
      height: 56px;
      line-height: 56px;
      text-align: center;
      font-size: 28px;
      font-weight: 700;
      font-family: 'Courier New', monospace;
      background: #f1f5f9;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      color: #1e1b4b;
      margin: 0 3px;
    ">${d}</span>
  `).join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:28px 40px;text-align:center;">
              <span style="font-size:22px;font-weight:900;color:#818cf8;letter-spacing:-0.5px;">QuizPulse</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Verify your email</p>
              <p style="margin:0 0 28px;font-size:15px;color:#64748b;line-height:1.6;">
                Hi <strong>${name}</strong>, enter the code below to complete your QuizPulse account setup.
              </p>

              <!-- OTP digits -->
              <div style="text-align:center;margin:0 0 28px;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                ${digits}
              </div>

              <p style="margin:0 0 6px;font-size:13px;color:#94a3b8;text-align:center;">
                This code expires in <strong>10 minutes</strong>.
              </p>
              <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">
                Never share this code with anyone.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:12px;color:#cbd5e1;text-align:center;">
                If you didn't create a QuizPulse account, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim()
}

module.exports = { sendOtpEmail }