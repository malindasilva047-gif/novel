'use client';

import { useState, useEffect } from 'react';
import './CookieConsentModal.css';

export default function CookieConsentModal() {
  const [show, setShow] = useState(false);
  const [accepted, setAccepted] = useState(null);

  useEffect(() => {
    // Check if user already made a choice
    const stored = localStorage.getItem('cookieConsent');
    if (stored) {
      setAccepted(JSON.parse(stored));
      return;
    }
    
    // Show popup after 2 seconds
    const timer = setTimeout(() => {
      setShow(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleAccept = () => {
    const consentData = {
      cookies: true,
      caches: true,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem('cookieConsent', JSON.stringify(consentData));
    localStorage.setItem('browserDataAllowed', 'true');
    setAccepted(consentData);
    setShow(false);
  };

  const handleDecline = () => {
    const consentData = {
      cookies: false,
      caches: false,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem('cookieConsent', JSON.stringify(consentData));
    localStorage.setItem('browserDataAllowed', 'false');
    setAccepted(consentData);
    setShow(false);
  };

  const handleClose = () => {
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="cookie-consent-overlay">
      <div className="cookie-consent-modal">
        {/* Close button */}
        <button
          className="cookie-consent-close"
          onClick={handleClose}
          aria-label="Close"
        >
          ✕
        </button>

        {/* Modal content */}
        <div className="cookie-consent-header">
          <div className="cookie-consent-icon">🍪</div>
          <h2>Better Experience with Your Browser Data</h2>
        </div>

        <div className="cookie-consent-body">
          <p className="cookie-consent-main-text">
            We'd love to give you personalized recommendations and better reading experience!
          </p>
          <p className="cookie-consent-sub-text">
            May we access your browser cookies and caches to:
          </p>
          <ul className="cookie-consent-features">
            <li>
              <span className="feature-icon">📚</span>
              <span>Remember your reading preferences & progress</span>
            </li>
            <li>
              <span className="feature-icon">🎯</span>
              <span>Show stories you'll love to read</span>
            </li>
            <li>
              <span className="feature-icon">⚡</span>
              <span>Speed up your browsing experience</span>
            </li>
            <li>
              <span className="feature-icon">🤖</span>
              <span>Improve our platform for everyone</span>
            </li>
          </ul>
          <p className="cookie-consent-privacy">
            Your privacy matters. We only use this data to enhance your experience and never sell your information.
          </p>
        </div>

        {/* Action buttons */}
        <div className="cookie-consent-actions">
          <button
            className="cookie-consent-btn decline"
            onClick={handleDecline}
          >
            Not Now
          </button>
          <button
            className="cookie-consent-btn accept"
            onClick={handleAccept}
          >
            Accept & Enhance 💫
          </button>
        </div>

        {/* Footer note */}
        <p className="cookie-consent-footer">
          You can change your preference anytime in settings
        </p>
      </div>
    </div>
  );
}
