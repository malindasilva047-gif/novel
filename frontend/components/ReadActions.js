"use client";

import { useEffect, useState } from "react";
import { apiRequest, readToken } from "@/lib/api";

export default function ReadActions({ storyId, authorId }) {
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState([]);
  const [message, setMessage] = useState("Like, bookmark, comment, and follow the writer.");

  useEffect(() => {
    async function loadComments() {
      try {
        const data = await apiRequest(`/engagement/stories/${storyId}/comments`);
        setComments(data || []);
      } catch {
        setComments([]);
      }
    }

    async function addHistory() {
      try {
        const token = readToken();
        if (!token) {
          return;
        }
        await apiRequest("/reader/history", {
          method: "POST",
          token,
          body: { story_id: storyId, progress_pct: 10 }
        });
      } catch {
        // Ignore history write errors for anonymous readers.
      }
    }

    loadComments();
    addHistory();
  }, [storyId]);

  async function doAuthedCall(path, method = "POST", body = undefined) {
    const token = readToken();
    if (!token) {
      setMessage("Sign in to perform this action.");
      return;
    }
    try {
      const data = await apiRequest(path, { method, body, token });
      setMessage(data.message || "Action completed.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!comment.trim()) {
      return;
    }
    const token = readToken();
    if (!token) {
      setMessage("Sign in to comment.");
      return;
    }
    try {
      await apiRequest(`/engagement/stories/${storyId}/comments`, {
        method: "POST",
        token,
        body: { content: comment.trim() }
      });
      setComment("");
      const latest = await apiRequest(`/engagement/stories/${storyId}/comments`);
      setComments(latest || []);
      setMessage("Comment added.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="api-panel">
      <h2>Reader Actions</h2>
      <p className="panel-msg">{message}</p>

      <div className="card-actions">
        <button className="cta ghost small" onClick={() => doAuthedCall(`/engagement/stories/${storyId}/like`)}>Like / React</button>
        <button className="cta ghost small" onClick={() => doAuthedCall(`/reader/bookmarks/${storyId}`)}>Bookmark</button>
        <button className="cta ghost small" onClick={() => doAuthedCall(`/users/${authorId}/follow`)}>Follow Writer</button>
      </div>

      <form className="mini-form" onSubmit={submitComment}>
        <h3>Comments</h3>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment" minLength={2} maxLength={1000} required />
        <button className="cta primary" type="submit">Post Comment</button>
      </form>

      <div className="chapter-list">
        {comments.map((item) => (
          <article key={item.id} className="chapter-card">
            <h3>{item.user_id}</h3>
            <p>{item.content}</p>
          </article>
        ))}
        {!comments.length && <p className="token-state">No comments yet.</p>}
      </div>
    </section>
  );
}
