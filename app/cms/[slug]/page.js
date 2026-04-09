"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";

export default function CmsPage() {
  const params = useParams();
  const slug = String(params?.slug || "");
  const [page, setPage] = useState(null);
  const [message, setMessage] = useState("Loading page...");

  useEffect(() => {
    if (!slug) return;
    apiRequest(`/discovery/cms-pages/${encodeURIComponent(slug)}`)
      .then((data) => {
        setPage(data);
        setMessage("");
      })
      .catch((error) => {
        setMessage(error?.message || "Page not found.");
      });
  }, [slug]);

  return (
    <main className="page-wrap" style={{ minHeight: "80vh" }}>
      <section className="api-panel admin-cms-public">
        {page ? (
          <>
            <p className="admin-cms-kicker">CMS Page</p>
            <h1>{page.title}</h1>
            {page.excerpt ? <p className="admin-cms-excerpt">{page.excerpt}</p> : null}
            <div className="admin-cms-body" dangerouslySetInnerHTML={{ __html: page.content || "" }} />
          </>
        ) : (
          <>
            <h1>CMS Page</h1>
            <p className="panel-msg">{message}</p>
          </>
        )}
      </section>
    </main>
  );
}