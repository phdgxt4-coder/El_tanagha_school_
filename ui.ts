export function button(label: string, className = 'btn') {
  return `<button class="${className}" type="submit">${label}</button>`;
}

export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}
