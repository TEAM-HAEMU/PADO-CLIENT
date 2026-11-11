import { josa } from '@/utils/josa';

describe('josa', () => {
  it('한글 받침', () => {
    expect(josa('라일락', '을', '를')).toBe('을');
    expect(josa('밤편지', '을', '를')).toBe('를');
  });
  it('영문은 끝소리로 어림', () => {
    expect(josa('Hype Boy', '을', '를')).toBe('를');
    expect(josa('Ditto', '을', '를')).toBe('를');
    expect(josa('Blueming', '을', '를')).toBe('을');
    expect(josa('Black', '을', '를')).toBe('을');
  });
  it('숫자·따옴표', () => {
    expect(josa('Track 3', '을', '를')).toBe('을');
    expect(josa('Day 2', '을', '를')).toBe('를');
    expect(josa("'산책 플리'", '을', '를')).toBe('를');
  });
});
