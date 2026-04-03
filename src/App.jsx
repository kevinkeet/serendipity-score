import React, { useState, useEffect, useRef, useCallback } from 'react'
import { scoreLocation, analyzeGaps, recommendInterventions } from './scoring.js'
import ScoreGauge from './components/ScoreGauge.jsx'
import RadarChart from './components/RadarChart.jsx'
import GapPanel from './components/GapPanel.jsx'
import RecommendationCards from './components/RecommendationCards.jsx'
import MapView from './components/MapView.jsx'
import SearchBar from './components/SearchBar.jsx'

const STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  SCORED: 'scored',
  ERROR: 'error',
}

export default function App() {
  const [state, setState] = useState(STATES.IDLE)
  const [location, setLocation] = useState(null) // {lat, lng, label}
  const [result, setResult] = useState(null)
  const [gaps, setGaps] = useState(null)
  const [recommendations, setRecommendations] = useState(null)
  const [error, setError] = useState(null)
  const [loadingStage, setLoadingStage] = useState('')
  const resultsRef = useRef(null)

  const handleLocationSelect = useCallback(async (loc) => {
    setLocation(loc)
    setState(STATES.LOADING)
    setError(null)
    setResult(null)
    setGaps(null)
    setRecommendations(null)

    try {
      setLoadingStage('Computing isochrone boundaries...')
      await new Promise(r => setTimeout(r, 100)) // let UI update

      setLoadingStage('Fetching OpenStreetMap data...')
      const scoreResult = await scoreLocation(loc.lat, loc.lng)

      setLoadingStage('Analyzing gaps...')
      const gapAnalysis = analyzeGaps(scoreResult)

      setLoadingStage('Generating recommendations...')
      const recs = recommendInterventions(scoreResult, gapAnalysis)

      setResult(scoreResult)
      setGaps(gapAnalysis)
      setRecommendations(recs)
      setState(STATES.SCORED)

      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 200)
    } catch (err) {
      console.error('Scoring failed:', err)
      setError(err.message || 'Failed to score location')
      setState(STATES.ERROR)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0f1a] via-[#0d1424] to-[#0a0f1a]">
      {/* Header */}
      <header className="border-b border-white/5 backdrop-blur-sm bg-white/[0.02] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-sm font-bold text-black">
              S
            </div>
            <div>
              <h1 className="text-base font-semibold text-white leading-tight" style={{fontFamily: 'var(--font-display)'}}>
                Serendipity Score
              </h1>
              <p className="text-[11px] text-slate-500 leading-tight">What should go here?</p>
            </div>
          </div>
          <a
            href="https://github.com/kevinkeet"
            target="_blank"
            rel="noopener"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            by Kevin Keet
          </a>
        </div>
      </header>

      {/* Hero / Search */}
      <section className={`transition-all duration-700 ${state === STATES.IDLE ? 'pt-24 pb-16' : 'pt-8 pb-6'}`}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          {state === STATES.IDLE && (
            <div className="fade-in mb-10">
              <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4" style={{fontFamily: 'var(--font-display)'}}>
                What should go on that
                <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent"> empty lot</span>?
              </h2>
              <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
                Enter any address to measure its serendipity potential — the likelihood
                a place generates unexpected encounters — and discover what development
                would improve it most.
              </p>
            </div>
          )}

          <SearchBar onSelect={handleLocationSelect} isCompact={state !== STATES.IDLE} />
        </div>
      </section>

      {/* Loading */}
      {state === STATES.LOADING && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center fade-in">
          <div className="inline-flex items-center gap-3 bg-white/5 rounded-full px-6 py-3 border border-white/10">
            <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
            <span className="text-sm text-slate-300">{loadingStage}</span>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Querying OpenStreetMap for POIs, street networks, and buildings...
          </p>
        </div>
      )}

      {/* Error */}
      {state === STATES.ERROR && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center fade-in">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
            <p className="text-red-400 font-medium mb-2">Scoring failed</p>
            <p className="text-sm text-red-400/70">{error}</p>
            <button
              onClick={() => setState(STATES.IDLE)}
              className="mt-4 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Try a different location
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {state === STATES.SCORED && result && (
        <div ref={resultsRef}>
          {/* Map + Score Overview */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Map */}
              <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02]" style={{height: 420}}>
                <MapView
                  lat={location.lat}
                  lng={location.lng}
                  pois={result._raw?.pois}
                />
              </div>

              {/* Score Summary */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Serendipity Score</p>
                  <ScoreGauge score={result.overall} size={160} />
                  <p className="text-sm text-slate-400 mt-2">
                    {location.label || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <RadarChart result={result} />
                </div>
              </div>
            </div>
          </section>

          {/* Sub-score Cards */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 stagger">
              {[
                { key: 'diversity', label: 'Diversity', icon: '◆', color: '#f59e0b' },
                { key: 'porosity', label: 'Porosity', icon: '⬡', color: '#3b82f6' },
                { key: 'interface', label: 'Interface', icon: '▥', color: '#8b5cf6' },
                { key: 'temporal', label: 'Temporal', icon: '◷', color: '#10b981' },
                { key: 'social_mixing', label: 'Social Mix', icon: '⚇', color: '#ec4899' },
              ].map(({ key, label, icon, color }) => (
                <div
                  key={key}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ color }} className="text-lg">{icon}</span>
                    <span className="text-xs text-slate-400">{label}</span>
                  </div>
                  <div className="text-2xl font-bold text-white" style={{fontFamily: 'var(--font-display)'}}>
                    {result[key]?.toFixed(1) ?? '—'}
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${result[key] ?? 0}%`,
                        background: `linear-gradient(90deg, ${color}88, ${color})`,
                      }}
                    />
                  </div>
                  {result.details?.[key]?.interpretation && (
                    <p className="text-[11px] text-slate-500 mt-2 line-clamp-3">
                      {result.details[key].interpretation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Gap Analysis */}
          {gaps && gaps.gaps && gaps.gaps.length > 0 && (
            <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
              <h3 className="text-lg font-semibold text-white mb-4" style={{fontFamily: 'var(--font-display)'}}>
                Gap Analysis
                <span className="text-sm font-normal text-slate-500 ml-2">What's holding this location back?</span>
              </h3>
              <GapPanel gaps={gaps} />
            </section>
          )}

          {/* Recommendations */}
          {recommendations && recommendations.length > 0 && (
            <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
              <h3 className="text-lg font-semibold text-white mb-1" style={{fontFamily: 'var(--font-display)'}}>
                What Should Go Here?
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                Ranked by how much each intervention relieves the binding constraints on serendipity.
              </p>
              <RecommendationCards recommendations={recommendations} gaps={gaps} />
            </section>
          )}

          {/* Methodology Footer */}
          <footer className="border-t border-white/5 bg-white/[0.01]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
              <h4 className="text-sm font-semibold text-slate-300 mb-3" style={{fontFamily: 'var(--font-display)'}}>
                Methodology
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
                Serendipity Score measures the combinatorial richness of urban places across five dimensions,
                using real-time OpenStreetMap data. <strong className="text-slate-400">Diversity</strong> captures
                Shannon entropy over POI categories and spatial interleaving of uses.{' '}
                <strong className="text-slate-400">Porosity</strong> measures street network connectivity,
                intersection density, and route directness. <strong className="text-slate-400">Interface</strong> scores
                ground-floor activation, third places, and building stock variety.{' '}
                <strong className="text-slate-400">Temporal</strong> estimates activity spread across hours and days
                using opening hours data and category heuristics.{' '}
                <strong className="text-slate-400">Social Mixing</strong> requires Census/ACS data and defaults to
                neutral in the web version. Scoring happens at three spatial scales (~5, 10, 20 min walk) weighted
                by proximity. The gap analyzer identifies binding constraints and the recommender ranks
                interventions that would most relieve them.
              </p>
              <p className="text-xs text-slate-600 mt-4">
                Built by Kevin Keet. Data from OpenStreetMap contributors. Inspired by Jane Jacobs, Jan Gehl, Bill Hillier, and Richard Sennett.
              </p>
            </div>
          </footer>
        </div>
      )}
    </div>
  )
}
