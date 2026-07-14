import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

class EmailService:
    def __init__(self):
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", 587))
        self.smtp_user = os.getenv("SMTP_USER")
        self.smtp_password = os.getenv("SMTP_PASSWORD")
        self.from_email = os.getenv("FROM_EMAIL", self.smtp_user)

    def send_email(self, to_email: str, subject: str, body: str, html_body: Optional[str] = None) -> bool:
        try:
            msg = MIMEMultipart('alternative')
            msg['From'] = self.from_email
            msg['To'] = to_email
            msg['Subject'] = subject
            
            text_part = MIMEText(body, 'plain', 'utf-8')
            msg.attach(text_part)
            
            if html_body:
                html_part = MIMEText(html_body, 'html', 'utf-8')
                msg.attach(html_part)
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_email, to_email, msg.as_string())
            return True
        except Exception as e:
            print(f"Error enviando email: {e}")
            return False

    def send_welcome(self, email: str, nombre: str) -> bool:
        body = f"Hola {nombre},\n\nBienvenido a AXENTRA. Tu cuenta ha sido creada exitosamente.\n\nSaludos,\nEquipo AXENTRA"
        html = f"""
        <html><body style="font-family: Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                <h2 style="color: #1a1a2e;">Bienvenido a AXENTRA</h2>
                <p>Hola <strong>{nombre}</strong>,</p>
                <p>Tu cuenta ha sido creada exitosamente.</p>
                <p style="margin-top: 20px; color: #666;">Saludos,<br>Equipo AXENTRA</p>
            </div>
        </body></html>
        """
        return self.send_email(email, "Bienvenido a AXENTRA 🚀", body, html)

    def send_password_reset(self, email: str, token: str) -> bool:
        link = f"http://localhost:5173/reset-password?token={token}"
        body = f"Hola,\n\nHaz clic en el siguiente enlace para restablecer tu contraseña:\n{link}\n\nSi no solicitaste esto, ignora este correo."
        html = f"""
        <html><body style="font-family: Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                <h2 style="color: #1a1a2e;">Restablecer Contraseña</h2>
                <p>Haz clic en el siguiente botón para restablecer tu contraseña:</p>
                <a href="{link}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 5px;">Restablecer Contraseña</a>
                <p style="margin-top: 20px; color: #666;">Si no solicitaste esto, ignora este correo.</p>
                <p style="color: #666;">Saludos,<br>Equipo AXENTRA</p>
            </div>
        </body></html>
        """
        return self.send_email(email, "Restablecer Contraseña - AXENTRA 🔐", body, html)
