import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  Files,
  LayoutDashboard,
  Menu,
  Repeat,
  Store,
  User,
  X,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  function openRoute(to: string) {
    setMobileMenuOpen(false);
    navigate(to);
  }

  return (
    <header className="shrink-0 border-b border-blue-100 bg-white">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex text-2xl font-semibold">
            <span className="text-slate-950">Auto</span>
            <span className="text-blue-700">Faktura</span>
          </div>

          <div className="hidden lg:block">
            <AnimatedIconButton
              icon={User}
              variant={location.pathname === "/profile" ? "primary" : "secondary"}
              size="sm"
              onClick={() => navigate("/profile")}
            >
              Profil
            </AnimatedIconButton>
          </div>

          <AnimatedIconButton
            icon={mobileMenuOpen ? X : Menu}
            className="h-10 w-10 !p-0 lg:hidden"
            variant="secondary"
            size="sm"
            aria-label={mobileMenuOpen ? "Lukk meny" : "Åpne meny"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span className="sr-only">{mobileMenuOpen ? "Lukk meny" : "Åpne meny"}</span>
          </AnimatedIconButton>
        </div>

        <nav
          className="hidden w-full gap-2 overflow-x-auto pb-1 lg:flex lg:justify-center"
          aria-label="Hovednavigasjon"
        >
          {navigationItems.slice(0, 2).map((item) => (
              <NavigationButton key={item.to} item={item} pathname={location.pathname} onNavigate={navigate} />
          ))}
          <PaymentNavigationMenu />
          {navigationItems.slice(2).map((item) => (
              <NavigationButton key={item.to} item={item} pathname={location.pathname} onNavigate={navigate} />
          ))}
        </nav>

        {mobileMenuOpen && (
          <nav
            id="mobile-navigation"
            className="grid gap-2 border-t border-blue-100 pt-4 lg:hidden"
            aria-label="Mobilnavigasjon"
          >
            {navigationItems.slice(0, 2).map((item) => (
              <MobileNavigationButton key={item.to} item={item} pathname={location.pathname} onNavigate={openRoute} />
            ))}
            <div className="grid gap-2 rounded-md border border-blue-100 bg-slate-50 p-2">
              <MobileMenuButton
                icon={ArrowUpRight}
                active={location.pathname === "/invoices"}
                onClick={() => openRoute("/invoices")}
              >
                Utbetalinger
              </MobileMenuButton>
              <MobileMenuButton
                icon={ArrowDownLeft}
                active={location.pathname.startsWith("/payments")}
                onClick={() => openRoute("/payments/incoming")}
              >
                Innbetalinger
              </MobileMenuButton>
            </div>
            {navigationItems.slice(2).map((item) => (
              <MobileNavigationButton key={item.to} item={item} pathname={location.pathname} onNavigate={openRoute} />
            ))}
            <MobileMenuButton
              icon={User}
              active={location.pathname === "/profile"}
              onClick={() => openRoute("/profile")}
            >
              Profil
            </MobileMenuButton>
          </nav>
        )}
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

function MobileNavigationButton({
  item,
  pathname,
  onNavigate,
}: {
  item: NavigationItem;
  pathname: string;
  onNavigate: (to: string) => void;
}) {
  return (
    <MobileMenuButton
      icon={item.icon}
      active={isCurrentRoute(pathname, item.to)}
      onClick={() => onNavigate(item.to)}
    >
      {item.label}
    </MobileMenuButton>
  );
}

function MobileMenuButton({
  children,
  icon: Icon,
  active,
  onClick,
}: {
  children: string;
  icon: NavigationItem["icon"];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 ${
        active
          ? "border-blue-700 bg-blue-700 text-white shadow-sm"
          : "border-blue-100 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50"
      }`}
      onClick={onClick}
    >
      <Icon size={20} />
      <span>{children}</span>
    </button>
  );
}

function PaymentNavigationMenu() {
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
        variant={location.pathname === "/invoices" || location.pathname.startsWith("/payments") ? "primary" : "ghost"}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="payment-navigation-menu"
        onClick={() => {
          cancelClose();
          setOpen(true);
        }}
      >
        Betalinger
      </AnimatedIconButton>

      {open && createPortal(
        <div
          ref={menuRef}
          id="payment-navigation-menu"
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
            Utbetalinger
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-medium text-slate-800 transition hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"
            onClick={() => openRoute("/payments/incoming")}
          >
            <ArrowDownLeft size={19} />
            Innbetalinger
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
