#!/usr/bin/env node
/**
 * Jest is intended to run inside the dev/test container (Podman), not on the host.
 * The compose `test` service sets NEON_BUMPER_TESTS_IN_CONTAINER=1.
 */
if (process.env.NEON_BUMPER_TESTS_IN_CONTAINER !== "1") {
  console.error(
    "Tests run only inside Podman (no host Node/Jest required).\n" +
      "  podman compose --profile test run --rm test\n" +
      "See README.md → Tests."
  );
  process.exit(1);
}
