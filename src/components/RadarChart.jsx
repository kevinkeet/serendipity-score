import React from 'react'

/**
 * SVG radar/spider chart for the 5 sub-scores.
 * Built from scratch — no chart library dependency for this one.
 */
const DIMENSIONS = [
  { key: 'diversity', label: 'Diversity', color: '#f59e0b' },
  { key: 'porosity', label: 'Porosity', color: '#3b82f6' },
  { key: 'interface', label: 'Interface', color: '#8b5cf6' },
  { key: 'temporal', label: 'Temporal', color: '#10b981' },
  { key: 'social_mixing', label: 'Social Mix', color: '#ec4899' },
]

export default function RadarChart({ result, size = 200 }) {
  const center = size / 2
  const maxRadius = size / 2 - 30
  const n = DIMENSIONS.length
  const angleStep = (2 * Math.PI) / n

  // Get point position for a given dimension index and value (0-100)
  const getPoint = (index, value) => {
    const angle = angleStep * index - Math.PI / 2 // start from top
    const r = (value / 100) * maxRadius
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    }
  }

  // Build polygon path for the scores
  const points = DIMENSIONS.map((dim, i) => {
    const value = result[dim.key] ?? 0
    return getPoint(i, value)
  })
  const polygonPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  // Grid rings at 25, 50, 75, 100
  const rings = [25, 50, 75, 100]

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid rings */}
        {rings.map((ring) => {
          const ringPoints = Array.from({ length: n }, (_, i) => getPoint(i, ring))
          const ringPath = ringPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
          return (
            <path
              key={ring}
              d={ringPath}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          )
        })}

        {/* Axis lines */}
        {DIMENSIONS.map((_, i) => {
          const end = getPoint(i, 100)
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={end.x}
              y2={end.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          )
        })}

        {/* Score polygon */}
        <path
          d={polygonPath}
          fill="rgba(245, 158, 11, 0.15)"
          stroke="rgba(245, 158, 11, 0.6)"
          strokeWidth={2}
        />

        {/* Score dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={DIMENSIONS[i].color}
            stroke="#0a0f1a"
            strokeWidth={2}
          />
        ))}

        {/* Labels */}
        {DIMENSIONS.map((dim, i) => {
          const labelPoint = getPoint(i, 118)
          const value = result[dim.key] ?? 0
          return (
            <text
              key={dim.key}
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="text-[10px]"
              fill="#94a3b8"
              fontFamily="var(--font-sans)"
            >
              {dim.label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
