// Vitest runs outside Next's react-server condition, where the real `server-only`
// package throws on import. Tests alias it to this empty module (vitest.config.mts).
export {};
