const AVATAR_COLORS = [
  { bg: 'rgba(245,158,11,.15)', color: '#fbbf24' },
  { bg: 'rgba(148,163,184,.12)', color: '#94a3b8' },
  { bg: 'rgba(180,83,9,.12)', color: '#d97706' },
  { bg: 'rgba(99,102,241,.15)', color: 'var(--indigo-l)' },
  { bg: 'rgba(34,197,94,.12)', color: 'var(--green-l)' },
  { bg: 'rgba(239,68,68,.1)', color: '#f87171' },
  { bg: 'rgba(168,85,247,.12)', color: '#c084fc' },
  { bg: 'rgba(14,165,233,.12)', color: '#38bdf8' },
]

export default function Leaderboard({ data = [], highlightId = null }) {
  return (
    <div>
      {data.map((player, idx) => {
        const rank = player.rank || idx + 1
        const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : ''
        const isMe = highlightId && (player.playerId === highlightId || player.id === highlightId)
        const colors = AVATAR_COLORS[idx % AVATAR_COLORS.length]
        const initials = player.name ? player.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '??'

        return (
          <div
            key={player.playerId || player.id || player.name || idx}
            className={`lb-row ${isMe ? 'me' : ''}`}
          >
            <div className={`lb-rank ${rankClass}`}>{rank}</div>
            <div
              className="lb-av"
              style={{ background: colors.bg, color: colors.color }}
            >
              {initials}
            </div>
            <div className="lb-name">
              {player.name}
              {isMe && <span style={{ fontSize: 10, color: 'var(--indigo-l)', marginLeft: 6, fontWeight: 800 }}>(YOU)</span>}
            </div>
            <div className="lb-score">{player.score?.toLocaleString() || 0}</div>
            {player.rankChange !== undefined && player.rankChange !== 0 && (
              <div style={{ fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {player.rankChange > 0 && <span style={{ color: 'var(--green-l)' }}>▲{player.rankChange}</span>}
                {player.rankChange < 0 && <span style={{ color: '#f87171' }}>▼{Math.abs(player.rankChange)}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
