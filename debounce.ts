export function debounce<T extends (...args: never[]) => void>(fn: T, wait = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: Parameters<T>) => { if (timer) clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  wrapped.cancel = () => { if (timer) clearTimeout(timer); };
  return wrapped;
}
