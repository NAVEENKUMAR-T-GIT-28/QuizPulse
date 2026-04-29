import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'

export default function LiveBarChart({ votes = [], options = [], correctIndex = null }) {
  const data = options.map((label, i) => ({
    name: label,
    votes: votes[i] || 0,
  }))

  function getBarColor(index) {
    if (correctIndex === null) return '#6366f1'   // indigo while voting
    return index === correctIndex ? '#22c55e' : '#ef4444'  // green correct, red wrong
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="name"
          tick={{ fill: '#9395a8', fontSize: 12, fontWeight: 600 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: '#5a5c72', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1a28',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            color: '#e2e4f0',
            fontSize: 13,
            fontWeight: 600,
          }}
          cursor={{ fill: 'rgba(99,102,241,0.06)' }}
        />
        <Bar dataKey="votes" isAnimationActive={true} animationDuration={500} radius={[6, 6, 0, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill={getBarColor(index)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
