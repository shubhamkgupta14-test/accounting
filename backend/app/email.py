from email.message import EmailMessage
import smtplib

from app.core.config import settings


def send_html_email(to_email: str, subject: str, html: str) -> bool:
    if not settings.smtp_host:
        return False
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content("Your email client does not support HTML email.")
    message.add_alternative(html, subtype="html")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
        smtp.starttls()
        if settings.smtp_user and settings.smtp_password:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
    return True
