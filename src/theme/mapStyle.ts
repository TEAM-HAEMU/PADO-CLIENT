/**
 * Google Maps 커스텀 스타일 — Figma "B/Map · 실제 지도"(OSM 기반 커스텀) 팔레트.
 * 땅 #040916 · 농지/녹지 #071126 · 강 #081A40 · 도로 #0E1A3F→간선 #1F3A82 · 라벨 #4C5B85
 */
export const googleMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#040916' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5A6A9A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#040916' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#8D9BC4' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#56648E' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#08112A' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#071126' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#061621' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#12214A' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#0E1A3F' }] },
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#17295C' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#1F3A82' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#6F86C9' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#081A40' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3E7CC8' }] },
];
