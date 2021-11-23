import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.115.1/testing/asserts.ts#^";
import { allWords, getFileSize } from "../buffer.ts";

Deno.test("getFileSize", async () => {
  assert(await getFileSize("./README.md") > 0);
  assert(await getFileSize("./non-exists") == -1);
});

Deno.test("allWords", () => {
  assertEquals(allWords([]), []);
  assertEquals(allWords(["_w2er"]), ["_w2er"]);
  assertEquals(allWords(["asdf _w2er", "223r wawer"]), [
    "asdf",
    "_w2er",
    "223r",
    "wawer",
  ]);
});
