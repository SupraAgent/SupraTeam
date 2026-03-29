// Contact avatar generation — Gravatar hash + fallback initials

/**
 * Generate a Gravatar-style avatar URL.
 * Gravatar requires MD5 which isn't available synchronously in the browser,
 * so we use the DiceBear API with a deterministic seed from the email.
 * Returns a consistent avatar for any email — no 404s, no broken hashes.
 */
export function getGravatarUrl(email: string, size = 40): string {
  const seed = encodeURIComponent(email.trim().toLowerCase());
  return `https://api.dicebear.com/9.x/initials/svg?seed=${seed}&size=${size}&backgroundColor=0f172a&textColor=94a3b8`;
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

