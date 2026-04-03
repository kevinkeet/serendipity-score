import React, { useState, useRef, useEffect } from 'react'

/**
 * Address search with geocoding via Nominatim (OSM's geocoder).
 * Also supports clicking on the map to set location.
 */
export default function SearchBar({ onSelect, isCompact }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)
  const wrapperRef = useRef(null)

  // Click outside to close suggestions
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const geocode = async (text) => {
    if (text.length < 3) {
      setSuggestions([])
      return
    }

    setIsSearching(true)
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(text)}&format=json&limit=5&addressdetails=1`,
        { headers: { 'User-Agent': 'SerendipityScore/0.1' } }
      )
      const data = await resp.json()
      setSuggestions(
        data.map((d) => ({
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lon),
          label: d.display_name,
          shortLabel: buildShortLabel(d),
        }))
      )
      setShowSuggestions(true)
    } catch (err) {
      console.error('Geocode error:', err)
      setSuggestions([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => geocode(val), 350)
  }

  const handleSelect = (suggestion) => {
    setQuery(suggestion.shortLabel || suggestion.label)
    setShowSuggestions(false)
    setSuggestions([])
    onSelect(suggestion)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (suggestions.length > 0) {
      handleSelect(suggestions[0])
    }
  }

  return (
    <div ref={wrapperRef} className="relative max-w-xl mx-auto">
      <form onSubmit={handleSubmit}>
        <div className={`
          relative flex items-center rounded-2xl border border-white/10
          bg-white/[0.04] backdrop-blur-sm
          focus-within:border-amber-400/40 focus-within:bg-white/[0.06]
          transition-all
          ${isCompact ? 'px-4 py-2.5' : 'px-5 py-3.5'}
        `}>
          {/* Search icon */}
          <svg className="w-5 h-5 text-slate-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Enter an address or place..."
            className={`
              flex-1 bg-transparent outline-none text-white placeholder-slate-500
              ${isCompact ? 'text-sm' : 'text-base'}
            `}
          />

          {isSearching && (
            <div className="w-4 h-4 border-2 border-slate-500/30 border-t-slate-400 rounded-full animate-spin ml-2" />
          )}

          <button
            type="submit"
            className={`
              ml-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500
              text-black font-medium hover:from-amber-400 hover:to-orange-400
              transition-all active:scale-95
              ${isCompact ? 'px-4 py-1.5 text-xs' : 'px-5 py-2 text-sm'}
            `}
          >
            Score
          </button>
        </div>
      </form>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-[#141b2d] shadow-2xl overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSelect(s)}
              className="w-full text-left px-4 py-3 hover:bg-white/[0.06] transition-colors border-b border-white/5 last:border-0"
            >
              <div className="text-sm text-white">{s.shortLabel}</div>
              <div className="text-xs text-slate-500 truncate mt-0.5">{s.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Quick examples */}
      {!isCompact && (
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <span className="text-xs text-slate-600">Try:</span>
          {[
            { label: 'Pleasure Point, SC', lat: 36.9597, lng: -121.9122 },
            { label: 'Downtown Santa Cruz', lat: 36.9741, lng: -122.0308 },
            { label: 'Mission District, SF', lat: 37.7599, lng: -122.4148 },
            { label: 'Times Square, NYC', lat: 40.7580, lng: -73.9855 },
          ].map((ex) => (
            <button
              key={ex.label}
              onClick={() => {
                setQuery(ex.label)
                onSelect({ ...ex })
              }}
              className="text-xs text-slate-500 hover:text-amber-400 transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function buildShortLabel(nominatimResult) {
  const a = nominatimResult.address || {}
  const parts = [
    a.house_number,
    a.road,
    a.neighbourhood || a.suburb,
    a.city || a.town || a.village,
    a.state,
  ].filter(Boolean)
  return parts.join(', ') || nominatimResult.display_name?.split(',').slice(0, 3).join(',')
}
