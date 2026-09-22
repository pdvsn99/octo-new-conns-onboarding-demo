/* ===========================================================================
   simulate.js
   Stand-ins for systems that don't exist yet:
     - Kraken/ECOES (electricity) & Kraken/XO (gas) supply lookups
     - the meter-photo "vision model"
   Every outcome is driven by the Demo Control Panel so any branch of the
   flowchart can be walked on demand (nothing here is random).
   =========================================================================== */

// Live state, one set of switches per fuel. Defaults = the happy path.
const DemoState = {
  electricity: { found: 'yes', newConnection: 'yes', addressMatch: 'yes', vision: 'high' },
  gas:         { found: 'yes', newConnection: 'yes', addressMatch: 'yes', vision: 'high' },
};

// The switches we expose in the panel, in display order.
const DEMO_CONTROLS = [
  { key: 'found',         label: 'MPxN found on Kraken?',       on: 'Found',      off: 'Not found' },
  { key: 'newConnection', label: 'new_connection = TRUE?',      on: 'True',       off: 'False' },
  { key: 'addressMatch',  label: 'Address on record matches?',  on: 'Matches',    off: "Doesn't match" },
  { key: 'vision',        label: 'Vision model confidence',     on: 'High',       off: 'Low', values: ['high', 'low'] },
];

// --- Fake lookups (they just read the switches) ------------------------------
const Simulate = {
  // Returns what the Kraken/ECOES or Kraken/XO query "found".
  lookup(fuel) {
    const s = DemoState[fuel];
    return {
      found: s.found === 'yes',
      newConnection: s.newConnection === 'yes',
      addressMatch: s.addressMatch === 'yes',
      system: fuel === 'electricity' ? 'Kraken / ECOES' : 'Kraken / XO',
    };
  },

  // Returns a plausible-looking vision-model read of the meter photo.
  visionRead(fuel) {
    const s = DemoState[fuel];
    const high = s.vision === 'high';
    const pct = high ? 88 + Math.floor(Math.random() * 11)   // 88–98%
                     : 34 + Math.floor(Math.random() * 25);  // 34–58%
    if (fuel === 'electricity') {
      return {
        confidence: s.vision,
        pct,
        items: [
          { k: 'Cut-out detected', v: high ? 'Yes' : 'Unclear' },
          { k: 'Meter tails visible', v: high ? 'Yes' : 'Partially' },
          { k: 'Image quality', v: high ? 'Good' : 'Blurred / low light' },
        ],
      };
    }
    return {
      confidence: s.vision,
      pct,
      items: [
        { k: 'ECV detected', v: high ? 'Yes' : 'Unclear' },
        { k: 'Emergency control valve position', v: high ? 'Visible' : 'Obscured' },
        { k: 'Image quality', v: high ? 'Good' : 'Blurred / low light' },
      ],
    };
  },
};
