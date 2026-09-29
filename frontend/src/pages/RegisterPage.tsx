import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  User as UserIcon, 
  Mail, 
  Lock, 
  Phone, 
  AlertCircle, 
  ArrowRight, 
  Sparkles,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sound } from '../utils/sound';

interface RegisterPageProps {
  onSwitchToLogin: () => void;
  onSuccess: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onSwitchToLogin, onSuccess }) => {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // Request OTP from server
  const handleSendOtp = async () => {
    setLocalError(null);
    setSuccessNotice(null);

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setLocalError('Please enter a valid phone number first.');
      return;
    }

    if (trimmedPhone.length < 7) {
      setLocalError('Phone number must be at least 7 digits.');
      return;
    }

    setSendingOtp(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmedPhone }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send one-time password');
      }

      sound.playMessagePop();
      setOtpSent(true);
      setOtpVerified(false);
      setCooldownSeconds(60);
      setSuccessNotice(`One-time password sent to ${trimmedPhone}. Check your messages.`);

      if (data.devOtp) {
        setDevOtpCode(data.devOtp);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Error sending verification code');
    } finally {
      setSendingOtp(false);
    }
  };

  // Verify OTP code
  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || otp).trim();
    if (code.length !== 6) {
      setLocalError('Please enter the full 6-digit verification code.');
      return;
    }

    setVerifyingOtp(true);
    setLocalError(null);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otp: code }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid verification code');
      }

      sound.playChime();
      setOtpVerified(true);
      setSuccessNotice('Phone number verified successfully! You may now complete registration.');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Auto-verify if 6 digits are typed
  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
    setOtp(val);
    if (val.length === 6 && !otpVerified) {
      handleVerifyOtp(val);
    }
  };

  const handleApplyDevOtp = () => {
    if (!devOtpCode) return;
    sound.playTap();
    setOtp(devOtpCode);
    handleVerifyOtp(devOtpCode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('Please enter your full name.');
      return;
    }

    if (!email.trim()) {
      setLocalError('Please enter your email address.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    if (!phone.trim()) {
      setLocalError('Phone number is required.');
      return;
    }

    if (!otpSent) {
      setLocalError('Please click "Send Verification Code" to verify your phone number.');
      return;
    }

    if (!otp.trim()) {
      setLocalError('Please enter the 6-digit verification code sent to your phone.');
      return;
    }

    setLoading(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        otp: otp.trim(),
      });
      sound.playSuccess();
      onSuccess();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSampleFill = () => {
    sound.playTap();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setName('Alex Morgan');
    setEmail(`alex${randomSuffix}@plugy.dev`);
    setPassword('PlugySecret123!');
    setPhone(`+155501${Math.floor(10 + Math.random() * 90)}`);
    setOtp('');
    setOtpSent(false);
    setOtpVerified(false);
    setDevOtpCode(null);
    setLocalError(null);
    setSuccessNotice(null);
  };

  return (
    <div className="max-w-md mx-auto w-full my-6">
      <div className="bg-slate-900/85 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3 shadow-inner">
            <UserPlus className="w-6 h-6 stroke-[2.2]" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Create Account</h2>
          <p className="text-xs text-slate-400 mt-1">
            Two-sided verified profile for local job posting and service pickup
          </p>
        </div>

        {/* Error Notification */}
        {localError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in slide-in-from-top-1 duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1 font-semibold">{localError}</div>
          </div>
        )}

        {/* Success Notice */}
        {successNotice && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2.5 animate-in slide-in-from-top-1 duration-150">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <div className="flex-1 font-semibold">{successNotice}</div>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
              Full Name *
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs text-white placeholder-slate-500 outline-none transition"
              />
            </div>
          </div>

          {/* Email Address */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
              Email Address *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@example.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs text-white placeholder-slate-500 outline-none transition"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
              Password (min. 6 characters) *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs text-white placeholder-slate-500 outline-none transition"
              />
            </div>
          </div>

          {/* Phone Number with OTP Verification */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                Phone Number (Required) *
              </label>

              {otpVerified && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" />
                  Verified ✓
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  disabled={otpVerified}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (otpVerified) setOtpVerified(false);
                  }}
                  placeholder="+1 555-0144"
                  className="w-full pl-10 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-emerald-500 text-xs text-white placeholder-slate-500 outline-none transition disabled:opacity-75"
                />
              </div>

              {/* Send Code Button */}
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={sendingOtp || cooldownSeconds > 0 || !phone.trim() || otpVerified}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-bold text-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              >
                {sendingOtp ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : cooldownSeconds > 0 ? (
                  `Resend in ${cooldownSeconds}s`
                ) : otpSent ? (
                  'Resend Code'
                ) : (
                  'Send OTP'
                )}
              </button>
            </div>

            {/* OTP Code Entry Section (Appears after clicking Send OTP) */}
            {otpSent && (
              <div className="space-y-2.5 pt-2 border-t border-slate-800/80 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                    <KeyRound className="w-3 h-3 text-amber-400" />
                    Enter 6-Digit OTP Code
                  </span>

                  {devOtpCode && !otpVerified && (
                    <button
                      type="button"
                      onClick={handleApplyDevOtp}
                      className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 cursor-pointer"
                    >
                      Fill Demo: {devOtpCode}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otp}
                    onChange={handleOtpChange}
                    placeholder="123456"
                    className="flex-1 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-emerald-500 text-center text-sm font-mono tracking-widest text-white placeholder-slate-600 outline-none transition"
                  />

                  <button
                    type="button"
                    onClick={() => handleVerifyOtp()}
                    disabled={verifyingOtp || otp.length !== 6 || otpVerified}
                    className={`px-4 py-2 rounded-xl font-bold text-xs transition cursor-pointer shrink-0 ${
                      otpVerified
                        ? 'bg-emerald-500 text-slate-950 font-black'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-40'
                    }`}
                  >
                    {verifyingOtp ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : otpVerified ? (
                      'Verified ✓'
                    ) : (
                      'Verify'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer hover:scale-102 active:scale-98"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <span>Complete Registration</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </>
            )}
          </button>

          {/* Fill Sample Details */}
          <button
            type="button"
            onClick={handleSampleFill}
            className="w-full py-2 px-3 rounded-2xl bg-slate-950 border border-dashed border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Fill Sample Details
          </button>
        </form>

        {/* Switch to Login */}
        <div className="pt-4 border-t border-slate-800 text-center text-xs text-slate-400">
          Already registered?{' '}
          <button
            onClick={() => {
              sound.playTap();
              onSwitchToLogin();
            }}
            className="text-emerald-400 hover:text-emerald-300 font-bold underline underline-offset-4 cursor-pointer ml-1"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
};
