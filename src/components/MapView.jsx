import React, { useEffect, useRef, useState } from 'react'

/**
 * Map component using MapLibre GL (open-source Mapbox fork).
 * Shows the location pin and POIs color-coded by category.
 */

const CATEGORY_COLORS = {
  food_drink: '#f59e0b',
  retail: '#3b82f6',
  services: '#64748b',
  culture_education: '#8b5cf6',
  recreation: '#10b981',
  civic_social: '#06b6d4',
  workspace: '#ec4899',
  accommodation: '#f97316',
}

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export default function MapView({ lat, lng, pois }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapError, setMapError] = useState(false)

  useEffect(() => {
    let map
    let cancelled = false

    async function initMap() {
      try {
        const maplibregl = await import('maplibre-gl')
        await import('maplibre-gl/dist/maplibre-gl.css')

        if (cancelled || !containerRef.current) return

        map = new maplibregl.default.Map({
          container: containerRef.current,
          style: MAP_STYLE,
          center: [lng, lat],
          zoom: 14.5,
          attributionControl: true,
        })

        mapRef.current = map

        map.on('load', () => {
          if (cancelled) return
          setMapLoaded(true)

          // Add location marker
          const markerEl = document.createElement('div')
          markerEl.innerHTML = `
            <div style="
              width: 20px; height: 20px;
              background: linear-gradient(135deg, #f59e0b, #f97316);
              border-radius: 50%;
              border: 3px solid #0a0f1a;
              box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.3), 0 4px 12px rgba(0,0,0,0.5);
            "></div>
          `
          new maplibregl.default.Marker({ element: markerEl })
            .setLngLat([lng, lat])
            .addTo(map)

          // Add radius circles (approximate walk times)
          const circles = [
            { radius: 400, label: '~5 min', opacity: 0.12 },
            { radius: 800, label: '~10 min', opacity: 0.08 },
            { radius: 1600, label: '~20 min', opacity: 0.04 },
          ]

          circles.forEach((circle, i) => {
            const geoJson = createCircleGeoJSON(lat, lng, circle.radius)
            map.addSource(`radius-${i}`, {
              type: 'geojson',
              data: geoJson,
            })
            map.addLayer({
              id: `radius-fill-${i}`,
              type: 'fill',
              source: `radius-${i}`,
              paint: {
                'fill-color': '#f59e0b',
                'fill-opacity': circle.opacity,
              },
            })
            map.addLayer({
              id: `radius-line-${i}`,
              type: 'line',
              source: `radius-${i}`,
              paint: {
                'line-color': '#f59e0b',
                'line-opacity': 0.2,
                'line-width': 1,
                'line-dasharray': [4, 4],
              },
            })
          })

          // Add POI dots if available
          if (pois && pois.length > 0) {
            const poiGeoJson = {
              type: 'FeatureCollection',
              features: pois.map((poi) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [poi.lng, poi.lat] },
                properties: {
                  category: poi.category,
                  name: poi.name || poi.subcategory || '',
                  color: CATEGORY_COLORS[poi.category] || '#64748b',
                },
              })),
            }

            map.addSource('pois', { type: 'geojson', data: poiGeoJson })
            map.addLayer({
              id: 'poi-dots',
              type: 'circle',
              source: 'pois',
              paint: {
                'circle-radius': 4,
                'circle-color': ['get', 'color'],
                'circle-opacity': 0.7,
                'circle-stroke-color': '#0a0f1a',
                'circle-stroke-width': 1,
              },
            })

            // Popup on hover
            const popup = new maplibregl.default.Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 8,
            })

            map.on('mouseenter', 'poi-dots', (e) => {
              map.getCanvas().style.cursor = 'pointer'
              const props = e.features[0].properties
              popup
                .setLngLat(e.lngLat)
                .setHTML(`
                  <div style="font-family: var(--font-sans); padding: 2px;">
                    <div style="font-size: 12px; font-weight: 500; color: #e2e8f0;">${props.name || props.category}</div>
                    <div style="font-size: 10px; color: ${props.color}; text-transform: uppercase; letter-spacing: 0.5px;">${props.category.replace('_', ' ')}</div>
                  </div>
                `)
                .addTo(map)
            })

            map.on('mouseleave', 'poi-dots', () => {
              map.getCanvas().style.cursor = ''
              popup.remove()
            })
          }
        })
      } catch (err) {
        console.error('Map init error:', err)
        setMapError(true)
      }
    }

    initMap()

    return () => {
      cancelled = true
      if (map) map.remove()
    }
  }, [lat, lng, pois])

  if (mapError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900/50">
        <p className="text-sm text-slate-500">Map could not be loaded</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Legend */}
      {mapLoaded && pois && pois.length > 0 && (
        <div className="absolute bottom-3 left-3 rounded-lg bg-[#0a0f1a]/90 backdrop-blur-sm border border-white/10 px-3 py-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-[10px] text-slate-400">{cat.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Create a GeoJSON circle polygon (approximation).
 */
function createCircleGeoJSON(lat, lng, radiusM, points = 64) {
  const coords = []
  for (let i = 0; i <= points; i++) {
    const angle = (2 * Math.PI * i) / points
    const dLat = (radiusM * Math.cos(angle)) / 111320
    const dLng = (radiusM * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180))
    coords.push([lng + dLng, lat + dLat])
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
  }
}
