'use client';

import { useEffect, useState } from 'react';

interface ServiceHealth {
  status: string;
  service?: string;
  mode?: string;
  uptime?: number;
  agents?: string[];
}

interface PortfolioData {
  totalCapital: number;
  availableCapital: number;
  deployedCapital: number;
  totalPnl: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  highWaterMark: number;
  maxDrawdown: number;
  killSwitchActive: boolean;
  capitalPreservation: boolean;
}

interface ActivityItem {
  id: string;
  level: string;
  type: string;
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export default function DashboardPage() {
  const [services, setServices] = useState<Record<string, ServiceHealth>>({});
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [todayTrades, setTodayTrades] = useState(0);
  const [totalTrades, setTotalTrades] = useState(0);
  const [positionCount, setPositionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [healthRes, portfolioRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/portfolio'),
        ]);

        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setServices(healthData.services);
        }

        if (portfolioRes.ok) {
          const pData = await portfolioRes.json();
          setPortfolio(pData.portfolio);
          setActivity(pData.recentActivity || []);
          setTodayTrades(pData.todayTrades || 0);
          setTotalTrades(pData.totalTrades || 0);
          setPositionCount(pData.positions?.length || 0);
        }
      } catch (e) {
        console.error('Dashboard fetch error:', e);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  function formatUptime(seconds?: number) {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  function formatCurrency(val: number) {
    return '$' + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatPercent(val: number) {
    const sign = val >= 0 ? '+' : '';
    return sign + (val * 100).toFixed(2) + '%';
  }

  const levelIcon: Record<string, string> = {
    INFO: 'ℹ️', SUCCESS: '✅', WARN: '⚠️', ERROR: '❌', TRADE: '💹',
  };

  const levelClass: Record<string, string> = {
    INFO: 'info', SUCCESS: 'success', WARN: 'warn', ERROR: 'error', TRADE: 'trade',
  };

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1>Dashboard</h1>
          <p>System overview and real-time status</p>
        </div>
        <div className="grid-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card">
              <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 36, width: '80%' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>System overview and real-time status — auto-refreshes every 15s</p>
      </div>

      {/* Service Health */}
      <div className="section">
        <div className="health-grid">
          {[
            { key: 'agent', name: 'Agent Service', port: 3001 },
            { key: 'risk', name: 'Risk Guardian', port: 3002 },
            { key: 'executor', name: 'Trade Executor', port: 3003 },
          ].map(svc => {
            const health = services[svc.key];
            const online = health?.status === 'online';
            return (
              <div key={svc.key} className="health-tile">
                <div className={`health-dot ${online ? 'online' : 'offline'}`} />
                <div className="health-tile-info">
                  <h3>{svc.name}</h3>
                  <p>
                    {online
                      ? `Port ${svc.port} · Uptime ${formatUptime(health?.uptime)}`
                      : `Port ${svc.port} · Offline`}
                  </p>
                </div>
                <span className={`badge ${online ? 'badge-success' : 'badge-danger'}`}>
                  {online ? 'Online' : 'Offline'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Kill Switch Warning */}
      {portfolio?.killSwitchActive && (
        <div className="section">
          <div className="card kill-switch-card active" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: '2rem' }}>🚨</span>
            <div>
              <h3 style={{ color: 'var(--color-danger)', marginBottom: 4 }}>KILL SWITCH ACTIVE</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Trading is halted. Daily drawdown limit exceeded. Go to Risk Management to reset.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Stats */}
      <div className="section">
        <div className="grid-4">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Total Capital</span>
              <span>💎</span>
            </div>
            <div className="card-value">{formatCurrency(portfolio?.totalCapital || 0)}</div>
            <div className="card-subtitle">
              Available: {formatCurrency(portfolio?.availableCapital || 0)}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Daily P&L</span>
              <span>📊</span>
            </div>
            <div className={`card-value ${(portfolio?.dailyPnl || 0) >= 0 ? 'stat-positive' : 'stat-negative'}`}>
              {formatCurrency(portfolio?.dailyPnl || 0)}
            </div>
            <div className="card-subtitle">
              <span className={(portfolio?.dailyPnlPercent || 0) >= 0 ? 'stat-positive' : 'stat-negative'}>
                {formatPercent(portfolio?.dailyPnlPercent || 0)}
              </span>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Total P&L</span>
              <span>💰</span>
            </div>
            <div className={`card-value ${(portfolio?.totalPnl || 0) >= 0 ? 'stat-positive' : 'stat-negative'}`}>
              {formatCurrency(portfolio?.totalPnl || 0)}
            </div>
            <div className="card-subtitle">
              HWM: {formatCurrency(portfolio?.highWaterMark || 0)}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Deployed</span>
              <span>🚀</span>
            </div>
            <div className="card-value">{formatCurrency(portfolio?.deployedCapital || 0)}</div>
            <div className="card-subtitle">
              {positionCount} open position{positionCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="section">
        <div className="grid-3">
          <div className="card">
            <div className="card-header"><span className="card-title">Today&apos;s Trades</span></div>
            <div className="card-value">{todayTrades}</div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">Total Trades</span></div>
            <div className="card-value">{totalTrades}</div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">Max Drawdown</span></div>
            <div className={`card-value ${(portfolio?.maxDrawdown || 0) > 0.02 ? 'stat-negative' : 'stat-neutral'}`}>
              {((portfolio?.maxDrawdown || 0) * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="section">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Activity</span>
            <a href="/activity" className="btn btn-ghost btn-sm">View All →</a>
          </div>
          {activity.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📝</div>
              <h3>No activity yet</h3>
              <p>Activity will appear here when the bot starts running trading cycles.</p>
            </div>
          ) : (
            activity.slice(0, 8).map(item => (
              <div key={item.id} className="feed-item">
                <div className={`feed-icon ${levelClass[item.level] || 'info'}`}>
                  {levelIcon[item.level] || 'ℹ️'}
                </div>
                <div className="feed-content">
                  <div className="feed-message">{item.message}</div>
                  <div className="feed-meta">
                    <span className={`badge badge-${levelClass[item.level] || 'info'}`}>
                      {item.type}
                    </span>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
