import React, { createContext, useContext, useState, useEffect } from 'react';

interface SidebarContextType {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  toggleSidebar: () => void;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleMobile: () => void;
  closeMobile: () => void;
  openMobile: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
  isMobileOpen: false,
  toggleSidebar: () => {},
  toggleCollapsed: () => {},
  setCollapsed: () => {},
  toggleMobile: () => {},
  closeMobile: () => {},
  openMobile: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  // Load initial collapsed state from localStorage if present
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('medturnos_sidebar_collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Persist collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('medturnos_sidebar_collapsed', String(isCollapsed));
    } catch (e) {
      console.warn('Could not save sidebar preference', e);
    }
  }, [isCollapsed]);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed(prev => !prev);
  };

  const setCollapsed = (val: boolean) => {
    setIsCollapsed(val);
  };

  const toggleMobile = () => {
    setIsMobileOpen(prev => !prev);
  };

  const closeMobile = () => {
    setIsMobileOpen(false);
  };

  const openMobile = () => {
    setIsMobileOpen(true);
  };

  // Main toggler: on mobile toggles mobile drawer, on desktop toggles collapse
  const toggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setIsMobileOpen(prev => !prev);
    } else {
      setIsCollapsed(prev => !prev);
    }
  };

  return (
    <SidebarContext.Provider
      value={{
        isCollapsed,
        isMobileOpen,
        toggleSidebar,
        toggleCollapsed,
        setCollapsed,
        toggleMobile,
        closeMobile,
        openMobile
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
