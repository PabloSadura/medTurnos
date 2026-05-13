import { useState } from 'react';
import { auth } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword } from 'firebase/auth';
import { Activity, Mail, Lock, Eye, EyeOff, ShieldCheck, LockIcon, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Error al iniciar sesión con Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Credenciales incorrectas. Por favor, verifique su email y contraseña.');
      } else if (err.code === 'auth/invalid-email') {
        setError('El formato del email no es válido.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Demasiados intentos fallidos. Intente más tarde.');
      } else {
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
        <div className="bg-white rounded-xl shadow-sm border border-outline-variant p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4 shadow-lg text-white">
              <Activity size={24} />
            </div>
            <h1 className="text-2xl font-black text-on-surface tracking-tighter">MedTurnos</h1>
            <p className="text-[11px] font-bold text-on-surface-variant mt-1 text-center uppercase tracking-widest opacity-60">Healthcare Management</p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-6 p-3 bg-error-container text-error rounded-lg flex items-center gap-3 border border-error/20"
            >
              <AlertCircle size={18} className="shrink-0" />
              <p className="text-[11px] font-bold uppercase tracking-tight leading-tight">{error}</p>
            </motion.div>
          )}

          <form className="space-y-4" onSubmit={handleEmailLogin}>
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
                  className="block w-full pl-9 pr-3 py-2 bg-surface text-sm border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40 disabled:opacity-50"
                  placeholder="ejemplo@medico.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-on-surface-variant block uppercase tracking-wider" htmlFor="password">Contraseña</label>
                <a href="#" className="text-[10px] font-black text-primary hover:underline uppercase tracking-wider">¿Olvidó su clave?</a>
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
                  className="block w-full pl-9 pr-10 py-2 bg-surface text-sm border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40 disabled:opacity-50"
                  placeholder="••••••••"
                />
                <button 
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
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 active:scale-[0.98] transition-all duration-200 shadow-md flex items-center justify-center gap-2 uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : 'Iniciar Sesión'}
            </button>
            
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-outline-variant"></div></div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest"><span className="bg-white px-2 text-on-surface-variant">O continuar con</span></div>
            </div>

            <button 
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-2 bg-white border border-outline-variant text-[12px] font-bold text-on-surface rounded-lg hover:bg-surface transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
              GOOGLE ACCOUNT
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
    </div>
  );
}
