import { candidateUrls } from '@/services/musicLinks';

const song = { title: '난춘', artist: '새소년' };
const q = encodeURIComponent('난춘 새소년');

test('Spotify — 트랙 링크가 있으면 앱 스킴 → 웹 순서', () => {
  const links = { spotify: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x', youtubeMusic: null };
  expect(candidateUrls('spotify', { ...song, links } as never)).toEqual([
    'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  ]);
});

test('Spotify — 링크가 없으면 검색', () => {
  expect(candidateUrls('spotify', song)).toEqual([`spotify:search:${q}`, `https://open.spotify.com/search/${q}`]);
});

test('YouTube Music — 영상 ID가 있으면 앱 → youtube.com 폴백', () => {
  const links = { spotify: null, youtubeMusic: 'https://music.youtube.com/watch?v=abc123XYZ' };
  expect(candidateUrls('youtubeMusic', { ...song, links } as never)).toEqual([
    'youtubemusic://watch?v=abc123XYZ',
    'https://www.youtube.com/watch?v=abc123XYZ',
  ]);
});

test('Apple Music — iTunes 링크를 music: 스킴으로도 시도, 없으면 검색', () => {
  const url = 'https://music.apple.com/kr/album/x/123?i=456';
  expect(candidateUrls('appleMusic', song, url)).toEqual([url.replace('https:', 'music:'), url]);
  expect(candidateUrls('appleMusic', song, null)).toEqual([`https://music.apple.com/search?term=${q}`]);
});
