import { useState, useMemo } from 'react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { Activity, Mail, Lock, Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2, AlertTriangle, ExternalLink, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { Modal } from '../components/Modal';
import { useAuth } from '../contexts/AuthContext';
import { validatePassword, sanitizeInput } from '../lib/security';

export function Login() {
  const { apiAuthError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isApiDisabled, setIsApiDisabled] = useState(false);

  // Password reset modal state
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Password validation analysis
  const passwordAnalysis = useMemo(() => {
    if (!password) return null;
    return validatePassword(password);
  }, [password]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    const clean = sanitizeInput(resetEmail);
    if (!clean) {
      setResetError('Por favor ingrese su correo electrónico profesional.');
      return;
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, clean);
      setResetSuccess(true);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('Identity Toolkit API') || errMsg.includes('identitytoolkit.googleapis.com')) {
        setIsApiDisabled(true);
        setResetError('La API de Autenticación de Google Cloud está desactivada en su proyecto.');
      } else {
        // Uniform message to prevent user enumeration
        setResetSuccess(true);
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const cleanEmail = sanitizeInput(email);

    if (!cleanEmail || !password) {
      setError('Por favor complete todos los campos requeridos.');
      setLoading(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isIdentityToolkitDisabled =
        errMsg.includes('identitytoolkit.googleapis.com') ||
        errMsg.includes('Identity Toolkit API') ||
        err.code === 'auth/api-not-activated' ||
        (err.code === 'auth/internal-error' && errMsg.includes('403')) ||
        err.code === 'auth/insufficient-permission' ||
        errMsg.includes('SERVICE_DISABLED');

      if (isIdentityToolkitDisabled) {
        setIsApiDisabled(true);
        setError('Identity Toolkit API no está activa en su consola Google Cloud.');
        return;
      }

      if (err.code === 'auth/operation-not-allowed') {
        setError('El proveedor Email/Contraseña debe estar habilitado en Firebase Console (Authentication > Sign-in method).');
      } else if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/invalid-login-credentials'
      ) {
        // Unified non-enumerating error message
        setError('Credenciales incorrectas. Verifique su email y contraseña.');
      } else if (err.code === 'auth/invalid-email') {
        setError('El formato del correo electrónico no es válido.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Demasiados intentos fallidos. Por seguridad, intente nuevamente más tarde.');
      } else {
        setError('Error al procesar el inicio de sesión. Verifique su conexión e intente nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center medical-grid p-4 relative overflow-hidden bg-surface">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px] z-10"
      >
        <div className="bg-white rounded-2xl shadow-xl border border-outline-variant p-6 sm:p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-3 shadow-md text-white">
              <Activity size={24} />
            </div>
            <h1 className="text-2xl font-black text-on-surface tracking-tight">MedTurnos</h1>
            <p className="text-[11px] font-bold text-on-surface-variant mt-1 text-center uppercase tracking-widest opacity-60">
              Plataforma Médica Segura
            </p>
          </div>

          {/* Identity Toolkit notice */}
          {(isApiDisabled || apiAuthError) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-[12px] text-amber-900 leading-tight">Identity Toolkit API requerida</p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Para autenticar usuarios mediante Firebase Auth, active la <b>Identity Toolkit API</b> en su proyecto de Google Cloud:
                  </p>
                </div>
              </div>

              <a
                href="https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=166114037624"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs"
              >
                <ExternalLink size={13} />
                <span>Activar API en Google Cloud Console</span>
              </a>
            </motion.div>
          )}

          {error && (
            <motion.div
              id="login-error-alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-5 p-3 bg-error-container text-error rounded-xl flex items-center gap-3 border border-error/20"
            >
              <AlertCircle size={18} className="shrink-0" />
              <p className="text-xs font-semibold leading-tight">{error}</p>
            </motion.div>
          )}

          <form id="form-login-email" className="space-y-4" onSubmit={handleEmailLogin} autoComplete="on">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant block uppercase tracking-wider" htmlFor="email">
                Correo Profesional
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant/60">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="email"
                  className="block w-full pl-9 pr-3 py-2.5 bg-surface text-sm border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40 disabled:opacity-50"
                  placeholder="doctor@clinica.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-on-surface-variant block uppercase tracking-wider" htmlFor="password">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email.trim());
                    setResetSuccess(false);
                    setResetError(null);
                    setIsForgotModalOpen(true);
                  }}
                  className="text-[11px] font-bold text-primary hover:underline uppercase tracking-wider cursor-pointer"
                >
                  ¿Olvidó su clave?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant/60">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="current-password"
                  className="block w-full pl-9 pr-10 py-2.5 bg-surface text-sm border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40 disabled:opacity-50 font-mono text-sm"
                  placeholder="••••••••••••"
                />
                <button
                  id="btn-toggle-password"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password strength indicator when typing */}
              {passwordAnalysis && (
                <div className="pt-1 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-on-surface-variant font-medium">Seguridad de clave:</span>
                    <span className={`font-bold ${passwordAnalysis.color}`}>{passwordAnalysis.label}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 h-1">
                    {[0, 1, 2, 3].map((step) => (
                      <div
                        key={step}
                        className={`h-full rounded-full transition-all ${
                          passwordAnalysis.score > step
                            ? passwordAnalysis.score <= 1
                              ? 'bg-error'
                              : passwordAnalysis.score === 2
                              ? 'bg-amber-500'
                              : passwordAnalysis.score === 3
                              ? 'bg-blue-500'
                              : 'bg-emerald-500'
                            : 'bg-outline-variant/40'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              id="btn-login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all duration-200 shadow-md flex items-center justify-center gap-2 uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed mt-3 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-outline-variant/60 flex items-center justify-center gap-2 text-[11px] text-on-surface-variant font-medium">
            <Shield size={13} className="text-primary" />
            <span>Acceso profesional protegido mediante TLS y RBAC</span>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-6 text-on-surface-variant opacity-60">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">HIPAA Ready</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Cifrado de Extremo a Extremo</span>
          </div>
        </div>
      </motion.div>

      {/* Modal de Restablecer Contraseña */}
      <Modal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        title="Restablecer Contraseña"
      >
        <div className="space-y-4">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Ingrese el correo electrónico asociado a su cuenta profesional. Le enviaremos un enlace seguro para restablecer su contraseña.
          </p>

          {resetSuccess ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2.5 text-emerald-800">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                <p className="text-xs font-bold">Solicitud procesada exitosamente</p>
              </div>
              <p className="text-xs text-emerald-700 leading-relaxed">
                Si la cuenta existe en el sistema, hemos enviado las instrucciones a <b>{resetEmail}</b>. Revise también su carpeta de correo no deseado o spam.
              </p>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Entendido
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              {resetError && (
                <div className="p-3 bg-error-container text-error rounded-lg flex items-center gap-2.5 border border-error/20 text-xs font-bold">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="reset-email" className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                  <Mail size={13} /> Correo Electrónico Profesional
                </label>
                <div className="relative">
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="doctor@clinica.com"
                    required
                    disabled={resetLoading}
                    className="w-full pl-3.5 pr-3.5 py-2.5 bg-surface text-sm border border-outline-variant rounded-xl focus:border-primary outline-none text-on-surface transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsForgotModalOpen(false)}
                  disabled={resetLoading}
                  className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetLoading || !resetEmail.trim()}
                  className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {resetLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    'Enviar Enlace'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
}
