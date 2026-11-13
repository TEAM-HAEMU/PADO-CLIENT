/**
 * 드랍 공유 — 카드(C 지도 / E 해달 / H 물결)를 고르고 인스타 스토리에 바로 올리거나 다른 앱으로 보낸다.
 * 카드는 1080×1920 이미지로 찍어 보낸다. 인스타가 없거나 실패하면 같은 이미지를 시스템 공유 시트로.
 * 찍는 건 화면 밖에 실제 크기로 그린 카드 — 화면 미리보기를 찍어 늘리면 안드로이드에서 글자가 뭉개진다.
 */
import React, { useRef, useState } from 'react';
import { Linking, PixelRatio, Platform, View } from 'react-native';
import Share, { Social } from 'react-native-share';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CARD_EDGE, StoryCard, type CardStyle } from '@/components/share/StoryCard';
import { Press, PrimaryButton, SecondaryButton, TopBar } from '@/components/ui';
import type { RootScreen } from '@/navigation/types';
import { FB_APP_ID } from '@/config';
import { track } from '@/services/analytics';
import { kv } from '@/store/storage';
import { toast } from '@/store/toast';
import { colors } from '@/theme/tokens';

const STYLES: { id: CardStyle; label: string }[] = [
  { id: 'C', label: '지도 위 핀' },
  { id: 'E', label: '해달이 건네는 노래' },
  { id: 'H', label: '물 위에 뜬 노래' },
];
const THUMB = 54;
/** 1080px 폭을 dp로 — 이 크기로 그려 두면 늘리지 않고 그대로 1080×1920이 찍힌다 */
const SHOT_W = 1080 / PixelRatio.get();

async function instagramInstalled() {
  try {
    if (Platform.OS === 'ios') return await Linking.canOpenURL('instagram-stories://share');
    return (await Share.isPackageInstalled('com.instagram.android')).isInstalled;
  } catch { return false; }
}

export default function ShareCardScreen({ navigation, route }: RootScreen<'ShareCard'>) {
  const insets = useSafeAreaInsets();
  const data = route.params;
  const [variant, setVariant] = useState<CardStyle>(() => kv.get<CardStyle>('shareCard', 'C'));
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState<'story' | 'other' | null>(null);
  const shot = useRef<React.ComponentRef<typeof View>>(null);
  const ready = useRef(false);

  const pick = (v: CardStyle) => { setVariant(v); kv.set('shareCard', v); };
  // 화면에 맞는 가장 큰 9:16
  const cardW = Math.floor(Math.min(box.w - 48, (box.h - 16) * (9 / 16)));

  const capture = async () => {
    for (let i = 0; i < 30 && !ready.current; i++) await new Promise<void>(r => setTimeout(() => r(), 100)); // 앨범 아트를 기다린다 (최대 3초)
    // 크기를 넘기지 않는다 — 넘기면 찍은 뒤 늘려서 흐려진다. PNG로 한 번 덜 압축한다 (인스타가 어차피 다시 압축)
    return captureRef(shot, { format: 'png', result: 'tmpfile', fileName: 'pado-drop' });
  };

  const toOthers = async (uri?: string) => {
    const file = uri ?? await capture();
    // 사진만 보낸다 — 글을 붙이면 받는 앱에 따라 사진과 따로 가거나 사진이 빠진다
    await Share.open({ url: file, type: 'image/png', failOnCancel: false });
  };

  const run = async (kind: 'story' | 'other') => {
    if (busy) return;
    setBusy(kind);
    track('share_card', { target: kind, style: variant });
    try {
      if (kind === 'other') return await toOthers();
      const uri = await capture();
      if (!(await instagramInstalled())) {
        toast('인스타그램이 없어서 다른 앱으로 보낼게요.');
        return await toOthers(uri);
      }
      const [top, bottom] = CARD_EDGE[variant];
      await Share.shareSingle({ social: Social.InstagramStories, appId: FB_APP_ID, backgroundImage: uri, backgroundTopColor: top, backgroundBottomColor: bottom });
    } catch (e) {
      // 사용자가 닫은 경우는 조용히
      if (!String((e as Error)?.message ?? e).includes('User did not share')) toast('공유하지 못했어요. 다시 시도해주세요.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <TopBar title="공유하기" left="close" onBack={navigation.goBack} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {cardW > 0 ? (
          <View style={{ borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
            <StoryCard key={variant} data={data} variant={variant} width={cardW} />
          </View>
        ) : null}
      </View>
      {/* 캡처용 — 화면 밖에 실제 크기(1080px 폭)로 그린다 */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -SHOT_W * 2, top: 0 }}>
        <View ref={shot} collapsable={false}>
          <StoryCard key={variant} data={data} variant={variant} width={SHOT_W} onReady={() => { ready.current = true; }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 18 }}>
        {STYLES.map(s => {
          const on = s.id === variant;
          return (
            <Press key={s.id} accessibilityLabel={s.label} accessibilityState={{ selected: on }} onPress={() => { ready.current = false; pick(s.id); }}
              style={{ borderRadius: 10, borderWidth: 2, borderColor: on ? colors.primary : 'transparent', padding: 2 }}>
              <View pointerEvents="none" style={{ borderRadius: 7, overflow: 'hidden' }}>
                <StoryCard data={data} variant={s.id} width={THUMB} />
              </View>
            </Press>
          );
        })}
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16, gap: 10 }}>
        <PrimaryButton label="인스타 스토리에 올리기" loading={busy === 'story'} onPress={() => run('story')} />
        <SecondaryButton label="다른 앱으로 보내기" loading={busy === 'other'} onPress={() => run('other')} />
      </View>
    </View>
  );
}
