import "@testing-library/jest-dom";

// Radix UI components call scrollIntoView on mount; jsdom doesn't implement it
window.HTMLElement.prototype.scrollIntoView = () => {};
