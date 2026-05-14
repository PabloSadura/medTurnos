import { Search, Bell, HelpCircle, Plus } from 'lucide-react';
import { auth } from '../lib/firebase';

export function TopAppBar() {
  const user = auth.currentUser;

  return (
    <header className="h-14 bg-white/80 backdrop-blur-md border-b border-outline-variant fixed top-0 right-0 left-56 flex items-center justify-between px-8 z-40 shrink-0">
      <div className="flex items-center gap-4">
        <h2 className="text-[14px] font-bold text-on-surface tracking-tight">Centro de Control</h2>
        <span className="bg-primary/5 text-primary text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-primary/10">Sincronizado</span>
      </div>

      <div className="flex items-center gap-4">
        <button className="p-1.5 rounded-md hover:bg-surface text-on-surface-variant transition-all border border-transparent hover:border-outline-variant relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-error rounded-full border-2 border-white"></span>
        </button>

        <div className="w-7 h-7 rounded-full border border-primary/20 overflow-hidden bg-surface flex-shrink-0 ml-2">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-[10px] text-primary bg-primary-container">
              {user?.displayName?.charAt(0) || user?.email?.charAt(0)}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
