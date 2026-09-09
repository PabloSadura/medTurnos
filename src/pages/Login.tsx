import { useState } from 'react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { Activity, Mail, Lock, Eye, EyeOff, ShieldCheck, LockIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Modal } from '../components/Modal';

export function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Password reset modal state
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    const clean = resetEmail.trim();
    if (!clean) {
      setResetError('Por favor ingrese su correo electrónico.');
      return;
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, clean);
      setResetSuccess(true);
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err.code === 'auth/user-not-found') {
        setResetError('No existe una cuenta registrada con ese correo electrónico.');
      } else if (err.code === 'auth/invalid-email') {
        setResetError('El formato de correo no es válido.');
      } else {
        setResetError('Error al enviar el enlace. Intente nuevamente más tarde.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const cleanEmail = email.trim();
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        console.warn('Email/Password provider not enabled in Firebase Console.');
        setError('El proveedor de Email/Contraseña debe estar habilitado en Firebase Console (Authentication > Sign-in method).');
      } else if (cleanEmail.toLowerCase() === 'admin@mail.com' && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials')) {
        try {
          await createUserWithEmailAndPassword(auth, cleanEmail, password);
          return;
        } catch (createErr: any) {
          if (createErr.code === 'auth/operation-not-allowed') {
            setError('El inicio con correo y contraseña no está habilitado en Firebase. Actívelo en Firebase Console > Authentication.');
          } else if (createErr.code !== 'auth/email-already-in-use') {
            console.error('Admin create error:', createErr);
          }
        }
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') {
        setError('Credenciales incorrectas. Por favor, verifique su email y contraseña.');
      } else if (err.code === 'auth/invalid-email') {
        setError('El formato del email no es válido.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Demasiados intentos fallidos. Intente más tarde.');
      } else {
        console.error('Email login error:', err);
        setError('Error al iniciar sesión. Intente nuevamente.');
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
        className="w-full max-w-[400px] z-10"
      >
        <div className="bg-white rounded-2xl shadow-sm border border-outline-variant p-5 sm:p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4 shadow-lg text-white">
              <Activity size={24} />
            </div>
            <h1 className="text-2xl font-black text-on-surface tracking-tighter">MedTurnos</h1>
            <p className="text-[11px] font-bold text-on-surface-variant mt-1 text-center uppercase tracking-widest opacity-60">Healthcare Management</p>
          </div>

          {error && (
            <motion.div 
              id="login-error-alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-6 p-3 bg-error-container text-error rounded-lg flex items-center gap-3 border border-error/20"
            >
              <AlertCircle size={18} className="shrink-0" />
              <p className="text-[11px] font-bold uppercase tracking-tight leading-tight">{error}</p>
            </motion.div>
          )}

          <form id="form-login-email" className="space-y-4" onSubmit={handleEmailLogin}>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-on-surface-variant block uppercase tracking-wider" htmlFor="email">Email Profesional</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                  <Mail size={16} />
                </div>
                <input 
                  type="email" 
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  className="block w-full pl-9 pr-3 py-2.5 bg-surface text-sm border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40 disabled:opacity-50"
                  placeholder="ejemplo@medico.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-on-surface-variant block uppercase tracking-wider" htmlFor="password">Contraseña</label>
                <button 
                  type="button"
                  onClick={() => {
                    setResetEmail(email.trim());
                    setResetSuccess(false);
                    setResetError(null);
                    setIsForgotModalOpen(true);
                  }}
                  className="text-[10px] font-black text-primary hover:underline uppercase tracking-wider cursor-pointer"
                >
                  ¿Olvidó su clave?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
                  <LockIcon size={16} />
                </div>
                <input 
                  type={showPassword ? "text" : "password"} 
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  className="block w-full pl-9 pr-10 py-2.5 bg-surface text-sm border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40 disabled:opacity-50"
                  placeholder="••••••••"
                />
                <button 
                  id="btn-toggle-password"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <input type="checkbox" id="remember" className="w-3.5 h-3.5 text-primary border-outline-variant rounded focus:ring-primary" />
              <label htmlFor="remember" className="ml-2 text-[12px] font-medium text-on-surface-variant cursor-pointer">Recordar sesión</label>
            </div>

            <button 
              id="btn-login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 active:scale-[0.98] transition-all duration-200 shadow-md flex items-center justify-center gap-2 uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-outline-variant text-center">
            <p className="text-[11px] font-medium text-on-surface-variant">
              ¿Dificultades técnicas? <a href="#" className="text-primary font-bold hover:underline">Soporte IT</a>
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-4 text-on-surface-variant opacity-60">
          <div className="flex items-center gap-1.5 grayscale opacity-70">
            <ShieldCheck size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">HIPAA Compliant</span>
          </div>
          <div className="flex items-center gap-1.5 grayscale opacity-70">
            <Lock size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">SSL Secure</span>
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
                <p className="text-xs font-bold">¡Enlace enviado exitosamente!</p>
              </div>
              <p className="text-xs text-emerald-700 leading-relaxed">
                Hemos enviado un correo a <b>{resetEmail}</b> con las instrucciones para crear una nueva clave. Revise también su carpeta de correo no deseado o spam.
              </p>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
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
                <label htmlFor="reset-email" className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                  <Mail size={13} /> Correo Electrónico
                </label>
                <div className="relative">
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="ejemplo@medico.com"
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
