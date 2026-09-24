import { createRequire } from "node:module";

// Read at runtime from this package's own package.json, which ships in every
// npm tarball and is copied into the Docker image next to dist/. The version
// the server reports can then never drift from the one being published: it
// was hardcoded "0.1.0" in index.ts through the whole 0.1.1 release (dev-02).
export const VERSION: string = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
