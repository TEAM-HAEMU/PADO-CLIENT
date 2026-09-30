import { AppState } from 'react-native';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
  },
});

// RN에는 window focus가 없어서 AppState로 연결 — 백그라운드에선 주기 갱신을 멈추고, 돌아오면 다시 받아온다
focusManager.setEventListener(handleFocus => {
  const sub = AppState.addEventListener('change', state => handleFocus(state === 'active'));
  return () => sub.remove();
});
