import { rmSync } from "node:fs";
// Remove only generated output, including artifacts from moved or deleted sources.
rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
