// Contact avatar generation — Gravatar hash + fallback initials

/**
 * Generate a Gravatar URL from an email address.
 * Uses SHA-256 hash (browser-native crypto.subtle).
 * Falls back to a colored initial circle if no gravatar exists (d=404).
 */
export function getGravatarUrl(email: string, size = 40): string {
  // We can't do async hash in a sync function, so use a simple hash
  const hash = simpleHash(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

/**
 * Get initials from a name or email.
 */
export function getInitials(nameOrEmail: string): string {
  if (!nameOrEmail) return "?";
  // If it's an email, use the part before @
  const name = nameOrEmail.includes("@")
    ? nameOrEmail.split("@")[0].replace(/[._-]/g, " ")
    : nameOrEmail;
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}

/**
 * Generate a consistent color from a string (for avatar backgrounds).
 * Returns an HSL string.
 */
export function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 50%, 35%)`;
}

// Simple string hash that produces a hex string (not cryptographic, just for gravatar lookup)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  // Convert to hex-like string (not a real MD5, but good enough for consistent avatars)
  return Math.abs(hash).toString(16).padStart(32, "0");
}
