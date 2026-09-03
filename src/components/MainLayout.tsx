import { Outlet } from 'react-router-dom';
import { SideNavBar } from './SideNavBar';
import { TopAppBar } from './TopAppBar';
import { SidebarProvider, useSidebar } from '../contexts/SidebarContext';
import { cn } from '../lib/utils';

function LayoutContent() {
  const { isCollapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-surface-bright selection:bg-primary/10">
      <SideNavBar />
      <div 
        className={cn(
          "transition-all duration-300 ease-in-out min-h-screen flex flex-col",
          isCollapsed ? "lg:pl-16" : "lg:pl-56",
          "pl-0"
        )}
      >
        <TopAppBar />
        <main className="pt-20 pb-12 px-4 sm:px-6 lg:px-8 flex-1">
          <div className="max-w-7xl mx-auto">
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
