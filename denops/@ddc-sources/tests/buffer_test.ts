import { assert, assertEquals } from "jsr:@std/assert@1.0.5";
import { allWords, getFileSize } from "../buffer.ts";

Deno.test("getFileSize", async () => {
  assert(await getFileSize("./README.md") > 0);
  assert(await getFileSize("./non-exists") == -1);
});

Deno.test("allWords", () => {
  const pattern = "\\w+";
  assertEquals(allWords([], pattern), []);
  assertEquals(allWords(["_w2er"], pattern), ["_w2er"]);
  assertEquals(allWords(["asdf _w2er", "223r wawer"], pattern), [
    "asdf",
    "_w2er",
    "223r",
    "wawer",
  ]);
});
