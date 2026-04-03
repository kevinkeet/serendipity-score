import React, { useEffect, useState } from 'react'

/**
 * Animated circular gauge for the overall serendipity score.
 */
export default function ScoreGauge({ score, size = 160 }) {
  const [animatedScore, setAnimatedScore] = useState(0)

  useEffect(() => {
    // Animate score counting up
    const duration = 1200
    const start = performance.now()
    const animate = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedScore(Math.round(score * eased * 10) / 10)
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [score])

  const radius = (size - 20) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - animatedScore / 100)

  // Color based on score
  const getColor = (s) => {
    if (s >= 75) return '#10b981' // green
    if (s >= 55) return '#f59e0b' // amber
    if (s >= 35) return '#f97316' // orange
    return '#ef4444' // red
  }

  const color = getColor(score)

  const getLabel = (s) => {
    if (s >= 80) return 'Exceptional'
    if (s >= 65) return 'Strong'
    if (s >= 50) return 'Moderate'
    if (s >= 35) return 'Below Average'
    if (s >= 20) return 'Low'
    return 'Very Low'
  }

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={8}
        />
        {/* Score arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
        />
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {animatedScore.toFixed(0)}
        </span>
        <span className="text-xs font-medium mt-0.5" style={{ color }}>
          {getLabel(score)}
        </span>
      </div>
    </div>
  )
}
