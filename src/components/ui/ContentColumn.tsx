/**
 * 넓은 화면(펼친 폴드 · 태블릿)에서 내용만 가운데 최대 폭으로 — QA 2026-11-20 Z-07 (계산은 utils/contentColumn)
 *  · 바깥(배경색 · 파도)은 지금처럼 화면 전체, 안쪽 내용만 CONTENT_MAX_WIDTH(600)까지
 *  · 창 폭이 그 이하(모든 폰 · iPhone)면 아무것도 바뀌지 않는다 — 열 폭 = 부모 폭, 여백 0
 *
 * 쓰는 법
 *  · 스크롤 목록(ScrollView · FlatList · SectionList): 목록 자체는 화면 전체에 두고 contentContainerStyle의 좌우 여백에 gutter를 더한다
 *    → 가장자리에서 밀어도 스크롤되고, 스크롤 안에 깔린 파도(절대 위치)는 여전히 화면 전체에 그려진다
 *  · 고정 블록(버튼 줄 · 폼): <ContentColumn>으로 감싼다
 *  · 폭으로 크기를 계산하던 화면: useWindowDimensions 대신 useContentColumn().width
 *  · 맨 위 뒤로 줄(TopBar)은 화면 전체 그대로 — 시스템 내비게이션 줄처럼 뒤로 버튼이 화면 가장자리에 있는 게 자연스럽다
 */
import React from 'react';
import { useWindowDimensions, View, type ViewProps, type ViewStyle } from 'react-native';
import { CONTENT_MAX_WIDTH, contentColumn } from '@/utils/contentColumn';

export { CONTENT_MAX_WIDTH };

/** 열 모양 — 부모 폭(최대 600)을 다 쓰고 가운데. 좁은 화면에선 늘이기(stretch)와 같은 결과 */
export const contentColumnStyle: ViewStyle = { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' };

/** 지금 창에서 내용 폭과 양옆 여백 (좁은 화면이면 { width: 창 폭, gutter: 0 }) */
export function useContentColumn() {
  const { width } = useWindowDimensions();
  return contentColumn(width);
}

export function ContentColumn({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[contentColumnStyle, style]} />;
}
