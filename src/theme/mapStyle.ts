/**
 * Google Maps 커스텀 스타일 — J 스카이 퓨어 (흰 땅 · 옅은 하늘빛 물 · 흰 도로, Figma '7 화이트 오션 시안' J 지도).
 * 땅 #F8FBFF · 농지/녹지 #F1F6FD · 강 #D3E6FD · 도로 #FFFFFF(테두리 #E3EDF9)→간선 #E3EEFD · 라벨 #7D8BA8
 */
export const googleMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#F8FBFF' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7D8BA8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#56688A' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#8592AD' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F4F8FE' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#F1F6FD' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#EAF4F4' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E3EDF9' }] },
  { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#E3EEFD' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#C9DDF9' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#5A7FC0' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D3E6FD' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4F97F2' }] },
];
