import { Navigate, useLocation } from "react-router-dom";
import { isGuestUser } from "../utils/guest";

/**
 * Wraps authenticated-only pages. Guests (and logged-out users) are sent to /login
 * with returnTo so they come back after signing in.
 */
export default function RequireAuth({ user, children, allowGuest = false }) {
  const location = useLocation();
  const guest = isGuestUser(user);

  if (!allowGuest && guest) {
    const returnTo = `${location.pathname}${location.search || ""}`;
    return <Navigate to="/login" replace state={{ returnTo, authMode: "signin" }} />;
  }

  return children;
}
