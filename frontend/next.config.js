/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000"
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000"
      }
    ]
  },
  async redirects() {
    return [
      { source: "/bixbi-source/bixbi.html", destination: "/", permanent: false },
      { source: "/bixbi-source/bixbid.html", destination: "/", permanent: false },
      { source: "/bixbi-source/bixbi%20book%20red%20and%20write.html", destination: "/", permanent: false },

      { source: "/bixbi-source/bixbi-reading%20(1d).html", destination: "/read/1", permanent: false },
      { source: "/bixbi-source/bixbi-reading%20(1).html", destination: "/read/1", permanent: false },
      { source: "/bixbi-source/bixbi-reading.html", destination: "/read/1", permanent: false },
      { source: "/bixbi-source/bixbi-readingd.html", destination: "/read/1", permanent: false },

      { source: "/bixbi-source/bixbi-writer-studio.html", destination: "/write", permanent: false },
      { source: "/bixbi-source/bixbi-writer-studiod.html", destination: "/write", permanent: false },
      { source: "/bixbi-source/book%20.html", destination: "/write", permanent: false },
      { source: "/bixbi-source/chap.html", destination: "/write", permanent: false },
      { source: "/bixbi-source/bixbi%20chanel%20.html", destination: "/write", permanent: false },

      { source: "/bixbi-source/bixbi-profile.html", destination: "/profile", permanent: false }
    ];
  }
};

module.exports = nextConfig;
