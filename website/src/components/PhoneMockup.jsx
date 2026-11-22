/**
 * Single hero image (Inkitt-style phones composite).
 * Place file at: website/public/assets/hero/phone.png
 * Served as: /assets/hero/phone.png
 */
export default function PhoneMockupRow() {
  return (
    <div className="hero-phone-wrap">
      <img
        className="hero-phone-img"
        src="/assets/hero/phone.png"
        alt="Wingsaga on mobile — explore free books"
        loading="lazy"
        onError={(e) => {
          // Hide broken image so layout does not show a broken icon
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}
