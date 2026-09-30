/** 5.2 프로필 편집 — PATCH /users (+ PUT /users/profile-image) */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { userApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { Field, formatBirth, GenderSelect, validBirth } from '@/components/ui/Field';
import { Avatar, Icon, IconButton, Press, T } from '@/components/ui';
import { qk, useMe } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors, glow } from '@/theme/tokens';

export default function ProfileEditScreen({ navigation }: RootScreen<'ProfileEdit'>) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useMe().data;
  const [username, setUsername] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<boolean | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string | null>>({});

  // 처음 한 번만 서버 값으로 채운다 — 사진 업로드 후 재조회가 입력 중인 값을 덮어쓰지 않게
  const inited = React.useRef(false);
  useEffect(() => { if (me && !inited.current) { inited.current = true; setUsername(me.username); setBirth(me.birth ?? ''); setGender(me.gender); } }, [me]);

  const pick = async () => {
    const r = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, maxWidth: 800, maxHeight: 800, quality: 0.8 });
    const a = r.assets?.[0];
    if (!a?.uri) return;
    try {
      const res = await userApi.uploadProfileImage(a.uri, a.type ?? 'image/jpeg', a.fileName ?? 'profile.jpg');
      setImage(res.profileImageUrl);
      qc.invalidateQueries({ queryKey: qk.me });
    } catch (e) { toast(errorMessage(e), 'error'); }
  };

  const save = async () => {
    if (busy || !me) return; // 내 정보를 불러오기 전엔 저장하지 않는다
    const e = { username: username.trim().length >= 1 && username.trim().length <= 15 ? null : '닉네임은 1~15자예요.', birth: birth ? validBirth(birth, 'edit') : null };
    setErr(e);
    if (Object.values(e).some(Boolean) || !me) return;
    const body: Record<string, unknown> = {};
    if (username.trim() !== me.username) body.username = username.trim();
    if (birth && birth !== me.birth) body.birthDate = birth;
    if (gender !== null && gender !== me.gender) body.gender = gender;
    if (!Object.keys(body).length) return navigation.goBack();
    setBusy(true);
    try {
      try {
        await userApi.update(body);
      } catch (ex) {
        // 닉네임 변경만 제한된 경우(U21): 닉네임을 빼고 나머지는 저장
        if ((ex as { code?: string }).code !== 'U21' || !('username' in body)) throw ex;
        const rest = { ...body };
        delete rest.username;
        if (Object.keys(rest).length) await userApi.update(rest);
        qc.invalidateQueries({ queryKey: qk.me });
        toast(`${errorMessage(ex)}${Object.keys(rest).length ? '\n다른 정보는 저장했어요.' : ''}`, 'error');
        setUsername(me.username);
        return;
      }
      qc.invalidateQueries({ queryKey: qk.me });
      toast('저장했어요.', 'success');
      navigation.goBack();
    } catch (ex) { toast(errorMessage(ex), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
        <IconButton name="chevronLeft" onPress={navigation.goBack} accessibilityLabel="뒤로" />
        <T v="headline">프로필 편집</T>
        <Press onPress={save} disabled={busy || !me} style={[{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.primary, opacity: me ? 1 : 0.4 }, me ? glow(0.4, 12) : {}]}>
          <T v="captionStrong" c="onPrimary">{busy ? '저장 중' : '저장'}</T>
        </Press>
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 18 }} keyboardShouldPersistTaps="handled">
        <Press onPress={pick} style={{ alignSelf: 'center', marginBottom: 8 }} accessibilityLabel="프로필 사진 변경">
          <Avatar uri={image ?? me?.profileImageUrl} name={username} size={104} />
          <View style={{ position: 'absolute', right: 0, bottom: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera" size={16} color={colors.onPrimary} />
          </View>
        </Press>
        <Field label="닉네임" value={username} onChangeText={t => setUsername(t.slice(0, 15))} help="지도와 드랍에 표시되는 이름이에요" error={err.username} right={<T v="number" c="ink3">{username.length}/15</T>} />
        <Field label="생년월일" value={birth} onChangeText={t => setBirth(formatBirth(t))} keyboardType="number-pad" placeholder="YYYY-MM-DD" error={err.birth} />
        <GenderSelect value={gender} onChange={setGender} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
