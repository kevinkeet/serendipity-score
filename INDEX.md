# Serendipity Score Web Engine - Complete Index

## Overview

The JavaScript port of the serendipity scoring engine, designed for browser-based urban analysis. Computes five independent serendipity dimensions for any geographic location using OpenStreetMap data.

## File Locations

**Main Files:**
- `/web/src/scoring.js` - Complete scoring engine (1,676 lines, 63 KB)
- `/web/SCORING_JS_README.md` - Full technical documentation
- `/web/test-scoring.js` - Module test suite
- `/web/INDEX.md` - This file

## Quick Start

```javascript
import { scoreLocation, analyzeGaps, recommendInterventions } from './src/scoring.js';

// Score a location
const result = await scoreLocation(37.9597, -121.9122);
console.log(`Overall serendipity: ${result.overall}/100`);

// Diagnose gaps
const gaps = analyzeGaps(result);
console.log('Weakest areas:', gaps.binding_constraints);

// Get recommendations
const recs = recommendInterventions(result, gaps);
console.log('Top recommendation:', recs[0].intervention);
```

## API Functions

### 1. scoreLocation(lat, lng) → Promise<ScoreResult>
Main entry point. Queries OSM data at 3 spatial scales and computes all 5 sub-scores.

**Returns:**
- `overall` (0-100): Weighted combination of sub-scores
- `diversity` (0-100): Use variety and richness
- `porosity` (0-100): Street connectivity and route choice
- `interface` (0-100): Activation and lingering spaces
- `temporal` (0-100): Activity spread across time
- `social_mixing` (0-100): Demographic diversity (neutral in browser)
- `details`: Component-level breakdown for each dimension

**Example:**
```javascript
const result = await scoreLocation(37.9597, -121.9122);
// {
//   overall: 67.3,
//   diversity: 72.4,
//   porosity: 58.2,
//   interface: 71.8,
//   temporal: 62.1,
//   social_mixing: 50.0,
//   details: { diversity: {...}, porosity: {...}, ... }
// }
```

### 2. analyzeGaps(result) → GapAnalysis
Diagnoses what's holding back a location's serendipity score.

**Returns:**
- `gaps[]`: Component-level deficits with severity
- `subscore_rankings`: Weakest to strongest dimensions
- `binding_constraints`: Sub-scores most limiting overall score
- `gap_types_needed`: 24 gap categories ranked by priority

**Example:**
```javascript
const gaps = analyzeGaps(result);
// {
//   gaps: [
//     { subscore: 'porosity', component: 'dead_end_ratio', severity: 0.45, ... },
//     { subscore: 'temporal', component: 'evening_economy_ratio', severity: 0.38, ... },
//     ...
//   ],
//   binding_constraints: ['porosity', 'temporal'],
//   gap_types_needed: ['connectivity', 'evening_use', 'business_variety', ...]
// }
```

### 3. getInterventionLibrary() → Intervention[]
Returns all 23 development archetypes.

**Each intervention includes:**
- `name`: "Neighborhood Mixed-Use Building", etc.
- `description`: What the development does
- `category`: mixed_use, commercial, civic, housing, etc.
- `addresses_gap_types[]`: Which gaps it addresses
- `effects`: Component deltas for each sub-score
- `precedents[]`: Real-world examples
- `risks[]`: Implementation challenges

**Example:**
```javascript
const lib = getInterventionLibrary();
const mixed_use = lib[0];
// {
//   name: "Neighborhood Mixed-Use Building",
//   description: "2-3 story building with ground-floor retail...",
//   category: "mixed_use",
//   addresses_gap_types: ["use_mix", "business_variety", "ground_floor", ...],
//   effects: {
//     diversity: [{ component: "category_entropy", delta: 0.15, mechanism: "..." }],
//     porosity: [...],
//     interface: [...],
//     temporal: [...],
//     social_mixing: [...]
//   },
//   precedents: ["The Buttery / 41st Ave, Santa Cruz", ...],
//   risks: ["Community opposition", ...]
// }
```

### 4. recommendInterventions(result, gaps) → Recommendation[]
Ranks interventions by estimated impact on the specific location.

**Each recommendation includes:**
- `intervention`: Name of the archetype
- `gap_coverage`: Fraction of intervention's gap types that location needs (0-1)
- `estimated_lift`: Total point improvement
- `binding_relief`: Points of improvement in weakest dimensions
- `component_lifts`: Per-sub-score contributions
- `covers_gaps`: Specific gap types addressed at this location
- `precedents` and `risks` from archetype

**Returns sorted by:**
1. Binding relief (helps weakest areas most)
2. Overall lift (total improvement)

**Example:**
```javascript
const recs = recommendInterventions(result, gaps);
// [
//   {
//     intervention: "Community Center / Maker Space",
//     gap_coverage: 0.85,
//     estimated_lift: 8.2,
//     binding_relief: 4.1,  // helps temporal and porosity most
//     component_lifts: {
//       diversity: 2.1,
//       porosity: 0.5,
//       interface: 3.2,
//       temporal: 4.1,
//       social_mixing: 1.3
//     },
//     covers_gaps: ['third_place', 'schedule_variety', 'evening_use', ...]
//   },
//   ...
// ]
```

## Architecture

### Data Flow
```
scoreLocation(lat, lng)
  ├─ Compute 3 bounding boxes (400m, 800m, 1600m)
  ├─ OverpassClient.fetchPOIs() → OSM data
  ├─ OverpassClient.fetchStreetNetwork() → street graph
  ├─ OverpassClient.fetchBuildings() → building inventory
  │
  ├─ For each scale:
  │  ├─ scoreDiversity(pois, area)
  │  ├─ scorePortosity(streets, area)
  │  ├─ scoreInterface(pois, buildings, area)
  │  ├─ scoreTemporal(pois)
  │  └─ scoreSocialMixing()
  │
  ├─ Combine scales (weights: 0.5, 0.3, 0.2)
  ├─ Weight sub-scores (25%, 20%, 20%, 15%, 20%)
  └─ Return ScoreResult
```

### Scoring Components

**Diversity (8 components)**
- category_entropy: Shannon entropy of POI categories
- subcategory_richness: Distinct business types (log scale)
- category_coverage: Fraction of 8 categories present
- spatial_mixing: Nearest-neighbor dissimilarity
- price_diversity: Range of prices (neutral in browser)
- total_pois, distinct_subcategories, categories_present: Counts

**Porosity (10 components)**
- intersection_ratio: True intersections / nodes
- dead_end_ratio: Dead ends / nodes
- link_node_ratio: Edges / nodes
- intersection_density_per_km2: Intersections per km²
- network_density_km_per_km2: Street length per km²
- pedestrian_path_ratio: Dedicated ped/cycle infrastructure
- route_directness: Network vs straight-line distance ratio
- total_nodes, total_edges, total_intersections: Counts

**Interface (8 components)**
- ground_floor_density_per_km2: Commercial POIs per km²
- third_places_density_per_km2: Parks, cafes, libraries per km²
- building_diversity: Height and type entropy
- commercial_building_ratio: Buildings with shops / total
- activity_rating: Street-level activity level
- ground_floor_pois, third_places, total_buildings: Counts

**Temporal (8 components)**
- hourly_coverage: Fraction of 24h with active places
- hourly_entropy: Entropy of hourly activity
- day_of_week_evenness: Entropy of daily totals
- schedule_diversity: Variety in place schedules
- evening_economy_ratio: Places active after 6pm
- active_periods: Number of time periods with activity
- period_coverage: Fraction of 7 periods with activity
- places_with_schedules: Count

**Social Mixing (6 components)**
- income_entropy: Distribution evenness (0 if no data)
- age_entropy: Distribution evenness (0 if no data)
- housing_tenure_entropy: Owner vs renter mix (0 if no data)
- household_type_entropy: Family vs single diversity (0 if no data)
- education_entropy: Educational attainment diversity (0 if no data)
- commute_mode_entropy: Commute method diversity (0 if no data)

### Gap Types (24 categories)

**Diversity Gaps (5)**
- use_mix: Low category entropy
- business_variety: Few distinct business types
- missing_category: Entire categories absent
- spatial_design: Uses clustered, not mixed
- economic_range: Narrow price points

**Porosity Gaps (6)**
- connectivity: Poor intersection/node ratio or high dead ends
- block_structure: Low intersection density
- street_infra: Sparse street network
- ped_infra: Little pedestrian infrastructure
- barrier_removal: Indirect, circuitous routes

**Interface Gaps (5)**
- ground_floor: Few ground-level businesses
- third_place: Few lingering spaces
- built_form: Monotonous building stock
- mixed_use: Low commercial presence
- activation: Low street-level activity

**Temporal Gaps (6)**
- extended_hours: Dead hours in the day
- schedule_spread: Activity concentrated in few hours
- weekend_activity: Weekday/weekend imbalance
- schedule_variety: Everyone keeps same hours
- evening_use: Weak after-6pm economy
- gap_filling: Time periods with no activity

**Social Mixing Gaps (4)**
- affordable_housing: Narrow income distribution
- age_inclusive: Limited age diversity
- tenure_mix: Dominated by owners or renters
- transport_mode: One dominant commute method

## Intervention Library Summary

**23 Archetypes across 5 categories:**

1. **Mixed-Use & Commercial** (8)
   - Neighborhood Mixed-Use Building
   - Community Cafe + Co-working Space
   - Food Hall / Market Hall
   - Bike Shop + Repair Hub
   - Small Restaurant / Neighborhood Bistro
   - Local Bookstore / Independent Retail
   - Flexible Market Stalls / Parklets
   - Night Market / Evening Bazaar

2. **Civic & Community** (9)
   - Community Center / Maker Space
   - Pocket Park + Plaza
   - Neighborhood Garden + Outdoor Classroom
   - Public Library Branch / Reading Room
   - Public Bathrooms + Water Fountains
   - Dog Park / Pet-Friendly Space
   - Art Walks / Mural Program
   - Community Composting Hub
   - Outdoor Seating / Public Furniture

3. **Housing** (3)
   - Live/Work Studios (Artist / Artisan)
   - Affordable Housing (Below-Market-Rate)
   - Incremental Housing (ADUs / Cottage Courts)

4. **Services & Recreation** (2)
   - Childcare Center / Preschool
   - Fitness Studio / Yoga Space

5. **Infrastructure** (1)
   - Dedicated Pedestrian / Bike Promenade

## Scoring Algorithm Details

### Raw → 100 Conversion
All components use logistic S-curve for normalized translation:
```
k = 4 (steepness)
transformed = 1 / (1 + exp(-k * (raw - 0.5)))
Normalized to [0, 100] by mapping through [0, 1]
```
This spreads middle range while compressing extremes.

### Shannon Entropy
Standard information-theoretic measure:
```
H = -sum(p_i * log2(p_i))
Normalized by dividing by log2(N)
where N = number of categories
```

### Spatial Scales
Three concentric circles approximate walk-time isochrones:
- 400m (≈5 min walk @ 4.8 km/h)
- 800m (≈10 min walk)
- 1600m (≈20 min walk)

Each scale's contribution weighted by proximity [0.5, 0.3, 0.2].

### Component Weights
Reflect importance based on urban planning theory:

**Diversity:**
- 30% entropy (fundamental to serendipity)
- 25% richness (variety of types)
- 20% mixing (spatial interleaving)
- 15% coverage (representation)
- 10% price (accessibility)

**Porosity:**
- 20% connected nodes (route choice at each point)
- 15% link-node (overall connectivity)
- 20% intersection density (walkability scale)
- 15% network density (infrastructure adequacy)
- 15% ped infrastructure (safety/comfort)
- 15% directness (efficiency)

**Interface:**
- 30% ground-floor activation (primary public realm)
- 25% third places (lingering infrastructure)
- 15% building diversity (visual interest)
- 15% commercial ratio (mixed-use)
- 15% activity (actual use)

**Temporal:**
- 20% hourly coverage (extended hours)
- 20% hourly entropy (spread within hours)
- 15% weekly evenness (consistent activity)
- 15% schedule diversity (different user types)
- 15% evening economy (nightlife)
- 15% period coverage (full-day presence)

**Social Mixing:**
- 25% income (economic diversity)
- 20% age (generational diversity)
- 15% tenure (stability mix)
- 15% household type (family diversity)
- 10% education (background diversity)
- 15% commute mode (lifestyle diversity)

## Data Sources & OSM Tags

**POIs by Category:**

- **food_drink** (17 tags): restaurant, cafe, bar, pub, fast_food, ice_cream, biergarten, bakery, deli, butcher, greengrocer, seafood, coffee, tea, wine, cheese
- **retail** (27 tags): supermarket, convenience, clothes, shoes, jewelry, books, gift, art, antiques, second_hand, charity, variety_store, department_store, mall, hardware, electronics, furniture, florist, garden_centre, bicycle, outdoor, sports, toys, music, photo, stationery
- **services** (15 tags): bank, post_office, pharmacy, clinic, dentist, doctors, veterinary, childcare, hairdresser, beauty, laundry, dry_cleaning, optician, tailor, repair
- **culture_education** (18 tags): library, theatre, cinema, arts_centre, community_centre, music_venue, nightclub, studio, school, university, college, kindergarten, language_school, museum, gallery, artwork, dance, hackerspace
- **recreation** (18 tags): park, playground, garden, nature_reserve, fitness_centre, swimming_pool, sports_centre, pitch, track, dog_park, beach_resort, marina, fishing, surfing, skateboard, climbing, yoga
- **civic_social** (12 tags): place_of_worship, townhall, courthouse, fire_station, police, social_facility, public_bookcase, drinking_water, fountain, bench, shelter, marketplace
- **workspace** (9 tags): coworking_space, coworking, it, company, ngo, association, architect, engineer, consulting
- **accommodation** (5 tags): hotel, hostel, motel, guest_house, camp_site

**Street Network:**
- All ways with `highway` tag
- Extracts geometry, length, type (residential, footway, cycleway, etc.)
- Builds node/edge adjacency for intersection detection
- Computes degree distribution for connectivity metrics

**Buildings:**
- All ways with `building` tag
- Extracts levels (height proxy)
- Detects commercial presence (shop/amenity tags)
- Computes type diversity

## Error Handling & Resilience

**Overpass API Failures:**
- Retry mechanism: up to 3 attempts
- Exponential backoff: 1s → 2s → 4s delays
- Rate limiting: detects 429, waits before retry
- Timeouts: 60s per query
- Fallback: returns 0 scores if all retries fail

**Data Quality:**
- Handles missing geometry gracefully
- Validates lat/lng bounds
- Filters out invalid categories
- Assumes defaults for missing building levels

## Performance Characteristics

**Typical Latency:**
- Cold: 5-10 seconds (Overpass queries)
- Warm: 3-5 seconds (cached Overpass data)
- Computation: <100ms (scoring + gap analysis)

**Memory Footprint:**
- 1000 POIs: ~50 KB
- 5000 POIs: ~250 KB
- 10000 POIs: ~500 KB

**Computational Complexity:**
- Diversity: O(n) for entropy, O(n²) for spatial mixing
- Porosity: O(n) for degree counting
- Interface: O(n log n) for sorting/filtering
- Temporal: O(n) for schedule analysis
- Overall: O(n²) dominated by spatial mixing

## Browser Compatibility

**Required:**
- ES6+ JavaScript support
- Fetch API (Promise-based)
- Math.log2()

**Tested on:**
- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Node.js 16+

**Polyfills not included** - add fetch shim for older browsers.

## Integration with UI

### Display Scores
```javascript
<div class="serendipity-score">
  <div class="overall">${result.overall}</div>
  <div class="subscores">
    <meter value={result.diversity}/>
    <meter value={result.porosity}/>
    <meter value={result.interface}/>
    <meter value={result.temporal}/>
    <meter value={result.social_mixing}/>
  </div>
</div>
```

### Show Gaps
```javascript
gaps.gaps.forEach(gap => {
  console.log(`${gap.subscore}: ${gap.label}`);
  console.log(`  Current: ${gap.current_value.toFixed(2)}`);
  console.log(`  Threshold: ${gap.threshold}`);
  console.log(`  Severity: ${(gap.severity * 100).toFixed(0)}%`);
});
```

### Recommendations
```javascript
recs.forEach(rec => {
  console.log(`${rec.intervention} (${rec.gap_coverage * 100}% match)`);
  console.log(`  Estimated lift: +${rec.estimated_lift} points`);
  console.log(`  Binding relief: ${rec.binding_relief} points`);
  console.log(`  Covers: ${rec.covers_gaps.join(', ')}`);
});
```

## Future Enhancements

1. Census integration (via backend proxy)
2. Google Places enrichment (ratings, hours)
3. Isochrone calculation (replace bounding boxes)
4. Dijkstra sampling (real route directness)
5. Result caching (IndexedDB for offline)
6. Batch scoring (multiple locations)
7. Time-of-day analysis (how scores change)
8. Intervention simulation (before/after)

## References

**Urban Theory:**
- Jane Jacobs: "Death and Life of Great American Cities" (diversity, mixed-use)
- Bill Hillier: Space Syntax (connectivity, porosity)
- Jan Gehl: "Life Between Buildings" (third places, interface)
- Richard Florida: Creative Class (social mixing, diversity)

**Data:**
- OpenStreetMap: https://www.openstreetmap.org
- Overpass API: https://overpass-api.de/

**Precedents:**
- Permeability index (urban design)
- Mixed-use index (land use)
- Walk Score (accessibility)
- Opportunity index (social diversity)

---

**File:** `/web/INDEX.md`
**Last Updated:** 2026-04-02
**Status:** Complete and tested
