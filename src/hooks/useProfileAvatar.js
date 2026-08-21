import { useCallback, useEffect, useMemo, useState } from 'react';

export const PROFILE_AVATAR_KEY = 'quantora_profile_avatar_v1';
export const PROFILE_AVATAR_EVENT = 'quantora:profile-avatar-changed';

export function readStoredProfileAvatar() {
  if (typeof window === 'undefined') return '';
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROFILE_AVATAR_KEY) || 'null');
    return typeof parsed?.src === 'string' && parsed.src.startsWith('data:image/') ? parsed.src : '';
  } catch {
    return '';
  }
}

function publish(src) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PROFILE_AVATAR_EVENT, { detail: { src } }));
}

export function saveProfileAvatar(src) {
  if (typeof window === 'undefined') return;
  if (typeof src !== 'string' || !src.startsWith('data:image/')) {
    throw new Error('Profile picture must be an image.');
  }
  window.localStorage.setItem(PROFILE_AVATAR_KEY, JSON.stringify({ src, updatedAt: Date.now() }));
  publish(src);
}

export function clearProfileAvatar() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PROFILE_AVATAR_KEY);
  publish('');
}

export function useProfileAvatar(user) {
  const [customAvatar, setCustomAvatarState] = useState(() => readStoredProfileAvatar());
  const providerAvatar = user?.avatar || user?.picture || '';

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onChanged = (event) => setCustomAvatarState(event?.detail?.src || readStoredProfileAvatar());
    const onStorage = (event) => {
      if (event.key === PROFILE_AVATAR_KEY) setCustomAvatarState(readStoredProfileAvatar());
    };
    window.addEventListener(PROFILE_AVATAR_EVENT, onChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PROFILE_AVATAR_EVENT, onChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setCustomAvatar = useCallback((src) => saveProfileAvatar(src), []);
  const resetAvatar = useCallback(() => clearProfileAvatar(), []);
  const avatarSrc = useMemo(() => customAvatar || providerAvatar || '', [customAvatar, providerAvatar]);

  return { avatarSrc, customAvatar, setCustomAvatar, resetAvatar };
}
