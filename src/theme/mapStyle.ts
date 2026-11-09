/**
 * Google Maps 커스텀 스타일 — 새 디자인 '2 지도 · 재생'의 하늘빛 지도 (Figma B/Map: 옅은 하늘 땅 · 파란 선 도로 · 진한 하늘 강).
 * 땅 #D9EFF8 · 녹지 #CDE9F3 · 물 #9ED3E6 · 도로 선 #84C9E0(간선 #7FC6DF, 고속 #67BAD9) · 라벨 #2497CA
 * iOS에서 Google 키가 없으면 Apple 지도(mutedStandard)에 하늘빛 막을 덧씌워 비슷한 톤으로 맞춘다 (MapHomeScreen).
 */
export const googleMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#D9EFF8' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#2497CA' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#E3F8FF' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#1992C7' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#2D9CCC' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#D4ECF6' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#CFEAF4' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#C6E6F1' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#A8D6E6' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#AFD9E7' }] },
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#84C9E0' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#7FC6DF' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ visibility: 'on' }, { color: '#67BAD9' }, { weight: 0.6 }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#0662A2' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#9ED3E6' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#0662A2' }] },
];
