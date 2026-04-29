export default function CountdownTimer({ remaining, timeLimit }) {
  if (remaining === null || remaining === undefined || timeLimit === null || timeLimit === undefined) return null

  const percentage = Math.max(0, (remaining / timeLimit) * 100)

  // Colour shifts: green → yellow → red
  function getColor() {
    if (percentage > 60) return '#22c55e'
    if (percentage > 30) return '#eab308'
    return '#ef4444'
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>Time left</span>
        <span className="mono" style={{ fontSize: 14, fontWeight: 800, color: getColor() }}>{remaining}s</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            background: getColor(),
            borderRadius: 8,
            transition: 'width 0.9s linear, background 0.5s',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute', right: 0, top: 0,
              height: '100%', width: 20,
              background: 'linear-gradient(to right, transparent, rgba(255,255,255,.4))',
              filter: 'blur(3px)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
