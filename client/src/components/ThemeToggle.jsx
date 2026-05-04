import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      className="theme-toggle"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="theme-toggle-track">
        <span className="theme-toggle-thumb">
          <span className="mat sm">{isDark ? 'dark_mode' : 'light_mode'}</span>
        </span>
      </span>
    </button>
  )
}