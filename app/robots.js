export default function robots() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/discover", "/read"],
        disallow: ["/admin", "/admin/login", "/auth/signin", "/auth/signup", "/write"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
