interface WaveTextProps {
  text: string
  /** Milliseconds between one letter and the next. */
  stagger?: number
  /** Milliseconds before the first letter moves, for staggering whole lines against each other. */
  delay?: number
  className?: string
}

export default function WaveText({ text, stagger = 26, delay = 0, className = '' }: WaveTextProps) {
  return (
    <span className={`rn-wave ${className}`.trim()} aria-label={text}>
      {[...text].map((char, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="rn-wave-letter"
          style={{ animationDelay: `${delay + index * stagger}ms` }}
        >
          {char === ' ' ? ' ' : char}
        </span>
      ))}
    </span>
  )
}
