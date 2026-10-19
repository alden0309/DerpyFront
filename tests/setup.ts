// Add global mocks or configuration here if needed
import "vitest-canvas-mock";
// Registers the per-test DOM teardown. Imported here, and not from individual
// test files, so its hooks are registered before any test file's own -- see the
// hook-order note in that file.
import "./domTeardown";

// ServerEnv.gitCommit() throws when unset; the dev server sets GIT_COMMIT=DEV,
// so tests exercising server code (e.g. the lobby feed) mirror that.
process.env.GIT_COMMIT ??= "DEV";

// CHAL (r25): weekly challenges pay on top of a game's own coins, and which
// ones a game meets depends on the week the suite happens to run in. Tests
// that aren't about them see only a game's own coins; the challenge tests
// turn them on (DERPY_CHALLENGES=on).
process.env.DERPY_CHALLENGES ??= "off";
