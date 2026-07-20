import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Adda247 calls use a dedicated route without changing existing agents", async () => {
  const route = await readFile(
    new URL("../app/api/vobiz/adda247-answer/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(route, /searchParams\.set\("scenario",\s*"adda247"\)/);
  assert.doesNotMatch(route, /Pearl Dental|scenario",\s*"dental"/);
});
