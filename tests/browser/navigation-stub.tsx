export function useRouter() {
  return {
    refresh() {},
    push(path: string) {
      window.location.href = path;
    },
  };
}
export function usePathname() {
  return window.location.pathname;
}
