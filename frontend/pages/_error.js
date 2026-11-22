export default function ErrorPage({ statusCode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'sans-serif' }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ opacity: 0.8 }}>Status: {statusCode || 500}</p>
      </div>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};
