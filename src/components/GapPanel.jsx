import React, { useState } from 'react'

/**
 * Gap analysis panel showing binding constraints and specific gaps.
 */

const SUBSCORE_COLORS = {
  diversity: '#f59e0b',
  porosity: '#3b82f6',
  interface: '#8b5cf6',
  temporal: '#10b981',
  social_mixing: '#ec4899',
}

const SUBSCORE_ICONS = {
  diversity: '◆',
  porosity: '⬡',
  interface: '▥',
  temporal: '◷',
  social_mixing: '⚇',
}

export default function GapPanel({ gaps }) {
  const [expanded, setExpanded] = useState(false)

  if (!gaps || !gaps.gaps) return null

  const bindingConstraints = gaps.binding_constraints || []
  const sortedGaps = [...gaps.gaps].sort((a, b) => b.severity - a.severity)
  const visibleGaps = expanded ? sortedGaps : sortedGaps.slice(0, 6)

  return (
    <div className="space-y-4">
      {/* Binding constraints */}
      {bindingConstraints.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          <span className="text-xs text-slate-500">Binding constraints:</span>
          {bindingConstraints.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border"
              style={{
                color: SUBSCORE_COLORS[name],
                borderColor: SUBSCORE_COLORS[name] + '33',
                background: SUBSCORE_COLORS[name] + '11',
              }}
            >
              <span>{SUBSCORE_ICONS[name]}</span>
              {name.replace('_', ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Gap list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 stagger">
        {visibleGaps.map((gap, i) => (
          <div
            key={`${gap.subscore}-${gap.component}`}
            className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className="text-[10px] font-medium uppercase tracking-wider"
                style={{ color: SUBSCORE_COLORS[gap.subscore] }}
              >
                {SUBSCORE_ICONS[gap.subscore]} {gap.subscore.replace('_', ' ')}
              </span>
              <SeverityBadge severity={gap.severity} />
            </div>
            <p className="text-xs text-slate-300 leading-snug">{gap.label}</p>
            <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${gap.severity * 100}%`,
                  background: severityColor(gap.severity),
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {sortedGaps.length > 6 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-slate-500 hover:text-amber-400 transition-colors"
        >
          {expanded ? 'Show fewer' : `Show all ${sortedGaps.length} gaps`}
        </button>
      )}
    </div>
  )
}

function SeverityBadge({ severity }) {
  const label = severity >= 0.5 ? 'High' : severity >= 0.25 ? 'Medium' : 'Low'
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{
        color: severityColor(severity),
        background: severityColor(severity) + '18',
      }}
    >
      {label}
    </span>
  )
}

function severityColor(severity) {
  if (severity >= 0.5) return '#ef4444'
  if (severity >= 0.25) return '#f97316'
  return '#eab308'
}
