import "@testing-library/jest-dom/vitest";

// Node v25 ships a native `localStorage` global that lacks .clear()/.key().
// Vitest's jsdom environment does not override it because jsdom defines
// localStorage as a prototype getter (not an own property), so populateGlobal
// skips it. We install a proper Map-backed Storage shim so tests can call
// localStorage.clear(), localStorage.setItem(), etc.
if (typeof window !== "undefined" && typeof (global as any).localStorage?.clear !== "function") {
  const store: Record<string, string> = {};
  const localStorageShim = {
    getItem: (key: string) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() { return Object.keys(store).length; },
  };
  Object.defineProperty(global, "localStorage", {
    configurable: true,
    enumerable: true,
    get: () => localStorageShim,
  });
}

// jsdom does not implement matchMedia / IntersectionObserver, which some
// shadcn/ui components touch on mount. We stub the minimum surface needed
// by the components we render in tests (MealLogList does not need either,
// but adding the stubs preempts noisy errors if future tests render more).
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  // dnd-kit and framer-motion sometimes probe these — provide a noop.
  if (!("PointerEvent" in window)) {
    // jsdom 21+ ships PointerEvent; older versions fall back here.
    // @ts-expect-error — minimal shim
    window.PointerEvent = window.MouseEvent;
  }
}
