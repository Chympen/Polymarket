'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './globals.css';

const navItems = [
  {
    section: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', icon: '📊' },
      { href: '/activity', label: 'Activity Feed', icon: '📝' },
    ],
  },
  {
    section: 'Trading',
    items: [
      { href: '/trades', label: 'Trade History', icon: '💹' },
      { href: '/positions', label: 'Positions', icon: '📌' },
      { href: '/performance', label: 'Performance', icon: '📈' },
    ],
  },
  {
    section: 'Risk & Budget',
    items: [
      { href: '/risk', label: 'Risk Management', icon: '🛡️' },
      { href: '/budget', label: 'Budget Manager', icon: '💰' },
    ],
  },
  {
    section: 'System',
    items: [
      { href: '/controls', label: 'Bot Controls', icon: '🎮' },
    ],
  },
];

function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">⚡</div>
          <h1>OpenClaw</h1>
        </div>
        <div className="sidebar-mode">
          <span className="sidebar-mode-dot"></span>
          Simulation Mode
        </div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((section) => (
          <div key={section.section} className="nav-section">
            <div className="nav-section-label">{section.section}</div>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${pathname === item.href ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>OpenClaw Dashboard — Polymarket Trading Bot</title>
        <meta name="description" content="Real-time monitoring and control dashboard for the OpenClaw Polymarket AI trading bot." />
      </head>
      <body>
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
