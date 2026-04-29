const LABELS = ['A', 'B', 'C', 'D']
const OPTION_COLORS = [
  { bg: 'rgba(99,102,241,.08)', border: 'rgba(99,102,241,.3)', ltrBg: 'rgba(99,102,241,.2)', ltrColor: '#818cf8' },
  { bg: 'rgba(34,197,94,.06)', border: 'rgba(34,197,94,.25)', ltrBg: 'rgba(34,197,94,.15)', ltrColor: '#4ade80' },
  { bg: 'rgba(245,158,11,.06)', border: 'rgba(245,158,11,.25)', ltrBg: 'rgba(245,158,11,.15)', ltrColor: '#fbbf24' },
  { bg: 'rgba(239,68,68,.06)', border: 'rgba(239,68,68,.25)', ltrBg: 'rgba(239,68,68,.15)', ltrColor: '#f87171' },
]

export default function QuestionCard({ question, myAnswer, correctIndex, onAnswer, disabled }) {
  if (!question) return null

  function getButtonClass(index) {
    const classes = ['ans-btn']
    if (correctIndex !== null) {
      if (index === correctIndex) classes.push('correct')
      else if (index === myAnswer) classes.push('picked', 'wrong')
      else classes.push('wrong')
    } else if (index === myAnswer) {
      classes.push('picked')
    }
    return classes.join(' ')
  }

  function getLtrStyle(index) {
    if (correctIndex !== null) {
      if (index === correctIndex) return { background: 'var(--green)', borderColor: 'var(--green)', color: '#fff' }
      if (index === myAnswer) return { background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }
    }
    if (index === myAnswer) return { background: 'var(--indigo)', borderColor: 'var(--indigo)', color: '#fff' }
    const c = OPTION_COLORS[index] || OPTION_COLORS[0]
    return { background: c.ltrBg, borderColor: 'transparent', color: c.ltrColor }
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20, lineHeight: 1.4, letterSpacing: '-.3px' }}>
        {question.text}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {question.options.map((option, i) => (
          <button
            key={i}
            className={getButtonClass(i)}
            onClick={() => onAnswer(i)}
            disabled={disabled || myAnswer !== null}
          >
            <div className="ans-ltr" style={getLtrStyle(i)}>
              {LABELS[i]}
            </div>
            <span className="ans-txt">{option}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
