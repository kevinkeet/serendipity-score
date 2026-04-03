import React, { useState } from 'react'

/**
 * Recommendation cards showing ranked interventions.
 */

const CATEGORY_STYLES = {
  mixed_use: { bg: '#f59e0b11', border: '#f59e0b33', text: '#f59e0b', label: 'Mixed Use' },
  commercial: { bg: '#3b82f611', border: '#3b82f633', text: '#3b82f6', label: 'Commercial' },
  civic: { bg: '#8b5cf611', border: '#8b5cf633', text: '#8b5cf6', label: 'Civic' },
  live_work: { bg: '#ec489911', border: '#ec489933', text: '#ec4899', label: 'Live/Work' },
  residential: { bg: '#10b98111', border: '#10b98133', text: '#10b981', label: 'Residential' },
  health_wellness: { bg: '#06b6d411', border: '#06b6d433', text: '#06b6d4', label: 'Health' },
  education_culture: { bg: '#a78bfa11', border: '#a78bfa33', text: '#a78bfa', label: 'Culture' },
  transportation: { bg: '#64748b11', border: '#64748b33', text: '#94a3b8', label: 'Transport' },
  ecological: { bg: '#22c55e11', border: '#22c55e33', text: '#22c55e', label: 'Ecological' },
  entertainment: { bg: '#f4364611', border: '#f4364633', text: '#f43f5e', label: 'Entertainment' },
  adaptive: { bg: '#fb923c11', border: '#fb923c33', text: '#fb923c', label: 'Adaptive' },
}

const SUBSCORE_COLORS = {
  diversity: '#f59e0b',
  porosity: '#3b82f6',
  interface: '#8b5cf6',
  temporal: '#10b981',
  social_mixing: '#ec4899',
}

export default function RecommendationCards({ recommendations, gaps }) {
  const [expandedIdx, setExpandedIdx] = useState(null)

  return (
    <div className="space-y-4 stagger">
      {recommendations.map((rec, idx) => {
        const style = CATEGORY_STYLES[rec.category] || CATEGORY_STYLES.commercial
        const isExpanded = expandedIdx === idx
        const lifts = rec.component_lifts || {}

        return (
          <div
            key={rec.name}
            className="rounded-xl border bg-white/[0.02] overflow-hidden transition-all hover:bg-white/[0.03]"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
          >
            {/* Header */}
            <button
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              className="w-full text-left px-5 py-4 flex items-start gap-4"
            >
              {/* Rank */}
              <div
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{
                  background: idx === 0
                    ? 'linear-gradient(135deg, #f59e0b, #f97316)'
                    : 'rgba(255,255,255,0.05)',
                  color: idx === 0 ? '#000' : '#94a3b8',
                }}
              >
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h4 className="text-sm font-semibold text-white" style={{fontFamily: 'var(--font-display)'}}>
                    {rec.name}
                  </h4>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ color: style.text, background: style.bg, border: `1px solid ${style.border}` }}
                  >
                    {style.label}
                  </span>
                </div>

                <p className="text-xs text-slate-400 line-clamp-2">{rec.description}</p>

                {/* Quick stats */}
                <div className="flex items-center gap-4 mt-2.5">
                  <Stat
                    label="Gap coverage"
                    value={`${Math.round(rec.gap_coverage * 100)}%`}
                    color={rec.gap_coverage > 0.4 ? '#10b981' : '#f59e0b'}
                  />
                  <Stat
                    label="Binding relief"
                    value={`${Math.round(rec.binding_relief * 100)}%`}
                    color={rec.binding_relief > 0.6 ? '#10b981' : '#f59e0b'}
                  />
                  <Stat
                    label="Est. lift"
                    value={`${Math.round(rec.estimated_lift * 100)}%`}
                    color={rec.estimated_lift > 0.5 ? '#10b981' : '#f59e0b'}
                  />
                  {rec.typical_lot_sqft && (
                    <Stat
                      label="Lot size"
                      value={`${(rec.typical_lot_sqft / 1000).toFixed(1)}k sqft`}
                      color="#64748b"
                    />
                  )}
                </div>
              </div>

              {/* Expand indicator */}
              <svg
                className={`w-5 h-5 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-4 fade-in">
                {/* Sub-score lift bars */}
                <div>
                  <p className="text-xs text-slate-500 mb-2 font-medium">Expected sub-score improvement</p>
                  <div className="space-y-1.5">
                    {Object.entries(lifts)
                      .filter(([_, v]) => v > 0.5)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, value]) => (
                        <div key={name} className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 w-20 text-right">
                            {name.replace('_', ' ')}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(value / 25 * 100, 100)}%`,
                                background: SUBSCORE_COLORS[name] || '#64748b',
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 w-8">
                            +{value.toFixed(1)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Addressed gap types */}
                {rec.addresses_gap_types && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1.5 font-medium">Addresses these gaps</p>
                    <div className="flex flex-wrap gap-1">
                      {rec.addresses_gap_types.map((gt) => (
                        <span
                          key={gt}
                          className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/5"
                        >
                          {gt.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Precedents */}
                {rec.precedents && rec.precedents.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1 font-medium">Precedents</p>
                    <ul className="text-xs text-slate-400 space-y-0.5">
                      {rec.precedents.map((p, i) => (
                        <li key={i}>- {p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risks */}
                {rec.risks && rec.risks.length > 0 && (
                  <div className="rounded-lg bg-red-500/5 border border-red-500/10 px-3 py-2">
                    <p className="text-[10px] text-red-400/80 font-medium mb-1">Considerations</p>
                    <ul className="text-[11px] text-red-400/60 space-y-0.5">
                      {rec.risks.map((r, i) => (
                        <li key={i}>- {r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-[10px] font-medium" style={{ color }}>{value}</span>
    </div>
  )
}
