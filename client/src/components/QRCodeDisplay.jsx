import { QRCodeSVG } from 'qrcode.react'

export default function QRCodeDisplay({ roomCode }) {
  const joinUrl = `${window.location.origin}/join/${roomCode}`

  return (
    <div style={{ textAlign: 'center' }}>
      <div className="qr-box" style={{ marginBottom: 14 }}>
        <QRCodeSVG
          value={joinUrl}
          size={180}
          bgColor="#ffffff"
          fgColor="#0d0d14"
          level="M"
          style={{ display: 'block', borderRadius: 4 }}
        />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
        Scan to join, or enter code:
      </p>
      <strong
        className="mono"
        style={{ fontSize: '2rem', letterSpacing: '0.3em', color: 'var(--indigo-l)' }}
      >
        {roomCode}
      </strong>
    </div>
  )
}
