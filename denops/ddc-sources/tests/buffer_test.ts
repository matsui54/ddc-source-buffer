import {
  assertEquals
} from "https://deno.land/std@0.106.0/testing/asserts.ts#^";
import { allWords, splitPages } from "../buffer.ts";

Deno.test("pages", () => {
  assertEquals(Array.from(splitPages(1, 600, 500)), [[1, 500], [501, 1000]]);
  assertEquals(Array.from(splitPages(1, 1, 500)), [[1, 500]]);
  assertEquals(Array.from(splitPages(1, 500, 500)), [[1, 500]]);
  assertEquals(Array.from(splitPages(1, 501, 500)), [[1, 500], [501, 1000]]);
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
