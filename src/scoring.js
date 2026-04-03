/**
 * Serendipity Score - JavaScript Port
 *
 * A complete scoring engine that computes serendipity metrics for urban locations
 * based on OpenStreetMap data. Measures:
 * - Diversity: variety of uses and business types
 * - Porosity: street connectivity and route choice
 * - Interface: public-private edges and street activation
 * - Temporal: activity spread across times and days
 * - Social Mixing: demographic diversity (neutral in browser)
 *
 * Usage:
 *   const result = await scoreLocation(37.9597, -121.9122);
 *   const gaps = analyzeGaps(result);
 *   const interventions = recommendInterventions(result, gaps);
 */

/**
 * POI TAXONOMY - matching Python OSM categories
 */
const POI_CATEGORIES = {
  food_drink: {
    amenity: ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'food_court', 'biergarten'],
    shop: ['bakery', 'deli', 'butcher', 'greengrocer', 'seafood', 'coffee', 'tea', 'wine', 'cheese'],
  },
  retail: {
    shop: [
      'supermarket', 'convenience', 'clothes', 'shoes', 'jewelry', 'books', 'gift', 'art',
      'antiques', 'second_hand', 'charity', 'variety_store', 'department_store', 'mall',
      'hardware', 'electronics', 'furniture', 'florist', 'garden_centre', 'bicycle',
      'outdoor', 'sports', 'toys', 'music', 'musical_instrument', 'photo', 'stationery'
    ],
  },
  services: {
    amenity: ['bank', 'post_office', 'pharmacy', 'clinic', 'dentist', 'doctors', 'veterinary', 'childcare'],
    shop: ['hairdresser', 'beauty', 'laundry', 'dry_cleaning', 'optician', 'tailor', 'repair'],
  },
  culture_education: {
    amenity: [
      'library', 'theatre', 'cinema', 'arts_centre', 'community_centre', 'music_venue',
      'nightclub', 'studio', 'school', 'university', 'college', 'kindergarten', 'language_school'
    ],
    tourism: ['museum', 'gallery', 'artwork'],
    leisure: ['dance', 'hackerspace'],
  },
  recreation: {
    leisure: ['park', 'playground', 'garden', 'nature_reserve', 'fitness_centre', 'swimming_pool',
              'sports_centre', 'pitch', 'track', 'dog_park', 'beach_resort', 'marina', 'fishing'],
    amenity: ['swimming_pool'],
    sport: ['surfing', 'skateboard', 'climbing', 'yoga'],
  },
  civic_social: {
    amenity: ['place_of_worship', 'townhall', 'courthouse', 'fire_station', 'police',
              'social_facility', 'public_bookcase', 'drinking_water', 'fountain', 'bench',
              'shelter', 'marketplace'],
  },
  workspace: {
    amenity: ['coworking_space'],
    office: ['coworking', 'it', 'company', 'ngo', 'association', 'architect', 'engineer', 'consulting'],
  },
  accommodation: {
    tourism: ['hotel', 'hostel', 'motel', 'guest_house', 'camp_site'],
  },
};

/**
 * UTILITY FUNCTIONS
 */

function categorizepoi(tags) {
  for (const [category, tagGroups] of Object.entries(POI_CATEGORIES)) {
    for (const [tagKey, tagValues] of Object.entries(tagGroups)) {
      if (tagKey in tags && tagValues.includes(tags[tagKey])) {
        return category;
      }
    }
  }
  return null;
}

function getSubcategory(tags) {
  // Return the most specific tag value from the tags
  for (const [key, value] of Object.entries(tags)) {
    if (key !== 'name' && key !== 'opening_hours' && typeof value === 'string') {
      return value;
    }
  }
  return 'unknown';
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const phi1 = Math.PI * lat1 / 180;
  const phi2 = Math.PI * lat2 / 180;
  const dphi = Math.PI * (lat2 - lat1) / 180;
  const dlam = Math.PI * (lng2 - lng1) / 180;

  const a = Math.sin(dphi / 2) ** 2 +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToMeters(lat, degrees) {
  // Approximate: 1 degree latitude ≈ 111km
  return degrees * 111000;
}

function computeBoundingBox(lat, lng, radiusMeters) {
  const latDelta = radiusMeters / 111000;
  const lngDelta = radiusMeters / (111000 * Math.cos(Math.PI * lat / 180));

  return {
    north: lat + latDelta,
    south: lat - latDelta,
    east: lng + lngDelta,
    west: lng - lngDelta,
  };
}

/**
 * OVERPASS API QUERYING
 */

class OverpassClient {
  constructor(url = 'https://overpass-api.de/api/interpreter') {
    this.url = url;
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms
  }

  async query(queryString) {
    let lastError;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(this.url, {
          method: 'POST',
          body: queryString,
          headers: { 'Content-Type': 'application/osm3s' },
          timeout: 60000,
        });

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limit: wait and retry
            const delay = this.retryDelay * Math.pow(2, attempt);
            console.warn(`Overpass rate limited. Waiting ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw new Error(`Overpass error: ${response.status}`);
        }

        return await response.json();
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.warn(`Overpass query failed (attempt ${attempt + 1}), retrying in ${delay}ms...`, err);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    throw lastError || new Error('Overpass query failed after retries');
  }

  async fetchPOIs(bbox) {
    const filter = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
    const query = `
      [out:json][timeout:60];
      (
        node["amenity"]${filter};
        node["shop"]${filter};
        node["leisure"]${filter};
        node["tourism"]${filter};
        node["office"]${filter};
        node["sport"]${filter};
        way["amenity"]${filter};
        way["shop"]${filter};
        way["leisure"]${filter};
      );
      out center;
    `;

    const data = await this.query(query);
    return this._processPOIs(data.elements || []);
  }

  async fetchStreetNetwork(bbox) {
    const filter = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
    const query = `
      [out:json][timeout:60];
      (
        way["highway"]${filter};
      );
      out geom;
    `;

    const data = await this.query(query);
    return this._processStreetNetwork(data.elements || []);
  }

  async fetchBuildings(bbox) {
    const filter = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
    const query = `
      [out:json][timeout:60];
      (
        way["building"]${filter};
      );
      out geom;
    `;

    const data = await this.query(query);
    return this._processBuildings(data.elements || []);
  }

  _processPOIs(elements) {
    const pois = [];
    for (const el of elements) {
      const tags = el.tags || {};
      const category = categorizepoi(tags);
      if (!category) continue;

      const lat = el.lat || el.center?.lat;
      const lng = el.lon || el.center?.lon;
      if (!lat || !lng) continue;

      pois.push({
        id: el.id,
        lat,
        lng,
        name: tags.name || '',
        category,
        subcategory: getSubcategory(tags),
        tags,
      });
    }
    return pois;
  }

  _processStreetNetwork(elements) {
    const nodes = new Map();
    const edges = [];
    const intersections = new Set();

    // First pass: collect all nodes
    const nodeSet = new Set();
    for (const way of elements) {
      const geom = way.geometry || [];
      for (const node of geom) {
        nodeSet.add(`${node.lat},${node.lon}`);
      }
    }

    // Track node degrees
    const nodeDegree = new Map();

    // Process ways into edges
    for (const way of elements) {
      const geom = way.geometry || [];
      const highwayType = way.tags?.highway || 'residential';
      const length = this._computeWayLength(geom);

      for (let i = 0; i < geom.length - 1; i++) {
        const from = geom[i];
        const to = geom[i + 1];

        const fromKey = `${from.lat},${from.lon}`;
        const toKey = `${to.lat},${to.lon}`;

        if (!nodes.has(fromKey)) {
          nodes.set(fromKey, { id: nodes.size, lat: from.lat, lng: from.lon });
        }
        if (!nodes.has(toKey)) {
          nodes.set(toKey, { id: nodes.size, lat: to.lat, lng: to.lon });
        }

        const fromId = nodes.get(fromKey).id;
        const toId = nodes.get(toKey).id;

        // Track degree for intersection detection
        nodeDegree.set(fromId, (nodeDegree.get(fromId) || 0) + 1);
        nodeDegree.set(toId, (nodeDegree.get(toId) || 0) + 1);

        edges.push({
          from_id: fromId,
          to_id: toId,
          length_m: haversine(from.lat, from.lng, to.lat, to.lng),
          highway_type: highwayType,
        });
      }
    }

    // Count intersections (degree >= 3)
    let intersectionCount = 0;
    for (const degree of nodeDegree.values()) {
      if (degree >= 3) intersectionCount++;
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
      intersections: intersectionCount,
    };
  }

  _processBuildings(elements) {
    const buildings = [];
    for (const way of elements) {
      if (!way.geometry || way.geometry.length < 3) continue;

      const tags = way.tags || {};
      buildings.push({
        id: way.id,
        building_type: tags.building || 'yes',
        levels: tags.building_levels ? parseInt(tags.building_levels) : undefined,
        has_shop: (tags.shop !== undefined) || (tags.amenity === 'shop'),
        tags,
      });
    }
    return buildings;
  }

  _computeWayLength(geometry) {
    let totalDistance = 0;
    for (let i = 0; i < geometry.length - 1; i++) {
      const from = geometry[i];
      const to = geometry[i + 1];
      totalDistance += haversine(from.lat, from.lng, to.lat, to.lng);
    }
    return totalDistance;
  }
}

/**
 * SCORING FUNCTIONS
 */

function shannonEntropy(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  let entropy = 0;
  for (const count of Object.values(counts)) {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

function to100(raw) {
  if (raw <= 0) return 0;
  if (raw >= 1) return 100;

  const k = 4;
  const transformed = 1 / (1 + Math.exp(-k * (raw - 0.5)));
  const low = 1 / (1 + Math.exp(-k * (0 - 0.5)));
  const high = 1 / (1 + Math.exp(-k * (1 - 0.5)));
  const normalized = (transformed - low) / (high - low);

  return Math.round(normalized * 100 * 10) / 10;
}

function scoreDiversity(pois, area_km2 = 1.0) {
  if (!pois || pois.length === 0) {
    return {
      name: 'diversity',
      score: 0,
      components: {},
      interpretation: 'No POIs found in area',
    };
  }

  const MAX_CATEGORIES = 8;

  // 1. Category entropy
  const categoryCounts = {};
  for (const poi of pois) {
    categoryCounts[poi.category] = (categoryCounts[poi.category] || 0) + 1;
  }
  const entropy = shannonEntropy(categoryCounts);
  const maxEntropy = Math.log2(Math.min(Object.keys(categoryCounts).length, MAX_CATEGORIES));
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // 2. Subcategory richness
  const subcategories = new Set(pois.map(p => p.subcategory));
  const richness = subcategories.size;
  const richness_score = Math.min(1.0, Math.log1p(richness / area_km2) / Math.log1p(50));

  // 3. Category coverage
  const coverage = Object.keys(categoryCounts).length / MAX_CATEGORIES;

  // 4. Spatial mixing index
  let different_neighbor_count = 0;
  for (let i = 0; i < pois.length; i++) {
    const poi = pois[i];
    let min_dist = Infinity;
    let nearest_category = poi.category;

    for (let j = 0; j < pois.length; j++) {
      if (i === j) continue;
      const other = pois[j];
      const dist = (poi.lat - other.lat) ** 2 + (poi.lng - other.lng) ** 2;
      if (dist < min_dist) {
        min_dist = dist;
        nearest_category = other.category;
      }
    }
    if (nearest_category !== poi.category) {
      different_neighbor_count++;
    }
  }
  const mixing = pois.length > 1 ? different_neighbor_count / pois.length : 0;

  // Price diversity (neutral without Google Places)
  const price_diversity = 0.5;

  // Combine
  const raw_score = (
    0.30 * normalizedEntropy +
    0.25 * richness_score +
    0.15 * coverage +
    0.20 * mixing +
    0.10 * price_diversity
  );

  const score = to100(raw_score);

  return {
    name: 'diversity',
    score,
    components: {
      category_entropy: normalizedEntropy,
      subcategory_richness: richness_score,
      category_coverage: coverage,
      spatial_mixing: mixing,
      price_diversity,
      total_pois: pois.length,
      distinct_subcategories: richness,
      categories_present: Object.keys(categoryCounts).length,
    },
    interpretation: interpretDiversity(score, pois.length, richness, Object.keys(categoryCounts).length),
  };
}

function interpretDiversity(score, total, richness, categories) {
  if (score >= 80) {
    return `Excellent diversity: ${richness} distinct business types across ${categories} categories among ${total} total POIs.`;
  } else if (score >= 60) {
    return `Good diversity: ${richness} types across ${categories} categories. Solid variety.`;
  } else if (score >= 40) {
    return `Moderate diversity: ${richness} types across ${categories} categories. Some variety but may be dominated by a few use types.`;
  } else if (score >= 20) {
    return `Low diversity: only ${richness} types across ${categories} categories among ${total} POIs.`;
  } else {
    return `Very low diversity: ${total} POIs with limited variety.`;
  }
}

function scorePorosity(streetNetwork, area_km2 = 1.0) {
  const nodes = streetNetwork.nodes || [];
  const edges = streetNetwork.edges || [];
  const intersections = streetNetwork.intersections || 0;

  if (!nodes || !edges || nodes.length === 0 || edges.length === 0) {
    return {
      name: 'porosity',
      score: 0,
      components: {},
      interpretation: 'No street network data available',
    };
  }

  const n_nodes = nodes.length;
  const n_edges = edges.length;

  // 1. Connected Node Ratio
  const degree = {};
  for (const edge of edges) {
    degree[edge.from_id] = (degree[edge.from_id] || 0) + 1;
    degree[edge.to_id] = (degree[edge.to_id] || 0) + 1;
  }

  const dead_ends = Object.values(degree).filter(d => d === 1).length;
  const intersection_ratio = n_nodes > 0 ? intersections / n_nodes : 0;
  const dead_end_ratio = n_nodes > 0 ? dead_ends / n_nodes : 0;
  const cnr_score = Math.min(1.0, intersection_ratio * 2) * (1 - dead_end_ratio * 0.5);

  // 2. Link-Node Ratio
  const link_node = n_nodes > 0 ? n_edges / n_nodes : 0;
  const lnr_score = Math.min(1.0, (link_node - 1.0) / 1.5);

  // 3. Intersection density
  const intersection_density = area_km2 > 0 ? intersections / area_km2 : 0;
  const id_score = Math.min(1.0, Math.log1p(intersection_density) / Math.log1p(100));

  // 4. Network density
  const total_edge_km = edges.reduce((sum, e) => sum + e.length_m, 0) / 1000;
  const network_density = area_km2 > 0 ? total_edge_km / area_km2 : 0;
  const nd_score = Math.min(1.0, Math.log1p(network_density) / Math.log1p(20));

  // 5. Pedestrian/cycle path ratio
  const ped_types = {'footway': 1, 'cycleway': 1, 'path': 1, 'pedestrian': 1, 'steps': 1, 'living_street': 1};
  const ped_length = edges.filter(e => ped_types[e.highway_type]).reduce((sum, e) => sum + e.length_m, 0);
  const total_length = edges.reduce((sum, e) => sum + e.length_m, 0);
  const ped_ratio = total_length > 0 ? ped_length / total_length : 0;
  const ped_score = Math.min(1.0, ped_ratio / 0.30);

  // 6. Route directness (simplified)
  const directness = 1.3; // reasonable default for urban areas
  const directness_score = Math.max(0, Math.min(1.0, (2.0 - directness) / 0.8));

  // Combine
  const raw_score = (
    0.20 * cnr_score +
    0.15 * lnr_score +
    0.20 * id_score +
    0.15 * nd_score +
    0.15 * ped_score +
    0.15 * directness_score
  );

  const score = to100(raw_score);

  return {
    name: 'porosity',
    score,
    components: {
      intersection_ratio,
      dead_end_ratio,
      link_node_ratio: link_node,
      intersection_density_per_km2: intersection_density,
      network_density_km_per_km2: network_density,
      pedestrian_path_ratio: ped_ratio,
      route_directness: directness,
      total_nodes: n_nodes,
      total_edges: n_edges,
      total_intersections: intersections,
    },
    interpretation: interpretPorosity(score, intersection_density, dead_end_ratio),
  };
}

function interpretPorosity(score, density, dead_end_ratio) {
  if (score >= 80) {
    return `Excellent porosity: ${density.toFixed(0)} intersections/km² and ${(dead_end_ratio * 100).toFixed(0)}% dead-ends. Many route options.`;
  } else if (score >= 60) {
    return `Good porosity: ${density.toFixed(0)} intersections/km². Reasonably connected network.`;
  } else if (score >= 40) {
    return `Moderate porosity: ${(dead_end_ratio * 100).toFixed(0)}% dead-ends suggest cul-de-sac patterns.`;
  } else {
    return `Low porosity: ${(dead_end_ratio * 100).toFixed(0)}% dead-ends indicate barriers to free movement.`;
  }
}

function scoreInterface(pois, buildings, area_km2 = 1.0) {
  if ((!pois || pois.length === 0) && (!buildings || buildings.length === 0)) {
    return {
      name: 'interface',
      score: 0,
      components: {},
      interpretation: 'No building or POI data available',
    };
  }

  pois = pois || [];
  buildings = buildings || [];

  // 1. Ground-floor activation density
  const ground_floor_categories = {'food_drink': 1, 'retail': 1, 'services': 1};
  const ground_floor_pois = pois.filter(p => ground_floor_categories[p.category]);
  const gf_density = area_km2 > 0 ? ground_floor_pois.length / area_km2 : 0;
  const gf_score = Math.min(1.0, Math.log1p(gf_density) / Math.log1p(100));

  // 2. Third places
  const third_place_tags = {
    library: 1, community_centre: 1, arts_centre: 1, cafe: 1, pub: 1,
    social_facility: 1, public_bookcase: 1, park: 1, garden: 1, playground: 1, dog_park: 1,
  };
  const third_places = pois.filter(p => {
    const tags = p.tags || {};
    for (const [key, value] of Object.entries(tags)) {
      if (third_place_tags[value]) return true;
    }
    return false;
  });
  const tp_density = area_km2 > 0 ? third_places.length / area_km2 : 0;
  const tp_score = Math.min(1.0, Math.log1p(tp_density) / Math.log1p(15));

  // 3. Building diversity
  let building_diversity = 0.5;
  if (buildings.length > 0) {
    const levels = buildings.filter(b => b.levels).map(b => b.levels);
    if (levels.length > 0) {
      const levelCounts = {};
      for (const l of levels) {
        levelCounts[l] = (levelCounts[l] || 0) + 1;
      }
      const entropy = shannonEntropy(levelCounts);
      const max_ent = Math.log2(Object.keys(levelCounts).length) || 1;
      const height_diversity = entropy / max_ent;

      const typeCounts = {};
      for (const b of buildings) {
        const type = b.building_type || 'yes';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
      const type_entropy = shannonEntropy(typeCounts);
      const type_max_ent = Math.log2(Object.keys(typeCounts).length);
      const type_diversity = type_max_ent > 0 ? type_entropy / type_max_ent : 0;

      building_diversity = 0.6 * height_diversity + 0.4 * type_diversity;
    }
  }

  // 4. Commercial building ratio
  const commercial_buildings = buildings.filter(b => b.has_shop).length;
  const commercial_ratio = buildings.length > 0 ? commercial_buildings / buildings.length : 0;
  const cr_score = Math.min(1.0, commercial_ratio / 0.20);

  // 5. Activity score (neutral without Google Places)
  const activity_score = 0.5;

  // Combine
  const raw_score = (
    0.30 * gf_score +
    0.25 * tp_score +
    0.15 * building_diversity +
    0.15 * cr_score +
    0.15 * activity_score
  );

  const score = to100(raw_score);

  return {
    name: 'interface',
    score,
    components: {
      ground_floor_density_per_km2: gf_density,
      third_places_density_per_km2: tp_density,
      building_diversity,
      commercial_building_ratio: commercial_ratio,
      activity_rating: activity_score,
      ground_floor_pois: ground_floor_pois.length,
      third_places: third_places.length,
      total_buildings: buildings.length,
    },
    interpretation: interpretInterface(score, third_places.length, gf_density),
  };
}

function interpretInterface(score, third_places, gf_density) {
  if (score >= 80) {
    return `Excellent interface density: ${third_places} third places and ${gf_density.toFixed(0)} ground-floor businesses/km².`;
  } else if (score >= 60) {
    return `Good interfaces: ${third_places} third places provide opportunities for unplanned social contact.`;
  } else if (score >= 40) {
    return `Moderate interface density. Some activated edges but built environment may feel more private.`;
  } else {
    return `Low interface density. Few ground-floor businesses or third places.`;
  }
}

function scoreTemporal(pois) {
  if (!pois || pois.length === 0) {
    return {
      name: 'temporal',
      score: 0,
      components: {},
      interpretation: 'No POI data available for temporal scoring',
    };
  }

  // Build schedules based on category heuristics
  const schedules = [];
  const categorySchedules = {
    food_drink: {d: Array(7).fill().map((_, d) => [[7, 22]])},
    retail: {d: [[], [9, 18], [9, 18], [9, 18], [9, 18], [9, 18], []]},
    services: {d: [[], [8, 17], [8, 17], [8, 17], [8, 17], [8, 17], []]},
    culture_education: {d: Array(7).fill().map((_, d) => [[9, 21]])},
    recreation: {d: Array(7).fill().map((_, d) => [[6, 22]])},
    civic_social: {d: Array(7).fill().map((_, d) => [[0, 24]])},
    workspace: {d: [[], [7, 20], [7, 20], [7, 20], [7, 20], [7, 20], []]},
    accommodation: {d: Array(7).fill().map((_, d) => [[0, 24]])},
  };

  for (const poi of pois) {
    const sched = categorySchedules[poi.category];
    if (sched) {
      const weekly = {};
      for (let d = 0; d < 7; d++) {
        weekly[d] = sched.d[d] || [];
      }
      schedules.push({ source: 'heuristic', weekly, category: poi.category });
    }
  }

  if (schedules.length === 0) {
    return {
      name: 'temporal',
      score: 50,
      components: {},
      interpretation: 'No schedule data available',
    };
  }

  // Hourly coverage
  const hourly = Array(24).fill(0);
  for (const sched of schedules) {
    for (const periods of Object.values(sched.weekly)) {
      for (const [open_h, close_h] of periods) {
        for (let h = Math.floor(open_h); h < Math.min(Math.ceil(close_h), 24); h++) {
          hourly[h] += 1;
        }
      }
    }
  }
  for (let h = 0; h < 24; h++) {
    hourly[h] /= 7;
  }
  const hourly_coverage = hourly.filter(c => c > 0).length / 24;
  const hourly_entropy = normalizedEntropy(hourly);

  // Day-of-week evenness
  const daily = Array(7).fill(0);
  for (const sched of schedules) {
    for (const [day, periods] of Object.entries(sched.weekly)) {
      for (const [open_h, close_h] of periods) {
        daily[parseInt(day)] += (close_h - open_h);
      }
    }
  }
  const dow_evenness = normalizedEntropy(daily);

  // Schedule diversity (simplified)
  const schedule_diversity = 0.5; // neutral default

  // Evening economy
  const evening_places = schedules.filter(s => {
    for (const periods of Object.values(s.weekly)) {
      for (const [open_h, close_h] of periods) {
        if (open_h < 23 && close_h > 18) return true;
      }
    }
    return false;
  }).length;
  const evening_ratio = evening_places / schedules.length;

  // Period coverage (simplified)
  const active_periods = 5; // reasonable estimate
  const period_coverage = 5 / 7;

  // Combine
  const raw_score = (
    0.20 * hourly_coverage +
    0.20 * hourly_entropy +
    0.15 * dow_evenness +
    0.15 * schedule_diversity +
    0.15 * evening_ratio +
    0.15 * period_coverage
  );

  const score = to100(raw_score);

  return {
    name: 'temporal',
    score,
    components: {
      hourly_coverage,
      hourly_entropy,
      day_of_week_evenness: dow_evenness,
      schedule_diversity,
      evening_economy_ratio: evening_ratio,
      active_periods,
      period_coverage,
      places_with_schedules: schedules.length,
    },
    interpretation: interpretTemporal(score, hourly_coverage, evening_ratio, active_periods),
  };
}

function normalizedEntropy(values) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0 || values.length <= 1) return 0;

  const nonzero = values.filter(v => v > 0);
  if (nonzero.length <= 1) return 0;

  let entropy = 0;
  for (const v of nonzero) {
    entropy -= (v / total) * Math.log2(v / total);
  }
  const max_entropy = Math.log2(values.length);
  return max_entropy > 0 ? entropy / max_entropy : 0;
}

function interpretTemporal(score, hourly_cov, evening, periods) {
  if (score >= 80) {
    return `Excellent temporal layering: ${(hourly_cov * 100).toFixed(0)}% hourly coverage across ${periods} time periods.`;
  } else if (score >= 60) {
    return `Good temporal spread: ${periods} active time periods. Life beyond business hours.`;
  } else if (score >= 40) {
    return `Moderate temporal spread: ${(evening * 100).toFixed(0)}% evening presence.`;
  } else {
    return `Limited temporal layering: activity concentrated in few periods.`;
  }
}

function scoreSocialMixing() {
  // Browser version doesn't have Census data, return neutral
  return {
    name: 'social_mixing',
    score: 50,
    components: {
      income_entropy: 0.5,
      age_entropy: 0.5,
      housing_tenure_entropy: 0.5,
      household_type_entropy: 0.5,
      education_entropy: 0.5,
      commute_mode_entropy: 0.5,
    },
    interpretation: 'No Census data available in browser version. Score defaults to neutral (50). Provide Census API data for demographic scoring.',
  };
}

/**
 * MAIN SCORING ENTRY POINT
 */

async function scoreLocation(lat, lng) {
  const overpass = new OverpassClient();

  // Compute bounding boxes at ~5min, ~10min, ~20min walk radii
  // Rough approximation: 5min ≈ 400m, 10min ≈ 800m, 20min ≈ 1600m
  const time_budgets = [5, 10, 20];
  const radius_meters = [400, 800, 1600];

  const scaleResults = {};
  let allPois = []; // Collect POIs for map display

  for (let i = 0; i < time_budgets.length; i++) {
    const budget = time_budgets[i];
    const radius = radius_meters[i];
    const bbox = computeBoundingBox(lat, lng, radius);

    console.log(`Fetching data for ${budget}-minute radius (${radius}m)...`);

    try {
      const [pois, streets, buildings] = await Promise.all([
        overpass.fetchPOIs(bbox),
        overpass.fetchStreetNetwork(bbox),
        overpass.fetchBuildings(bbox),
      ]);

      // Collect POIs for map (deduplicate by id)
      const seenIds = new Set(allPois.map(p => p.id));
      for (const p of pois) {
        if (!seenIds.has(p.id)) {
          allPois.push(p);
          seenIds.add(p.id);
        }
      }

      // Estimate area in km²
      const area_km2 = Math.PI * (radius / 1000) ** 2;

      scaleResults[budget] = {
        diversity: scoreDiversity(pois, area_km2),
        porosity: scorePorosity(streets, area_km2),
        interface: scoreInterface(pois, buildings, area_km2),
        temporal: scoreTemporal(pois),
        social_mixing: scoreSocialMixing(),
      };
    } catch (err) {
      console.error(`Failed to fetch data for ${budget}-minute radius:`, err);
      scaleResults[budget] = {
        diversity: { name: 'diversity', score: 0, components: {}, interpretation: 'Data fetch failed' },
        porosity: { name: 'porosity', score: 0, components: {}, interpretation: 'Data fetch failed' },
        interface: { name: 'interface', score: 0, components: {}, interpretation: 'Data fetch failed' },
        temporal: { name: 'temporal', score: 0, components: {}, interpretation: 'Data fetch failed' },
        social_mixing: { name: 'social_mixing', score: 50, components: {}, interpretation: 'Data fetch failed' },
      };
    }
  }

  // Combine scales (weights: 5min=0.5, 10min=0.3, 20min=0.2)
  const weights = [0.5, 0.3, 0.2];
  const combined = {};

  for (const scoreName of ['diversity', 'porosity', 'interface', 'temporal', 'social_mixing']) {
    let weighted_score = 0;
    const scale_scores = {};

    for (let i = 0; i < time_budgets.length; i++) {
      const budget = time_budgets[i];
      const detail = scaleResults[budget][scoreName];
      weighted_score += detail.score * weights[i];
      scale_scores[budget] = detail.score;
    }

    const primary = scaleResults[5][scoreName];
    combined[scoreName] = {
      name: scoreName,
      score: Math.round(weighted_score * 10) / 10,
      components: primary.components,
      scale_scores,
      interpretation: primary.interpretation,
    };
  }

  // Compute overall score (weights: diversity=0.25, porosity=0.20, interface=0.20, temporal=0.15, social_mixing=0.20)
  const subscore_weights = {
    diversity: 0.25,
    porosity: 0.20,
    interface: 0.20,
    temporal: 0.15,
    social_mixing: 0.20,
  };

  const overall = Object.entries(subscore_weights).reduce((sum, [name, weight]) => {
    return sum + combined[name].score * weight;
  }, 0);

  return {
    lat,
    lng,
    overall: Math.round(overall * 10) / 10,
    diversity: combined.diversity.score,
    porosity: combined.porosity.score,
    interface: combined.interface.score,
    temporal: combined.temporal.score,
    social_mixing: combined.social_mixing.score,
    details: combined,
    travel_mode: 'walk',
    time_budgets: time_budgets,
    _raw: { pois: allPois },
  };
}

/**
 * GAP ANALYSIS
 */

const COMPONENT_GAPS = {
  diversity: [
    ['category_entropy', 0.6, 'Low variety across use categories', 'use_mix'],
    ['subcategory_richness', 0.4, 'Few distinct business types', 'business_variety'],
    ['category_coverage', 0.5, 'Missing entire functional categories', 'missing_category'],
    ['spatial_mixing', 0.5, 'Uses clustered rather than interleaved', 'spatial_design'],
    ['price_diversity', 0.4, 'Narrow price range', 'economic_range'],
  ],
  porosity: [
    ['intersection_ratio', 0.3, 'Few true intersections (low route choice)', 'connectivity'],
    ['dead_end_ratio', 0.3, 'High dead-end ratio (too many cul-de-sacs)', 'connectivity'],
    ['intersection_density_per_km2', 30, 'Low intersection density', 'block_structure'],
    ['network_density_km_per_km2', 8, 'Sparse street network', 'street_infra'],
    ['pedestrian_path_ratio', 0.15, 'Little dedicated pedestrian infrastructure', 'ped_infra'],
    ['route_directness', 1.5, 'Indirect routes (barriers forcing detours)', 'barrier_removal'],
  ],
  interface: [
    ['ground_floor_density_per_km2', 30, 'Few ground-floor businesses', 'ground_floor'],
    ['third_places_density_per_km2', 5, 'Few third places for lingering', 'third_place'],
    ['building_diversity', 0.4, 'Monotonous building stock', 'built_form'],
    ['commercial_building_ratio', 0.08, 'Low commercial-to-residential ratio', 'mixed_use'],
    ['activity_rating', 0.4, 'Low street-level activity', 'activation'],
  ],
  temporal: [
    ['hourly_coverage', 0.7, 'Dead hours during the day', 'extended_hours'],
    ['hourly_entropy', 0.7, 'Activity concentrated in few hours', 'schedule_spread'],
    ['day_of_week_evenness', 0.7, 'Weekday/weekend imbalance', 'weekend_activity'],
    ['schedule_diversity', 0.5, 'Most places share the same schedule', 'schedule_variety'],
    ['evening_economy_ratio', 0.3, 'Weak evening economy', 'evening_use'],
    ['period_coverage', 0.7, 'Time periods with no activity', 'gap_filling'],
  ],
  social_mixing: [
    ['income_entropy', 0.6, 'Narrow income distribution', 'affordable_housing'],
    ['age_entropy', 0.6, 'Limited age diversity', 'age_inclusive'],
    ['housing_tenure_entropy', 0.6, 'Dominated by owners or renters', 'tenure_mix'],
    ['commute_mode_entropy', 0.5, 'One dominant commute mode', 'transport_mode'],
  ],
};

const INVERTED_COMPONENTS = new Set(['dead_end_ratio', 'route_directness']);

function analyzeGaps(result) {
  const subscores = [
    ['diversity', result.diversity],
    ['porosity', result.porosity],
    ['interface', result.interface],
    ['temporal', result.temporal],
    ['social_mixing', result.social_mixing],
  ].sort((a, b) => a[1] - b[1]);

  const gaps = [];

  for (const [subscore_name] of subscores) {
    const detail = result.details[subscore_name];
    if (!detail || !detail.components) continue;

    const gap_defs = COMPONENT_GAPS[subscore_name] || [];
    for (const [comp_name, threshold, label, gap_type] of gap_defs) {
      const value = detail.components[comp_name];
      if (value === undefined) continue;

      let is_gap = false;
      let severity = 0;

      if (INVERTED_COMPONENTS.has(comp_name)) {
        if (value > threshold) {
          severity = Math.min(1.0, (value - threshold) / threshold);
          is_gap = true;
        }
      } else {
        if (value < threshold) {
          severity = Math.min(1.0, (threshold - value) / threshold);
          is_gap = true;
        }
      }

      if (is_gap) {
        gaps.push({
          subscore: subscore_name,
          component: comp_name,
          label,
          gap_type,
          severity,
          current_value: value,
          threshold,
        });
      }
    }
  }

  const binding_constraints = subscores
    .filter((_, i) => subscores[i][1] <= subscores[0][1] + 10)
    .map(s => s[0]);

  const gap_types_needed = {};
  for (const gap of gaps) {
    gap_types_needed[gap.gap_type] = (gap_types_needed[gap.gap_type] || 0) + gap.severity;
  }

  return {
    lat: result.lat,
    lng: result.lng,
    overall_score: result.overall,
    gaps: gaps.sort((a, b) => b.severity - a.severity),
    subscore_rankings: subscores,
    binding_constraints,
    gap_types_needed: Object.entries(gap_types_needed)
      .sort((a, b) => b[1] - a[1])
      .map(e => e[0]),
  };
}

/**
 * INTERVENTIONS
 */

function getInterventionLibrary() {
  return [
    {
      name: 'Neighborhood Mixed-Use Building',
      description: '2-3 story building with ground-floor retail and upper-floor apartments.',
      category: 'mixed_use',
      addresses_gap_types: ['use_mix', 'business_variety', 'ground_floor', 'mixed_use', 'extended_hours', 'evening_use'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.15, mechanism: 'Adds 2-3 new use categories'},
          {component: 'subcategory_richness', delta: 0.10, mechanism: 'Introduces new business types'},
        ],
        interface: [
          {component: 'ground_floor_density_per_km2', delta: 15, mechanism: 'Adds 3-5 ground-floor units'},
          {component: 'building_diversity', delta: 0.15, mechanism: 'Adds mixed form to area'},
        ],
        temporal: [
          {component: 'schedule_diversity', delta: 0.15, mechanism: 'Residential + commercial scheduling'},
          {component: 'evening_economy_ratio', delta: 0.15, mechanism: 'Evening activity from residents and businesses'},
        ],
        social_mixing: [
          {component: 'income_entropy', delta: 0.05, mechanism: 'Mix of affordable and market-rate'},
          {component: 'housing_tenure_entropy', delta: 0.08, mechanism: 'Rental units in owner area'},
        ],
      },
      precedents: ['The Buttery / 41st Ave', 'SE Division mixed-use, Portland', 'Rockridge infill, Oakland'],
      risks: ['Community opposition to density', 'Parking concerns', 'Zoning barriers'],
    },
    {
      name: 'Community Cafe + Co-working Space',
      description: 'Small commercial building with cafe below and co-working space above.',
      category: 'commercial',
      addresses_gap_types: ['third_place', 'ground_floor', 'activation', 'evening_use'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.08, mechanism: 'Adds food_drink + workspace'},
          {component: 'subcategory_richness', delta: 0.05, mechanism: 'New business types'},
        ],
        interface: [
          {component: 'ground_floor_density_per_km2', delta: 5, mechanism: 'Activated ground floor'},
          {component: 'third_places_density_per_km2', delta: 3, mechanism: 'Quintessential third place'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.08, mechanism: 'Early morning to evening'},
          {component: 'evening_economy_ratio', delta: 0.10, mechanism: 'Evening events and community use'},
        ],
      },
      precedents: ['Verve Coffee, Santa Cruz', 'Surf City Roasters'],
      risks: ['Requires commercial zoning', 'Parking in residential area'],
    },
    {
      name: 'Food Hall / Market Hall',
      description: 'Shared space with 5-10 food vendors, retail stalls, and communal seating.',
      category: 'commercial',
      addresses_gap_types: ['business_variety', 'economic_range', 'ground_floor', 'activation'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.10, mechanism: 'Multiple food concepts'},
          {component: 'subcategory_richness', delta: 0.15, mechanism: '5-10 distinct vendors'},
          {component: 'price_diversity', delta: 0.15, mechanism: 'Wide price range'},
        ],
        interface: [
          {component: 'ground_floor_density_per_km2', delta: 10, mechanism: 'Multiple activated fronts'},
          {component: 'third_places_density_per_km2', delta: 2, mechanism: 'Communal seating areas'},
        ],
        temporal: [
          {component: 'schedule_diversity', delta: 0.12, mechanism: 'Different vendor hours'},
          {component: 'evening_economy_ratio', delta: 0.15, mechanism: 'Dinner and late-night food'},
        ],
      },
      precedents: ['Abbott Square Market, Santa Cruz', 'Swan\'s Marketplace, Oakland'],
      risks: ['Requires commercial zoning', 'Management complexity'],
    },
    {
      name: 'Community Center / Maker Space',
      description: 'Multi-purpose building with flexible event space, workshops, meeting rooms.',
      category: 'civic',
      addresses_gap_types: ['third_place', 'missing_category', 'schedule_variety', 'weekend_activity'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.12, mechanism: 'Adds culture and civic categories'},
          {component: 'category_coverage', delta: 0.10, mechanism: 'Fills cultural gap'},
        ],
        interface: [
          {component: 'third_places_density_per_km2', delta: 4, mechanism: 'Primary third place function'},
          {component: 'activity_rating', delta: 0.10, mechanism: 'Programmed events'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.10, mechanism: 'Morning to evening programming'},
          {component: 'schedule_diversity', delta: 0.15, mechanism: 'Rotating programming'},
          {component: 'weekend_activity', delta: 0.15, mechanism: 'Weekend workshops and markets'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.08, mechanism: 'All ages welcome'},
          {component: 'income_entropy', delta: 0.05, mechanism: 'Free/low-cost programming'},
        ],
      },
      precedents: ['Simpkins Swim Center, Santa Cruz', 'Tool libraries'],
      risks: ['Requires special permit', 'Community programming needed'],
    },
    {
      name: 'Pocket Park + Plaza',
      description: 'Designed outdoor space with park and hardscaped plaza for gatherings and popup markets.',
      category: 'civic',
      addresses_gap_types: ['third_place', 'activation', 'weekend_activity'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.05, mechanism: 'Adds recreation category'},
          {component: 'spatial_mixing', delta: 0.05, mechanism: 'Creates gathering node'},
        ],
        interface: [
          {component: 'third_places_density_per_km2', delta: 3, mechanism: 'Gathering space'},
          {component: 'activity_rating', delta: 0.08, mechanism: 'Passive surveillance'},
        ],
        temporal: [
          {component: 'weekend_activity', delta: 0.12, mechanism: 'Weekend markets and events'},
          {component: 'evening_economy_ratio', delta: 0.05, mechanism: 'Evening gathering spot'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.05, mechanism: 'All ages can gather'},
          {component: 'income_entropy', delta: 0.03, mechanism: 'Free public space'},
        ],
      },
      precedents: ['Paley Park, NYC', 'Jack O\'Neill Park', 'Depot Park, Santa Cruz'],
      risks: ['Maintenance requirements', 'Programming needed for activation'],
    },
    {
      name: 'Neighborhood Garden + Outdoor Classroom',
      description: 'Community garden with plots, composting, and outdoor classroom.',
      category: 'civic',
      addresses_gap_types: ['third_place', 'missing_category', 'age_inclusive', 'weekend_activity'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.05, mechanism: 'Adds recreation category'},
          {component: 'category_coverage', delta: 0.05, mechanism: 'Fills recreation/civic gap'},
        ],
        interface: [
          {component: 'third_places_density_per_km2', delta: 2, mechanism: 'Third place function'},
          {component: 'activity_rating', delta: 0.05, mechanism: 'Steady gardener presence'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.04, mechanism: 'Early morning to dusk'},
          {component: 'weekend_activity', delta: 0.10, mechanism: 'Peak weekend usage'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.06, mechanism: 'All ages attracted'},
          {component: 'income_entropy', delta: 0.04, mechanism: 'Low-cost participation'},
        ],
      },
      precedents: ['Live Earth Farm, Santa Cruz', 'Homeless Garden Project'],
      risks: ['Land requirements', 'Ongoing maintenance', 'Water access'],
    },
    {
      name: 'Live/Work Studios (Artist / Artisan)',
      description: 'Cluster of 4-8 live/work units with ground-floor studio/shop space.',
      category: 'live_work',
      addresses_gap_types: ['mixed_use', 'ground_floor', 'built_form', 'activation'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.08, mechanism: 'Adds workspace and local production'},
          {component: 'subcategory_richness', delta: 0.06, mechanism: 'New artisan types'},
        ],
        interface: [
          {component: 'ground_floor_density_per_km2', delta: 8, mechanism: '4-8 studio storefronts'},
          {component: 'commercial_building_ratio', delta: 0.04, mechanism: 'Mixed commercial presence'},
          {component: 'building_diversity', delta: 0.10, mechanism: 'Distinctive architectural form'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.06, mechanism: 'Live/work extends hours'},
          {component: 'schedule_diversity', delta: 0.08, mechanism: 'Maker schedules vary widely'},
        ],
        social_mixing: [
          {component: 'income_entropy', delta: 0.03, mechanism: 'Artist-friendly affordability'},
          {component: 'housing_tenure_entropy', delta: 0.04, mechanism: 'Ownership pathway'},
        ],
      },
      precedents: ['Catalyst Artisans, Santa Cruz', 'Live/work lofts, Oakland'],
      risks: ['Live/work zoning uncommon', 'Affordability pressure over time'],
    },
    {
      name: 'Bike Shop + Repair Hub',
      description: 'Combined retail bike shop, repair services, and community cycling space.',
      category: 'commercial',
      addresses_gap_types: ['business_variety', 'ground_floor', 'transportation_mode', 'local_economy'],
      effects: {
        diversity: [
          {component: 'subcategory_richness', delta: 0.05, mechanism: 'Specialized business type'},
        ],
        interface: [
          {component: 'ground_floor_density_per_km2', delta: 3, mechanism: 'Activated storefront'},
        ],
        temporal: [
          {component: 'schedule_diversity', delta: 0.05, mechanism: 'Community events after hours'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.03, mechanism: 'Attracts diverse cyclists'},
        ],
      },
      precedents: ['The Bicycle Shop, Santa Cruz', 'Community Bike Workshop'],
      risks: ['Niche market', 'Seasonal demand variation'],
    },
    {
      name: 'Public Library Branch / Reading Room',
      description: 'Neighborhood library with traditional collection, digital access, meeting rooms.',
      category: 'civic',
      addresses_gap_types: ['missing_category', 'third_place', 'age_inclusive', 'free_access'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.10, mechanism: 'Adds culture/education category'},
          {component: 'category_coverage', delta: 0.08, mechanism: 'Fills education gap'},
        ],
        interface: [
          {component: 'third_places_density_per_km2', delta: 4, mechanism: 'Classic third place'},
          {component: 'activity_rating', delta: 0.08, mechanism: 'Consistent foot traffic'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.08, mechanism: 'Morning through evening'},
          {component: 'evening_economy_ratio', delta: 0.05, mechanism: 'Evening programming'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.08, mechanism: 'All ages use library'},
          {component: 'income_entropy', delta: 0.06, mechanism: 'Free access for all'},
        ],
      },
      precedents: ['Downtown Library, Santa Cruz', 'Neighborhood branches statewide'],
      risks: ['Funding requirements', 'Staffing'],
    },
    {
      name: 'Small Restaurant / Neighborhood Bistro',
      description: '30-50 seat restaurant with local, seasonal focus. Counter seating emphasizes sociability.',
      category: 'commercial',
      addresses_gap_types: ['food_drink', 'ground_floor', 'activation', 'evening_use', 'social_space'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.06, mechanism: 'Adds food_drink category'},
          {component: 'price_diversity', delta: 0.08, mechanism: 'Accessible price point'},
        ],
        interface: [
          {component: 'ground_floor_density_per_km2', delta: 4, mechanism: 'Active ground floor'},
          {component: 'third_places_density_per_km2', delta: 1, mechanism: 'Lingering space at bar'},
          {component: 'activity_rating', delta: 0.12, mechanism: 'High foot traffic'},
        ],
        temporal: [
          {component: 'evening_economy_ratio', delta: 0.20, mechanism: 'Dinner service extends evening'},
          {component: 'hourly_coverage', delta: 0.06, mechanism: 'Lunch and dinner hours'},
        ],
        social_mixing: [
          {component: 'income_entropy', delta: 0.02, mechanism: 'Accessible dining'},
          {component: 'age_entropy', delta: 0.02, mechanism: 'Attracts diverse diners'},
        ],
      },
      precedents: ['Local bistros throughout Santa Cruz', 'Neighborhood restaurants'],
      risks: ['Low restaurant margins', 'Parking concerns', 'Lease costs'],
    },
    {
      name: 'Public Bathrooms + Water Fountains',
      description: 'Well-maintained public restrooms and drinking fountains in strategic locations.',
      category: 'civic',
      addresses_gap_types: ['public_amenity', 'accessibility', 'gathering_infrastructure'],
      effects: {
        interface: [
          {component: 'activity_rating', delta: 0.05, mechanism: 'Enables longer visits and lingering'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.02, mechanism: 'Enables families, elderly to visit longer'},
          {component: 'income_entropy', delta: 0.01, mechanism: 'Removes barrier to park use'},
        ],
      },
      precedents: ['Public restroom networks, major cities'],
      risks: ['Maintenance cost and complexity', 'Safety and cleanliness concerns'],
    },
    {
      name: 'Flexible Market Stalls / Parklets',
      description: 'Modular infrastructure for popup markets, food trucks, temporary retail on public land.',
      category: 'civic',
      addresses_gap_types: ['business_variety', 'ground_floor', 'activation', 'weekend_activity', 'flexibility'],
      effects: {
        diversity: [
          {component: 'subcategory_richness', delta: 0.08, mechanism: 'Rotating vendor diversity'},
          {component: 'price_diversity', delta: 0.10, mechanism: 'Wide price range in vendors'},
        ],
        interface: [
          {component: 'ground_floor_density_per_km2', delta: 6, mechanism: 'Temporary activation'},
          {component: 'activity_rating', delta: 0.10, mechanism: 'Event-driven gathering'},
        ],
        temporal: [
          {component: 'weekend_activity', delta: 0.15, mechanism: 'Weekend markets and events'},
          {component: 'evening_economy_ratio', delta: 0.08, mechanism: 'Evening food trucks'},
        ],
        social_mixing: [
          {component: 'income_entropy', delta: 0.05, mechanism: 'Affordable food and goods'},
        ],
      },
      precedents: ['Parklet program, SF', 'Weekly farmers markets throughout CA'],
      risks: ['Permitting complexity', 'Vendor coordination'],
    },
    {
      name: 'Dog Park / Pet-Friendly Space',
      description: 'Dedicated off-leash dog area with seating and shade for owners.',
      category: 'recreation',
      addresses_gap_types: ['recreation', 'third_place', 'social_infrastructure'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.04, mechanism: 'Adds recreation category'},
        ],
        interface: [
          {component: 'third_places_density_per_km2', delta: 2, mechanism: 'Dog owner gathering space'},
          {component: 'activity_rating', delta: 0.06, mechanism: 'Regular visitor traffic'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.04, mechanism: 'Morning and evening peak use'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.04, mechanism: 'Attracts families and seniors'},
          {component: 'income_entropy', delta: 0.02, mechanism: 'Free community gathering'},
        ],
      },
      precedents: ['Dog parks throughout Bay Area', 'Jack O\'Neill Park adjacent spaces'],
      risks: ['Maintenance and cleanup', 'Neighbor relations'],
    },
    {
      name: 'Night Market / Evening Bazaar',
      description: 'Organized recurring evening market with food vendors, crafts, entertainment.',
      category: 'civic',
      addresses_gap_types: ['evening_use', 'activation', 'social_gathering', 'business_variety'],
      effects: {
        diversity: [
          {component: 'subcategory_richness', delta: 0.10, mechanism: '10-15 vendor types'},
        ],
        interface: [
          {component: 'activity_rating', delta: 0.15, mechanism: 'High-traffic evening event'},
        ],
        temporal: [
          {component: 'evening_economy_ratio', delta: 0.25, mechanism: 'Strong evening activation'},
          {component: 'hourly_coverage', delta: 0.08, mechanism: 'Extends day into evening'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.06, mechanism: 'Family-friendly evening gathering'},
          {component: 'income_entropy', delta: 0.05, mechanism: 'Accessible price range'},
        ],
      },
      precedents: ['Night markets in LA, SF', 'Weekly street fairs'],
      risks: ['Permitting and coordination', 'Noise and traffic impacts', 'Weather dependent'],
    },
    {
      name: 'Affordable Housing (Below-Market-Rate)',
      description: 'New residential building, 30-50% affordable units mixed throughout.',
      category: 'housing',
      addresses_gap_types: ['affordable_housing', 'economic_diversity', 'social_mixing', 'tenure_mix'],
      effects: {
        social_mixing: [
          {component: 'income_entropy', delta: 0.12, mechanism: 'Direct income diversity'},
          {component: 'housing_tenure_entropy', delta: 0.06, mechanism: 'Mix of renter/owner if includes ownership'},
          {component: 'age_entropy', delta: 0.04, mechanism: 'Attracts diverse age groups'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.04, mechanism: 'Resident activity throughout day'},
        ],
      },
      precedents: ['Mission Rock, SF', 'Housing developments with deed restrictions'],
      risks: ['Development cost', 'Community displacement concerns', 'Subsidy mechanisms'],
    },
    {
      name: 'Childcare Center / Preschool',
      description: 'Licensed childcare facility with outdoor play space and family support services.',
      category: 'services',
      addresses_gap_types: ['missing_category', 'social_infrastructure', 'age_inclusive', 'business_variety'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.06, mechanism: 'Adds services category'},
        ],
        interface: [
          {component: 'activity_rating', delta: 0.08, mechanism: 'Peak traffic at drop-off/pickup'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.06, mechanism: 'Morning and afternoon peaks'},
          {component: 'weekday_focus', delta: 0.10, mechanism: 'Weekday-heavy usage'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.08, mechanism: 'Serves young families'},
          {component: 'income_entropy', delta: 0.04, mechanism: 'Diverse family economics'},
        ],
      },
      precedents: ['Various childcare facilities statewide'],
      risks: ['Licensing and regulation', 'Affordability for families', 'Parking requirements'],
    },
    {
      name: 'Local Bookstore / Independent Retail',
      description: 'Curated bookstore or specialty retail shop with reading area and events.',
      category: 'retail',
      addresses_gap_types: ['business_variety', 'ground_floor', 'third_place', 'local_economy'],
      effects: {
        diversity: [
          {component: 'subcategory_richness', delta: 0.06, mechanism: 'Specialized retail type'},
        ],
        interface: [
          {component: 'ground_floor_density_per_km2', delta: 3, mechanism: 'Activated storefront'},
          {component: 'third_places_density_per_km2', delta: 2, mechanism: 'Reading and lingering space'},
          {component: 'activity_rating', delta: 0.08, mechanism: 'Regular customer traffic'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.05, mechanism: 'Extended retail hours'},
          {component: 'schedule_diversity', delta: 0.06, mechanism: 'Author events and readings'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.05, mechanism: 'All ages visit bookstore'},
        ],
      },
      precedents: ['Independent bookstores throughout CA', 'The Bookshop Santa Cruz'],
      risks: ['Competition from online retail', 'Lease costs'],
    },
    {
      name: 'Fitness Studio / Yoga Space',
      description: 'Small fitness or yoga studio with classes throughout the day and evening.',
      category: 'recreation',
      addresses_gap_types: ['recreation', 'ground_floor', 'evening_use', 'social_infrastructure'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.05, mechanism: 'Adds recreation category'},
        ],
        interface: [
          {component: 'ground_floor_density_per_km2', delta: 3, mechanism: 'Activated ground floor'},
          {component: 'activity_rating', delta: 0.07, mechanism: 'Regular class participants'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.08, mechanism: 'Morning to evening classes'},
          {component: 'evening_economy_ratio', delta: 0.10, mechanism: 'Strong evening class schedule'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.04, mechanism: 'Attracts broad age range'},
          {component: 'income_entropy', delta: 0.02, mechanism: 'Accessible fitness options'},
        ],
      },
      precedents: ['Yoga and fitness studios throughout Santa Cruz'],
      risks: ['Competition from online fitness', 'Membership volatility'],
    },
    {
      name: 'Outdoor Seating / Public Furniture Improvements',
      description: 'Strategic addition of benches, tables, shade structures in underused spaces.',
      category: 'civic',
      addresses_gap_types: ['third_place', 'activation', 'accessibility', 'public_realm'],
      effects: {
        interface: [
          {component: 'third_places_density_per_km2', delta: 1, mechanism: 'Creates lingering spots'},
          {component: 'activity_rating', delta: 0.08, mechanism: 'Enables people to stay longer'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.03, mechanism: 'Encourages all-day presence'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.03, mechanism: 'Enables elderly and tired visitors'},
          {component: 'income_entropy', delta: 0.02, mechanism: 'Free gathering infrastructure'},
        ],
      },
      precedents: ['Public seating improvements citywide'],
      risks: ['Maintenance', 'Homelessness and social issues'],
    },
    {
      name: 'Art Walks / Mural Program',
      description: 'Community public art program featuring murals, sculptures, and rotating exhibitions.',
      category: 'civic',
      addresses_gap_types: ['missing_category', 'activation', 'cultural_space', 'built_form'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.07, mechanism: 'Adds culture category'},
        ],
        interface: [
          {component: 'building_diversity', delta: 0.10, mechanism: 'Visual interest in built form'},
          {component: 'activity_rating', delta: 0.07, mechanism: 'Attracts visitors and photographers'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.03, mechanism: 'All-day destination'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.03, mechanism: 'Family-friendly activity'},
        ],
      },
      precedents: ['Bay Area muralist programs', 'East LA mural culture'],
      risks: ['Perceived gentrification', 'Maintenance of murals'],
    },
    {
      name: 'Community Composting Hub',
      description: 'Drop-off point for residential composting with education and community workspace.',
      category: 'civic',
      addresses_gap_types: ['missing_category', 'environmental_education', 'community_infrastructure'],
      effects: {
        diversity: [
          {component: 'category_entropy', delta: 0.04, mechanism: 'Adds civic category'},
        ],
        interface: [
          {component: 'activity_rating', delta: 0.05, mechanism: 'Regular resident visits'},
        ],
        temporal: [
          {component: 'schedule_diversity', delta: 0.04, mechanism: 'Regular composting schedule'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.03, mechanism: 'All ages participate'},
          {component: 'income_entropy', delta: 0.02, mechanism: 'Free community program'},
        ],
      },
      precedents: ['Community Composting sites throughout Bay Area'],
      risks: ['Site requirements', 'Odor and pest management'],
    },
    {
      name: 'Dedicated Pedestrian / Bike Promenade',
      description: 'Traffic-calmed or car-free street optimized for walking, cycling, and gathering.',
      category: 'streets',
      addresses_gap_types: ['connectivity', 'ped_infra', 'public_realm', 'activation', 'street_design'],
      effects: {
        porosity: [
          {component: 'pedestrian_path_ratio', delta: 0.25, mechanism: 'Dedicated ped/bike infrastructure'},
          {component: 'route_directness', delta: -0.15, mechanism: 'More pleasant, direct walking'},
        ],
        interface: [
          {component: 'activity_rating', delta: 0.15, mechanism: 'Safe gathering space'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.06, mechanism: 'All-day usage'},
        ],
        social_mixing: [
          {component: 'age_entropy', delta: 0.05, mechanism: 'Enables all ages to walk'},
        ],
      },
      precedents: ['Valencia St, SF', 'Cowell Beach promenade, Santa Cruz'],
      risks: ['Parking removal impact', 'Business concern about car access', 'Construction'],
    },
    {
      name: 'Incremental Housing (ADUs / Cottage Courts)',
      description: 'Small, low-cost residential units (ADUs, cottage courts) on underutilized land.',
      category: 'housing',
      addresses_gap_types: ['affordable_housing', 'economic_diversity', 'housing_supply', 'local_production'],
      effects: {
        diversity: [
          {component: 'spatial_mixing', delta: 0.05, mechanism: 'Mix of housing types in area'},
        ],
        social_mixing: [
          {component: 'income_entropy', delta: 0.08, mechanism: 'More affordable options'},
          {component: 'age_entropy', delta: 0.04, mechanism: 'Attracts young adults, empty-nesters'},
          {component: 'housing_tenure_entropy', delta: 0.04, mechanism: 'Renters in owner neighborhood'},
        ],
        temporal: [
          {component: 'hourly_coverage', delta: 0.05, mechanism: 'More residents = more activity'},
        ],
      },
      precedents: ['ADU ordinance, Santa Cruz', 'Cottage courts nationwide'],
      risks: ['Parking and infrastructure', 'Community opposition'],
    },
  ];
}

function recommendInterventions(result, gaps) {
  const library = getInterventionLibrary();

  const recommendations = [];

  for (const intervention of library) {
    let gap_coverage = 0;
    const covered_gap_types = new Set();

    for (const gap_type of intervention.addresses_gap_types) {
      if (gaps.gap_types_needed.includes(gap_type)) {
        gap_coverage += 1;
        covered_gap_types.add(gap_type);
      }
    }

    if (covered_gap_types.size === 0) continue;

    // Estimate lift by summing component deltas
    const component_lifts = {};
    let total_lift = 0;

    for (const [subscore_name, effects] of Object.entries(intervention.effects || {})) {
      let subscore_lift = 0;
      for (const effect of effects) {
        subscore_lift += effect.delta;
      }
      component_lifts[subscore_name] = subscore_lift;
      total_lift += subscore_lift * 0.2; // rough weighting
    }

    // Binding relief: how much does this help the weakest areas?
    const binding_relief = gaps.binding_constraints
      .filter(name => intervention.effects[name])
      .reduce((sum, name) => {
        return sum + (intervention.effects[name] || []).reduce((s, e) => s + e.delta, 0);
      }, 0);

    recommendations.push({
      name: intervention.name,
      description: intervention.description,
      category: intervention.category,
      gap_coverage: gap_coverage / Math.max(intervention.addresses_gap_types.length, 1),
      estimated_lift: total_lift,
      binding_relief,
      component_lifts,
      covers_gaps: Array.from(covered_gap_types),
      addresses_gap_types: intervention.addresses_gap_types,
      typical_lot_sqft: intervention.typical_lot_sqft,
      precedents: intervention.precedents,
      risks: intervention.risks,
    });
  }

  // Sort by binding relief (helps weakest areas most), then by overall lift
  recommendations.sort((a, b) => {
    if (b.binding_relief !== a.binding_relief) {
      return b.binding_relief - a.binding_relief;
    }
    return b.estimated_lift - a.estimated_lift;
  });

  return recommendations;
}

/**
 * EXPORTS - ES6 Modules
 */

export {
  scoreLocation,
  analyzeGaps,
  getInterventionLibrary,
  recommendInterventions,
  OverpassClient,
  POI_CATEGORIES,
};
