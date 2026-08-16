import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  Files,
  LayoutDashboard,
  Repeat,
  Store,
  User,
} from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../AnimatedIconButton";

const navigationItems = [
  { to: "/", label: "Oversikt", icon: LayoutDashboard },
  { to: "/companies", label: "Selskaper", icon: Store },
  { to: "/recurring", label: "Gjentakelser", icon: Repeat },
  { to: "/accounting", label: "Regnskap", icon: Calculator },
];

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <header className="shrink-0 border-b border-blue-100 bg-white">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex text-2xl font-semibold">
            <span className="text-slate-950">Auto</span>
            <span className="text-blue-700">Faktura</span>
          </div>

          <AnimatedIconButton
            icon={User}
            variant={location.pathname === "/profile" ? "primary" : "secondary"}
            size="sm"
            onClick={() => navigate("/profile")}
          >
            Profil
          </AnimatedIconButton>
        </div>

        <nav
          className="flex w-full gap-2 overflow-x-auto pb-1 sm:justify-center"
          aria-label="Hovednavigasjon"
        >
          {navigationItems.slice(0, 2).map((item) => (
              <NavigationButton key={item.to} item={item} pathname={location.pathname} onNavigate={navigate} />
          ))}
          <InvoiceNavigationMenu />
          {navigationItems.slice(2).map((item) => (
              <NavigationButton key={item.to} item={item} pathname={location.pathname} onNavigate={navigate} />
          ))}
        </nav>
      </div>
    </header>
  );
}

type NavigationItem = (typeof navigationItems)[number];

function NavigationButton({
  item,
  pathname,
  onNavigate,
}: {
  item: NavigationItem;
  pathname: string;
  onNavigate: (to: string) => void;
}) {
  return (
    <AnimatedIconButton
      icon={item.icon}
      className="w-40 shrink-0"
      variant={isCurrentRoute(pathname, item.to) ? "primary" : "ghost"}
      size="sm"
      onClick={() => onNavigate(item.to)}
    >
      {item.label}
    </AnimatedIconButton>
  );
}

function InvoiceNavigationMenu() {
  const location = useLocation();
  const navigate = useNavigate();
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 256 });

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const menuWidth = Math.min(256, window.innerWidth - 32);
      setPosition({
        top: bounds.bottom + 8,
        left: Math.max(16, Math.min(bounds.left, window.innerWidth - menuWidth - 16)),
        width: menuWidth,
      });
    }

    function closeOnOutsidePress(event: PointerEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    updatePosition();
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  function cancelClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 140);
  }

  function openRoute(to: string) {
    cancelClose();
    setOpen(false);
    navigate(to);
  }

  return (
    <div
      ref={triggerRef}
      className="shrink-0"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <AnimatedIconButton
        icon={Files}
        className="w-40"
        variant={location.pathname === "/invoices" ? "primary" : "ghost"}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="invoice-navigation-menu"
        onClick={() => {
          cancelClose();
          setOpen(true);
        }}
      >
        Fakturaer
      </AnimatedIconButton>

      {open && createPortal(
        <div
          ref={menuRef}
          id="invoice-navigation-menu"
          role="menu"
          className="fixed z-[80] overflow-hidden rounded-lg border border-blue-100 bg-white p-1.5 shadow-xl shadow-slate-950/15"
          style={{ top: position.top, left: position.left, width: position.width }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-medium text-slate-800 transition hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"
            onClick={() => openRoute("/invoices")}
          >
            <ArrowUpRight size={19} />
            Utgående fakturaer
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-medium text-slate-800 transition hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"
            onClick={() => openRoute("/accounting?tab=incoming")}
          >
            <ArrowDownLeft size={19} />
            Inngående fakturaer
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function isCurrentRoute(pathname: string, route: string) {
  return pathname === route || (route !== "/" && pathname.startsWith(`${route}/`));
}
