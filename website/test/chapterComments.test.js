import assert from "node:assert/strict";
import test from "node:test";

import {
  filterChapterComments,
  filterParagraphComments,
} from "../src/utils/chapterComments.js";

const comments = [
  { id: 1, paragraph_index: -1, body: "Chapter-level comment" },
  { id: 2, paragraph_index: null, body: "Legacy chapter-level comment" },
  { id: 3, paragraph_index: 0, body: "Paragraph one comment" },
  { id: 4, paragraph_index: "1", body: "Paragraph two comment" },
  { id: 5, body: "Missing index is chapter-level" },
];

test("chapter comment list excludes all paragraph comments", () => {
  assert.deepEqual(
    filterChapterComments(comments).map(({ id }) => id),
    [1, 2, 5],
  );
});

test("paragraph comment lists exclude chapter comments, including null indexes", () => {
  assert.deepEqual(
    filterParagraphComments(comments, 0).map(({ id }) => id),
    [3],
  );
  assert.deepEqual(
    filterParagraphComments(comments, 1).map(({ id }) => id),
    [4],
  );
});
