import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { env } from '../config/env.js';

export class OtpService {
  /**
   * Standardize phone format (strip spaces, hyphens, parentheses, but preserve +)
   */
  public normalizePhone(phone: string): string {
    const cleaned = phone.trim().replace(/[\s\-()]/g, '');
    return cleaned;
  }

  /**
   * Generates and dispatches a 6-digit one-time password to the given phone number
   */
  public async sendOtp(rawPhone: string): Promise<{
    success: boolean;
    message: string;
    phone: string;
    devOtp?: string;
    retryAfterSeconds?: number;
    error?: string;
  }> {
    const phone = this.normalizePhone(rawPhone);

    // Rate-limiting check: Prevent spamming SMS within 60 seconds
    const recentCheck = await query(
      `SELECT created_at FROM phone_verifications
       WHERE phone = $1 AND created_at > NOW() - INTERVAL '60 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );

    if (recentCheck.rows.length > 0) {
      return {
        success: false,
        message: 'Please wait 60 seconds before requesting another verification code.',
        error: 'Please wait 60 seconds before requesting another verification code.',
        phone,
        retryAfterSeconds: 60,
      };
    }

    // Generate random 6-digit numeric OTP (100000 - 999999)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash the OTP securely
    const saltRounds = 8;
    const code_hash = await bcrypt.hash(otp, saltRounds);

    // 10 minutes expiration
    const expires_at = new Date(Date.now() + 10 * 60 * 1000);

    // Store in database
    await query(
      `INSERT INTO phone_verifications (phone, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [phone, code_hash, expires_at]
    );

    // Dispatch SMS notification
    await this.dispatchSms(phone, otp);

    const isDevOrTest = env.NODE_ENV !== 'production';

    return {
      success: true,
      message: `One-time password sent to ${rawPhone}`,
      phone,
      devOtp: isDevOrTest ? otp : undefined,
    };
  }

  /**
   * Verifies the provided 6-digit OTP against active database records
   */
  public async verifyOtp(rawPhone: string, code: string): Promise<{
    valid: boolean;
    error?: string;
  }> {
    const phone = this.normalizePhone(rawPhone);

    // Find the latest unexpired verification record for this phone number
    const result = await query(
      `SELECT id, code_hash, expires_at, attempts, verified
       FROM phone_verifications
       WHERE phone = $1 AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone]
    );

    if (result.rows.length === 0) {
      return {
        valid: false,
        error: 'Verification code expired or not found. Please request a new code.',
      };
    }

    const verification = result.rows[0];

    // Max 5 attempts guard
    if (verification.attempts >= 5) {
      return {
        valid: false,
        error: 'Too many incorrect attempts. Please request a new verification code.',
      };
    }

    // Verify bcrypt hash
    const isMatch = await bcrypt.compare(code.trim(), verification.code_hash);

    if (!isMatch) {
      // Increment attempt counter if not verified yet
      if (!verification.verified) {
        await query(
          `UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = $1`,
          [verification.id]
        );
      }
      return {
        valid: false,
        error: 'Invalid verification code. Please check and try again.',
      };
    }

    // Mark as verified
    if (!verification.verified) {
      await query(
        `UPDATE phone_verifications SET verified = TRUE WHERE id = $1`,
        [verification.id]
      );
    }

    return { valid: true };
  }

  /**
   * Dispatches SMS message via Twilio if configured, or logs to console
   */
  private async dispatchSms(phone: string, otp: string): Promise<void> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    const messageText = `Your Plugy verification code is: ${otp}. It expires in 10 minutes. Do not share this code.`;

    // Console notification (guarantees local dev & test observability)
    console.log(`\n======================================================`);
    console.log(`📱 [SMS OTP DISPATCH]`);
    console.log(`To:      ${phone}`);
    console.log(`Code:    ${otp}`);
    console.log(`Message: ${messageText}`);
    console.log(`======================================================\n`);

    if (accountSid && authToken && fromPhone) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const bodyParams = new URLSearchParams({
          To: phone,
          From: fromPhone,
          Body: messageText,
        });

        const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const res = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: bodyParams.toString(),
        });

        if (!res.ok) {
          const errBody = await res.text();
          console.warn('[Twilio SMS Error]:', errBody);
        } else {
          console.log(`[Twilio SMS Sent Successfully] to ${phone}`);
        }
      } catch (err) {
        console.error('[SMS Provider Dispatch Failed]:', err);
      }
    }
  }
}

export const otpService = new OtpService();
