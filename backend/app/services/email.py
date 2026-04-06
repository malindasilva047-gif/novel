from email.message import EmailMessage
import smtplib

from app.core.config import get_settings


def _send_email(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    settings = get_settings()
    if not settings.smtp_username or not settings.smtp_password:
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email or settings.smtp_username}>"
    msg["To"] = to_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
        if settings.smtp_use_tls:
            server.starttls()
        server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(msg)


def send_verification_email(to_email: str, code: str) -> None:
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
    _send_email(to_email, subject, html_body, text_body)
