// Tiny className joiner: drops falsy values and joins with spaces.
// Lets components compose conditional classes without a dependency.
export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}
