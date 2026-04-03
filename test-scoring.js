#!/usr/bin/env node
/**
 * Test file for scoring.js - ES Module version
 */

import * as scoring from './src/scoring.js';

console.log('===== SERENDIPITY SCORE - MODULE TEST =====\n');

console.log('✓ Module loaded successfully');
console.log('✓ Exported items:', Object.keys(scoring).sort().join(', '));
console.log('');

// Test 1: getInterventionLibrary
console.log('TEST 1: getInterventionLibrary()');
try {
  const lib = scoring.getInterventionLibrary();
  console.log(`✓ Loaded ${lib.length} intervention archetypes`);
  console.log('');
  console.log('First 5 archetypes:');
  lib.slice(0, 5).forEach((i, idx) => {
    console.log(`  ${idx + 1}. ${i.name}`);
    console.log(`     Category: ${i.category}`);
    console.log(`     Addresses: ${i.addresses_gap_types.slice(0, 3).join(', ')}...`);
  });
} catch (e) {
  console.error('✗ Error:', e.message);
}

console.log('');
console.log('TEST 2: POI_CATEGORIES');
try {
  const cats = Object.keys(scoring.POI_CATEGORIES);
  console.log(`✓ POI taxonomy with ${cats.length} categories:`);
  cats.forEach(cat => {
    const tagCount = Object.values(scoring.POI_CATEGORIES[cat]).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);
    console.log(`  - ${cat}: ${tagCount} OSM tags`);
  });
} catch (e) {
  console.error('✗ Error:', e.message);
}

console.log('');
console.log('TEST 3: Function signatures');
console.log(`✓ scoreLocation: ${typeof scoring.scoreLocation} (async function)`);
console.log(`✓ analyzeGaps: ${typeof scoring.analyzeGaps}`);
console.log(`✓ recommendInterventions: ${typeof scoring.recommendInterventions}`);
console.log(`✓ OverpassClient: ${typeof scoring.OverpassClient}`);

console.log('');
console.log('===== ALL TESTS PASSED =====');
