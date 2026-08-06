'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { addFavoriteSong, favoriteQueryKeys, removeFavoriteSong } from '@/entities/favorite';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { showToast } from '@/shared/model/toastStore';

import { patchFavoriteCaches } from './patchFavoriteCaches';

/** 연속 클릭을 한 번의 최종 상태로 묶는다. */
const FAVORITE_DEBOUNCE_MS = 400;

interface UseFavoriteToggleResult {
  favorite: boolean;
  toggle: () => void;
}

interface FavoriteSyncBag {
  confirmed: boolean;
  favorite: boolean;
  inFlight: boolean;
  songId: number;
  timer: number | null;
}

async function syncFavorite(songId: number, desired: boolean): Promise<void> {
  if (desired) {
    await addFavoriteSong(songId);
    return;
  }
  await removeFavoriteSong(songId);
}

/**
 * 찜 토글: UI는 즉시 반영하고, API는 debounce 후 최종 상태만 동기화한다.
 * 비행 중 다시 바뀌면 응답 후 한 번 더 flush한다.
 *
 * react-hooks/refs: 렌더 중에는 ref.current를 읽거나 쓰지 않는다.
 * react-hooks/set-state-in-effect: 곡 전환 시 state 리셋은 렌더 단계 패턴을 쓴다.
 */
export function useFavoriteToggle(songId: number, initialFavorite: boolean): UseFavoriteToggleResult {
  const queryClient = useQueryClient();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [trackedSongId, setTrackedSongId] = useState(songId);

  const bagRef = useRef<FavoriteSyncBag>({
    confirmed: initialFavorite,
    favorite: initialFavorite,
    inFlight: false,
    songId,
    timer: null,
  });

  // props로 곡이 바뀌면 렌더 단계에서 state를 맞춘다 (effect 안 setState 금지 대응).
  if (songId !== trackedSongId) {
    setTrackedSongId(songId);
    setFavorite(initialFavorite);
  }

  function clearTimer() {
    const bag = bagRef.current;
    if (bag.timer === null) return;
    window.clearTimeout(bag.timer);
    bag.timer = null;
  }

  async function flush() {
    const bag = bagRef.current;
    const id = bag.songId;
    const desired = bag.favorite;

    if (desired === bag.confirmed || bag.inFlight) return;

    bag.inFlight = true;

    try {
      await syncFavorite(id, desired);
      if (bagRef.current.songId === id) {
        bagRef.current.confirmed = desired;
      }
      void queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.all });
    } catch (error) {
      if (bagRef.current.songId === id) {
        const rollback = bagRef.current.confirmed;
        bagRef.current.favorite = rollback;
        setFavorite(rollback);
        patchFavoriteCaches(queryClient, id, rollback);
      }
      showToast(getApiErrorMessage(error, '찜 설정을 바꾸지 못했어요.'), 'error');
    } finally {
      const current = bagRef.current;
      current.inFlight = false;
      if (current.songId === id && current.favorite !== current.confirmed) {
        current.timer = window.setTimeout(() => {
          current.timer = null;
          void flush();
        }, FAVORITE_DEBOUNCE_MS);
      }
    }
  }

  function scheduleFlush() {
    clearTimer();
    const bag = bagRef.current;
    bag.timer = window.setTimeout(() => {
      bag.timer = null;
      void flush();
    }, FAVORITE_DEBOUNCE_MS);
  }

  // 곡 전환/언마운트 시에만 미동기화분을 보내고 bag을 새 곡 기준으로 맞춘다.
  useEffect(() => {
    const bag = bagRef.current;
    bag.songId = songId;
    bag.confirmed = initialFavorite;
    bag.favorite = initialFavorite;

    return () => {
      clearTimer();
      const desired = bag.favorite;
      const confirmed = bag.confirmed;
      if (desired === confirmed || bag.inFlight) return;
      void syncFavorite(songId, desired).catch(() => {
        // 전환/언마운트 실패는 다음 조회 시 서버 상태로 복구된다.
      });
    };
    // initialFavorite는 곡 진입 시점 스냅샷만 사용한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- songId 변경 시에만 리셋
  }, [songId]);

  function toggle() {
    const bag = bagRef.current;
    const next = !bag.favorite;
    bag.favorite = next;
    bag.songId = songId;
    setFavorite(next);
    patchFavoriteCaches(queryClient, songId, next);
    scheduleFlush();
  }

  return { favorite, toggle };
}
