/** Join class names, skipping falsy values. */
export const cn = (...parts) => parts.flat().filter(Boolean).join(' ');
