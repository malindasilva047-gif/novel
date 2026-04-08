'use client';

import { useEffect, useRef, useState } from 'react';

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function registerGlobalGoogleCallback(handler) {
  if (typeof window === 'undefined') {
    return;
  }
  window.__bixbiGoogleCredentialHandler = handler;
}

function initializeGoogleOnce(clientId) {
  if (typeof window === 'undefined' || !window.google?.accounts?.id) {
    return;
  }

  const alreadyInitialized = window.__bixbiGoogleInitializedClientId === clientId;
  if (alreadyInitialized) {
    return;
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      window.__bixbiGoogleCredentialHandler?.(response);
    },
  });
  window.__bixbiGoogleInitializedClientId = clientId;
}

function loadGoogleScript() {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Google script')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google script'));
    document.head.appendChild(script);
  });
}

export default function GoogleSignInButton({ onCredential, disabled = false, text = 'continue_with', useRedirect = true }) {
  const clientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
  const buttonRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let isMounted = true;
    if (!clientId || disabled) {
      return () => {
        isMounted = false;
      };
    }

    loadGoogleScript()
      .then(() => {
        if (!isMounted || !window.google?.accounts?.id || !buttonRef.current) {
          return;
        }

        registerGlobalGoogleCallback((response) => {
          if (response?.credential) {
            callbackRef.current?.(response.credential);
          }
        });
        initializeGoogleOnce(clientId);

        buttonRef.current.innerHTML = '';
        
        if (useRedirect) {
          // Redirect-based flow (no popup, eliminates COOP warnings)
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            width: 320,
            text,
            auto_select: false,
            ux_mode: 'redirect',
            redirect_uri: window.location.origin + (typeof window !== 'undefined' && window.location.pathname === '/' ? '/auth/signin' : window.location.pathname),
          });
        } else {
          // Popup flow (default, may show COOP warning)
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            width: 320,
            text,
          });
        }
      })
      .catch((error) => {
        if (isMounted) {
          setLoadError(error.message || 'Google sign-in is unavailable right now.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [clientId, disabled, text]);

  if (!clientId) {
    return null;
  }

  const showLocalhostHint = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  );

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {loadError ? <div className="bx-auth-error">{loadError}</div> : null}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        <div ref={buttonRef} />
        {disabled ? (
          <div style={{ position: 'absolute', inset: 0, cursor: 'not-allowed' }} aria-hidden="true" />
        ) : null}
      </div>
      {showLocalhostHint ? (
        <div style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
          If Google sign-in shows origin errors, add http://localhost:3000 and http://127.0.0.1:3000 to Authorized JavaScript origins in Google Cloud OAuth settings.
        </div>
      ) : null}
    </div>
  );
}