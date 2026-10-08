/** Published community points from OpenStreetMap. Pins use these, not invented plots. */
export interface Centroid {
  match: string
  lat: number
  lng: number
}

/**
 * Longer names first. Matched against the card area and Trello list only,
 * so a project title like "Jumeirah Residences" does not leave Downtown.
 */
export const PLACE_CENTROIDS: Centroid[] = [
  { match: 'palm jebel ali', lat: 24.9876, lng: 55.02201 },
  { match: 'dubai land complex', lat: 25.08536, lng: 55.38298 },
  { match: 'dubai design district', lat: 25.18834, lng: 55.29748 },
  { match: 'jumeirah beach', lat: 25.18501, lng: 55.22349 },
  { match: 'rashid yachts', lat: 25.27111, lng: 55.26593 },
  { match: 'dubai hills', lat: 25.1214, lng: 55.26434 },
  { match: 'the valley', lat: 25.01147, lng: 55.44707 },
  { match: 'city walk', lat: 25.20816, lng: 55.26187 },
  { match: 'jumeirah', lat: 25.20696, lng: 55.2475 },
  { match: 'la mer', lat: 25.22709, lng: 55.25632 },
  { match: 'mina rashid', lat: 25.27111, lng: 55.26593 },
  { match: 'production city', lat: 25.03213, lng: 55.19127 },
  { match: 'creek harbour', lat: 25.19798, lng: 55.36038 },
  { match: 'business bay', lat: 25.17946, lng: 55.26837 },
  { match: 'dubai islands', lat: 25.318, lng: 55.32627 },
  { match: 'dubai south', lat: 24.91444, lng: 55.16151 },
  { match: 'dubai land', lat: 25.05357, lng: 55.27548 },
  { match: 'downtown', lat: 25.19484, lng: 55.27819 },
  { match: 'meydan', lat: 25.16293, lng: 55.3143 },
  { match: 'al jaddaf', lat: 25.22144, lng: 55.33194 },
  { match: 'motor city', lat: 25.04769, lng: 55.23821 },
  { match: 'maritime city', lat: 25.24963, lng: 55.27616 },
  { match: 'palm jumeirah', lat: 25.1183, lng: 55.13383 },
  { match: 'town square', lat: 24.99997, lng: 55.30084 },
  { match: 'sports city', lat: 25.0387, lng: 55.22438 },
]

export const LIST_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  Meydan: { lat: 25.16293, lng: 55.3143 },
  'Business Bay': { lat: 25.17946, lng: 55.26837 },
  Downtown: { lat: 25.19484, lng: 55.27819 },
  'Creek Harbour': { lat: 25.19798, lng: 55.36038 },
  'Dubai Islands': { lat: 25.318, lng: 55.32627 },
  'Dubai South': { lat: 24.91444, lng: 55.16151 },
  'Dubai Land': { lat: 25.05357, lng: 55.27548 },
  'Production City': { lat: 25.03213, lng: 55.19127 },
  'Mina Rashid': { lat: 25.27111, lng: 55.26593 },
  'Other waterfront': { lat: 25.18501, lng: 55.22349 },
  'Other inland': { lat: 25.06, lng: 55.25 },
}

export interface ProjectAnchor {
  names: string[]
  lat: number
  lng: number
  clusterKey: string
  pinNote: string
}

/**
 * Title matches for cards whose area is a catch-all ("Other waterfront",
 * "Other inland", "Dubai Land") but the project’s published community is known.
 * Coordinates are OpenStreetMap community or named-building points, not plots.
 */
export const PROJECT_ANCHORS: ProjectAnchor[] = [
  {
    names: ['aria grande', 'amali'],
    lat: 25.22788,
    lng: 55.16424,
    clusterKey: 'anchor:the-world',
    pinNote: 'Amali Island, The World. OpenStreetMap community point, not the villa plot.',
  },
  {
    names: ['soulever', 'kanyon', 'aria by beyond'],
    lat: 25.24963,
    lng: 55.27616,
    clusterKey: 'anchor:maritime-city',
    pinNote: 'Dubai Maritime City, where Beyond places this tower. OpenStreetMap community point, not the plot.',
  },
  {
    names: ['hado'],
    lat: 25.318,
    lng: 55.32627,
    clusterKey: 'anchor:dubai-islands',
    pinNote: 'Dubai Islands (Siora). Beyond places Hado here. OpenStreetMap community point, not the plot.',
  },
  {
    names: ['passo bella', 'passo avita'],
    lat: 25.1183,
    lng: 55.13383,
    clusterKey: 'anchor:palm-jumeirah',
    pinNote: 'Palm Jumeirah, where Beyond places Passo. OpenStreetMap community point, not the plot.',
  },
  {
    names: ['starfall'],
    lat: 25.22144,
    lng: 55.33194,
    clusterKey: 'anchor:al-jaddaf',
    pinNote: 'Al Jaddaf, the published Binghatti Starfall community. OpenStreetMap point, not the plot.',
  },
  {
    names: ['serene at sobha central', 'tranquil at sobha central'],
    lat: 25.04458,
    lng: 55.12058,
    clusterKey: 'anchor:sobha-central',
    pinNote:
      'Sobha Central is on Sheikh Zayed Road by Jebel Ali Metro. Pin is Ibn Battuta on that corridor, not Dubailand and not the plot.',
  },
  {
    names: ['sobha solis', 'solis'],
    lat: 25.04769,
    lng: 55.23821,
    clusterKey: 'anchor:motor-city',
    pinNote: 'Motor City, where Sobha places Solis. OpenStreetMap community point, not the plot.',
  },
  {
    names: ['arancia'],
    lat: 25.08897,
    lng: 55.33737,
    clusterKey: 'anchor:city-of-arabia',
    pinNote: 'City of Arabia, where Beyond places Arancia. OpenStreetMap community point, not the plot.',
  },
  {
    names: ['keturah ardh'],
    lat: 25.12576,
    lng: 55.43317,
    clusterKey: 'anchor:rowaiyah',
    pinNote: 'Rowaiyah, where MAG places Keturah Ardh. OpenStreetMap district point, not the plot.',
  },
  {
    names: ['dubai jewel'],
    lat: 25.10229,
    lng: 55.17172,
    clusterKey: 'anchor:dubai-jewel',
    pinNote: 'OpenStreetMap point named Dubai Jewel Tower. Not a guessed nearby community.',
  },
  {
    names: ['town square'],
    lat: 24.99997,
    lng: 55.30084,
    clusterKey: 'anchor:town-square',
    pinNote: 'Town Square. OpenStreetMap community point, not the plot.',
  },
  {
    names: ['dlrc'],
    lat: 25.08536,
    lng: 55.38298,
    clusterKey: 'anchor:dlrc',
    pinNote: 'Dubai Land Residence Complex. OpenStreetMap point inside the complex, not the unit.',
  },
  {
    names: ['address zabeel'],
    lat: 25.20983,
    lng: 55.29797,
    clusterKey: 'anchor:zabeel',
    pinNote: 'Zabeel. OpenStreetMap district point, not the plot.',
  },
  {
    names: ['hadley heights'],
    lat: 25.0387,
    lng: 55.22438,
    clusterKey: 'anchor:sports-city',
    pinNote: 'Dubai Sports City, the published Hadley Heights community. OpenStreetMap point, not the plot.',
  },
]

export function matchProjectAnchor(title: string): ProjectAnchor | undefined {
  const haystack = title.toLowerCase()
  const ranked = [...PROJECT_ANCHORS].sort((a, b) => {
    const longest = (anchor: ProjectAnchor) => Math.max(...anchor.names.map((name) => name.length))
    return longest(b) - longest(a)
  })
  return ranked.find((anchor) => anchor.names.some((name) => haystack.includes(name)))
}
