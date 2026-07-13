def otp_email_html(app_name: str, otp: str) -> str:
    return f"""
    <div style="font-family: Inter, Arial, sans-serif; background:#f1f5f9; padding:24px;">
      <div style="max-width:520px; margin:auto; background:white; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
        <div style="background:#2563eb; color:white; padding:18px 22px;">
          <h1 style="margin:0; font-size:20px;">{app_name} password reset</h1>
        </div>
        <div style="padding:22px;">
          <p style="color:#334155; font-size:14px;">Use this one-time password to reset your account password.</p>
          <div style="font-size:30px; letter-spacing:8px; font-weight:800; color:#0f172a; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:16px; text-align:center;">
            {otp}
          </div>
          <p style="color:#64748b; font-size:12px; margin-top:18px;">This OTP expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
        </div>
      </div>
    </div>
    """
