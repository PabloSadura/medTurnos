import { Outlet } from 'react-router-dom';
import { SideNavBar } from './SideNavBar';
import { TopAppBar } from './TopAppBar';
import { SidebarProvider, useSidebar } from '../contexts/SidebarContext';
import { cn } from '../lib/utils';

function LayoutContent() {
  const { isCollapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-surface-bright selection:bg-primary/10 w-full max-w-full overflow-x-hidden">
      <SideNavBar />
      <div 
        className={cn(
          "transition-all duration-300 ease-in-out min-h-screen flex flex-col w-full max-w-full overflow-x-hidden",
          isCollapsed ? "lg:pl-16" : "lg:pl-56",
          "pl-0"
        )}
      >
        <TopAppBar />
        <main className="pt-16 sm:pt-20 pb-16 sm:pb-12 px-3 sm:px-6 lg:px-8 flex-1 w-full max-w-full overflow-x-hidden">
          <div className="max-w-7xl mx-auto w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export function MainLayout() {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
}
