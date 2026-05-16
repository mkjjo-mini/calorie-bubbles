import "@testing-library/jest-dom/vitest";

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
