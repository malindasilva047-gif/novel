import logging
import requests
from mailjet_rest import Client
from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _send_email(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    """Send email using Mailjet API"""
    settings = get_settings()
    
    # If Mailjet is not configured, skip sending
    if not settings.mailjet_api_key or not settings.mailjet_secret_key:
        return False

    try:
        mailjet = Client(
            auth=(settings.mailjet_api_key, settings.mailjet_secret_key),
            version='v3.1',
        )
        
        data = {
            'Messages': [
                {
                    "From": {
                        "Email": settings.mailjet_from_email,
                        "Name": settings.mailjet_from_name
                    },
                    "To": [
                        {
                            "Email": to_email
                        }
                    ],
                    "Subject": subject,
                    "TextPart": text_body,
                    "HTMLPart": html_body
                }
            ]
        }
        
        result = mailjet.send.create(data=data)
        
        if result.status_code not in [200, 201]:
            logger.error("Mailjet API returned status %s: %s", result.status_code, result.text)
            return False
        return True
            
    except ValueError as e:
        logger.error("Error sending email: %s", str(e))
        return False
    except (requests.RequestException, OSError) as e:
        logger.error("Unexpected error sending email: %s", str(e))
        return False


def check_mailjet_connection() -> tuple[bool, str | None]:
    """Check if Mailjet credentials are valid"""
    settings = get_settings()
    
    if not settings.mailjet_api_key or not settings.mailjet_secret_key:
        return False, "Mailjet credentials not configured"

    try:
        # Use a simple test - get account info (user endpoint)
        response = requests.get(
            'https://api.mailjet.com/v3/REST/user',
            auth=(settings.mailjet_api_key, settings.mailjet_secret_key),
            timeout=10,
        )
        
        if response.status_code in [200, 401]:  # 200 = valid, 401 = invalid credentials but endpoint exists
            if response.status_code == 200:
                return True, None
            else:
                return False, "Invalid Mailjet credentials"
        else:
            return False, f"Mailjet API returned status {response.status_code}"
            
    except requests.RequestException as e:
        logger.error("Mailjet connection check failed: %s", str(e))
        return False, str(e)


# Legacy SMTP functions kept for backward compatibility
def check_smtp_connection() -> tuple[bool, str | None]:
    """Legacy function - now uses Mailjet"""
    return check_mailjet_connection()


def send_verification_email(to_email: str, code: str) -> bool:
    subject = "Your verification code"
    text_body = (
        "Welcome to Bixbi!\n\n"
        f"Your verification code is: {code}\n"
        "This code expires in 24 hours."
    )
    html_body = f"""
    <div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111\">
      <h2 style=\"margin:0 0 12px\">Welcome to Bixbi</h2>
      <p style=\"margin:0 0 12px\">Use this verification code to activate your account:</p>
      <div style=\"font-size:30px;font-weight:700;letter-spacing:6px;margin:8px 0 14px\">{code}</div>
      <p style=\"margin:0;color:#555\">This code expires in 24 hours.</p>
    </div>
    """
    return _send_email(to_email, subject, html_body, text_body)
