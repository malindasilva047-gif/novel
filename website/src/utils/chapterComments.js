function paragraphIndex(comment) {
  const value = comment?.paragraph_index;
  if (value === null || value === undefined || value === "") return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

export function filterChapterComments(comments) {
  return comments.filter((comment) => paragraphIndex(comment) === null);
}

export function filterParagraphComments(comments, targetIndex) {
  return comments.filter((comment) => paragraphIndex(comment) === targetIndex);
}
