const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{6,32}$/;

export type YoutubeResourceCheck = {
  valid: boolean;
  id: string;
  title?: string;
  authorName?: string;
  thumbnailUrl?: string;
  reason?: string;
};

export function normalizeYoutubeVideoId(value: unknown): string | null {
  const id = String(value || '').trim();
  return YOUTUBE_VIDEO_ID.test(id) ? id : null;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

export async function verifyYoutubeResource(
  rawId: unknown,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<YoutubeResourceCheck> {
  const id = normalizeYoutubeVideoId(rawId);
  if (!id) return { valid: false, id: '', reason: 'invalid_video_id' };

  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', youtubeWatchUrl(id));
  endpoint.searchParams.set('format', 'json');

  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Quantora/1.0 resource-verifier',
      },
      signal,
    });

    if (!response.ok) {
      return {
        valid: false,
        id,
        reason: response.status === 401 || response.status === 403 || response.status === 404
          ? 'unavailable'
          : `youtube_${response.status}`,
      };
    }

    const data: any = await response.json().catch(() => null);
    if (!data || typeof data.title !== 'string' || !data.title.trim()) {
      return { valid: false, id, reason: 'invalid_oembed_response' };
    }

    return {
      valid: true,
      id,
      title: data.title.trim(),
      authorName: typeof data.author_name === 'string' ? data.author_name.trim() : undefined,
      thumbnailUrl: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : undefined,
    };
  } catch (error: any) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      return { valid: false, id, reason: 'verification_timeout' };
    }
    return { valid: false, id, reason: 'verification_failed' };
  }
}
