import { activeDocument } from 'obsidian';

export function getCalendarColors(color: string | null | undefined): {
  color: string;
  textColor: string;
} {
  const bodyEl = activeDocument?.body;

  if (!bodyEl) {
    return {
      color: color || 'var(--interactive-accent)',
      textColor: 'var(--text-on-accent)'
    };
  }

  const styles = getComputedStyle(bodyEl);
  let textVar = styles.getPropertyValue('--text-on-accent').trim() || 'var(--text-on-accent)';
  if (color) {
    const m = color.slice(1).match(color.length === 7 ? /(\S{2})/g : /(\S{1})/g);
    if (m) {
      const r = parseInt(m[0], 16),
        g = parseInt(m[1], 16),
        b = parseInt(m[2], 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness > 150) {
        textVar = 'black';
      }
    }
  }

  return {
    color:
      color ||
      styles.getPropertyValue('--interactive-accent').trim() ||
      'var(--interactive-accent)',
    textColor: textVar
  };
}
