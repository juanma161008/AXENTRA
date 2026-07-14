import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from typing import Optional

class EmailService:
    def __init__(self):
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", 587))
        self.smtp_user = os.getenv("SMTP_USER")
        self.smtp_password = os.getenv("SMTP_PASSWORD")
        self.from_email = os.getenv("FROM_EMAIL", self.smtp_user)

    def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None
    ) -> bool:
        """Enviar correo electrónico"""
        try:
            msg = MIMEMultipart('alternative')
            msg['From'] = self.from_email
            msg['To'] = to_email
            msg['Subject'] = subject

            # Adjuntar texto plano
            text_part = MIMEText(body, 'plain', 'utf-8')
            msg.attach(text_part)

            # Adjuntar HTML si existe
            if html_body:
                html_part = MIMEText(html_body, 'html', 'utf-8')
                msg.attach(html_part)

            # Enviar correo
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_email, to_email, msg.as_string())
            
            return True
        except Exception as e:
            print(f"Error enviando email: {e}")
            return False

    def send_password_reset(self, email: str, token: str) -> bool:
        """Enviar correo de recuperación de contraseña"""
        reset_link = f"http://localhost:5173/reset-password?token={token}"
        body = f"""
        Hola,
        
        Has solicitado restablecer tu contraseña.
        
        Haz clic en el siguiente enlace para restablecer tu contraseña:
        {reset_link}
        
        Si no solicitaste este cambio, ignora este correo.
        
        Saludos,
        Equipo AXENTRA
        """
        
        html_body = f"""
        <html>
        <body>
            <h2>Restablecer Contraseña</h2>
            <p>Has solicitado restablecer tu contraseña.</p>
            <p>Haz clic en el siguiente enlace:</p>
            <a href="{reset_link}">Restablecer Contraseña</a>
            <p>Si no solicitaste este cambio, ignora este correo.</p>
            <p>Saludos,<br>Equipo AXENTRA</p>
        </body>
        </html>
        """
        
        return self.send_email(email, "Restablecer Contraseña - AXENTRA", body, html_body)
