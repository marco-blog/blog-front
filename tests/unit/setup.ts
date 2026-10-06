import "@testing-library/jest-dom/vitest";

// jsdom에는 scrollTo가 없다(ScrollRestoration이 부른다).
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}
