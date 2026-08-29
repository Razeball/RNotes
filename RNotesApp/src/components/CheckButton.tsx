import { useEffect, useRef, useState } from 'react'
import '../styles/CheckItem.css'

/** 
 * Checked symbol inside the button to make a substract
*/
const CHECKED_PATH_SUBSTRACT = 'M26 0C29.3137 0 32 2.68629 32 6V26C32 29.3137 29.3137 32 26 32H6C2.68629 32 0 29.3137 0 26V6C0 2.68629 2.68629 0 6 0H26ZM13.3027 19.2539L9.2666 15.9521L6.7334 19.0479L12.2334 23.5479L13.6963 24.7451L14.9746 23.3516L25.9746 11.3516L23.0254 8.64844L13.3027 19.2539Z'
/**
 * Animation delay
 */
const ANIMATION_MS_DELAY = 300

type CheckButtonProps = {
  checked: boolean
  onToggle: () => void
  label?: string
}

/** CheckButton is an interactive checkbox component with CSS animations that renders a checked state with an SVG mark inside a box, 
 * supports click to toggle the state and prevents caret movement on click. */
export default function CheckButton({ checked, onToggle, label }: CheckButtonProps) {
  const [animating, setAnimating] = useState(false)
  const animationTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(animationTimer.current), [])

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (!checked) {
      setAnimating(true)
      window.clearTimeout(animationTimer.current)
      animationTimer.current = window.setTimeout(() => setAnimating(false), ANIMATION_MS_DELAY)
    }

    onToggle()
  }

  return (
    <span
      className="rn-check"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      contentEditable={false}
      data-checked={checked ? 'true' : undefined}
      data-animating={animating ? 'true' : undefined}
      onMouseDown={handleMouseDown}
    >
      <span className="rn-check-face">
        <span className="rn-check-box" />
        <svg className="rn-check-mark" viewBox="0 0 32 32" aria-hidden="true">
          <path d={CHECKED_PATH_SUBSTRACT} />
        </svg>
      </span>
    </span>
  )
}