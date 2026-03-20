export function getAvatarUrl(seed: string, size: number = 180): string {
  return `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(seed)}&size=${size}&backgroundColor=1a1a2e`;
}
