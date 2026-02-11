'use client';

import { useEffect, useState } from 'react';

interface RiskEvent {
    id: string;
    eventType: string;
    severity: string;
    message: string;
    details: Record<string, unknown>;
    resolved: boolean;
    createdAt: string;
}

export default function RiskPage() {
    const [riskEvents, setRiskEvents] = useState<RiskEvent[]>([]);
    const [killSwitchActive, setKillSwitchActive] = useState(false);
    const [capitalPreservation, setCapitalPreservation] = useState(false);
    const [maxDrawdown, setMaxDrawdown] = useState(0);
    const [dailyPnlPercent, setDailyPnlPercent] = useState(0);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    async function fetchRisk() {
        try {
            const res = await fetch('/api/risk');
            if (res.ok) {
                const data = await res.json();
                setRiskEvents(data.riskEvents || []);
                setKillSwitchActive(data.killSwitchActive);
                setCapitalPreservation(data.capitalPreservation);
                setMaxDrawdown(data.maxDrawdown);
                setDailyPnlPercent(data.dailyPnlPercent);
            }
        } catch (e) {
            console.error('Risk fetch error:', e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchRisk();
        const interval = setInterval(fetchRisk, 10000);
        return () => clearInterval(interval);
    }, []);

    async function handleKillSwitch(action: 'activate-kill-switch' | 'reset-kill-switch') {
        if (action === 'activate-kill-switch' && !confirm('⚠️ Are you sure you want to ACTIVATE the kill switch? This will halt all trading.')) return;
        setActionLoading(true);
        try {
            await fetch('/api/risk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
            await fetchRisk();
        } catch (e) {
            console.error('Kill switch error:', e);
        } finally {
            setActionLoading(false);
        }
    }

    const drawdownPercent = maxDrawdown * 100;
    const drawdownLimit = 3; // 3% kill switch threshold
    const drawdownRatio = Math.min(drawdownPercent / drawdownLimit, 1);

    const severityBadge = (severity: string) => {
        const map: Record<string, string> = { LOW: 'badge-info', MEDIUM: 'badge-warning', HIGH: 'badge-danger', CRITICAL: 'badge-danger' };
        return map[severity] || 'badge-neutral';
    };

    const eventIcon: Record<string, string> = {
        DRAWDOWN_BREACH: '📉', EXPOSURE_BREACH: '🔥', SIZE_REJECT: '🚫',
        KILL_SWITCH: '🚨', CAPITAL_PRESERVATION: '🛡️', VOLATILITY_ADJUSTMENT: '📊',
    };

    return (
        <div>
            <div className="page-header">
                <h1>Risk Management</h1>
                <p>Monitor risk levels, manage the kill switch, and review risk events</p>
            </div>

            {/* Kill Switch */}
            <div className="section">
                <div className={`card kill-switch-card ${killSwitchActive ? 'active' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <span style={{ fontSize: '2.5rem' }}>{killSwitchActive ? '🚨' : '🛡️'}</span>
                            <div>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                    Kill Switch — {killSwitchActive ? 'ACTIVE' : 'Inactive'}
                                </h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>
                                    {killSwitchActive
                                        ? 'All trading is HALTED. Reset when ready to resume.'
                                        : 'Trading is active. Kill switch triggers at 3% daily drawdown.'}
                                </p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {killSwitchActive ? (
                                <button className="btn btn-success btn-lg" onClick={() => handleKillSwitch('reset-kill-switch')} disabled={actionLoading}>
                                    {actionLoading ? '...' : '✅ Reset Kill Switch'}
                                </button>
                            ) : (
                                <button className="btn btn-danger btn-lg" onClick={() => handleKillSwitch('activate-kill-switch')} disabled={actionLoading}>
                                    {actionLoading ? '...' : '🛑 Activate Kill Switch'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Risk Metrics */}
            <div className="section">
                <div className="grid-3">
                    <div className="card">
                        <div className="card-header"><span className="card-title">Max Drawdown</span></div>
                        <div className={`card-value ${drawdownPercent > 2 ? 'stat-negative' : 'stat-neutral'}`}>
                            {drawdownPercent.toFixed(2)}%
                        </div>
                        <div style={{ marginTop: 12 }}>
                            <div className="drawdown-meter">
                                <div
                                    className="drawdown-fill"
                                    style={{
                                        width: `${drawdownRatio * 100}%`,
                                        background: drawdownRatio > 0.8 ? 'linear-gradient(90deg, #ef4444, #f97316)' : drawdownRatio > 0.5 ? 'linear-gradient(90deg, #f59e0b, #eab308)' : 'linear-gradient(90deg, #10b981, #34d399)',
                                    }}
                                />
                                <div className="drawdown-threshold" style={{ left: '100%' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                <span>0%</span>
                                <span>Kill Switch: {drawdownLimit}%</span>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header"><span className="card-title">Daily P&L</span></div>
                        <div className={`card-value ${dailyPnlPercent >= 0 ? 'stat-positive' : 'stat-negative'}`}>
                            {dailyPnlPercent >= 0 ? '+' : ''}{(dailyPnlPercent * 100).toFixed(2)}%
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header"><span className="card-title">Capital Preservation</span></div>
                        <div className="card-value">
                            <span className={`badge ${capitalPreservation ? 'badge-warning' : 'badge-success'}`}>
                                {capitalPreservation ? '⚠️ Active (Sizes Halved)' : '✅ Normal'}
                            </span>
                        </div>
                        <div className="card-subtitle">Triggers at 1.5% drawdown</div>
                    </div>
                </div>
            </div>

            {/* Risk Limits Reference */}
            <div className="section">
                <div className="card">
                    <div className="card-header"><span className="card-title">Risk Limits</span></div>
                    <div className="metric-row"><span className="metric-label">Max Trade Size</span><span className="metric-value">2% of bankroll</span></div>
                    <div className="metric-row"><span className="metric-label">Max Market Exposure</span><span className="metric-value">10% of capital</span></div>
                    <div className="metric-row"><span className="metric-label">Max Daily Drawdown</span><span className="metric-value">3% (kill switch)</span></div>
                    <div className="metric-row"><span className="metric-label">Min Confidence</span><span className="metric-value">55%</span></div>
                    <div className="metric-row"><span className="metric-label">Max Positions</span><span className="metric-value">20</span></div>
                    <div className="metric-row"><span className="metric-label">Max Slippage</span><span className="metric-value">200 bps</span></div>
                </div>
            </div>

            {/* Risk Events Timeline */}
            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Risk Events</span>
                        <span className="badge badge-neutral">{riskEvents.length} events</span>
                    </div>
                    {loading ? (
                        <div style={{ padding: 16 }}>
                            {[1, 2, 3].map(i => (
                                <div key={i} style={{ marginBottom: 12 }}>
                                    <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 6 }} />
                                    <div className="skeleton" style={{ height: 12, width: '30%' }} />
                                </div>
                            ))}
                        </div>
                    ) : riskEvents.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🛡️</div>
                            <h3>No risk events</h3>
                            <p>Risk events will be logged when the risk guardian detects issues.</p>
                        </div>
                    ) : (
                        riskEvents.map(event => (
                            <div key={event.id} className="feed-item">
                                <div className="feed-icon warn">
                                    {eventIcon[event.eventType] || '⚠️'}
                                </div>
                                <div className="feed-content">
                                    <div className="feed-message">{event.message}</div>
                                    <div className="feed-meta">
                                        <span className={`badge ${severityBadge(event.severity)}`}>{event.severity}</span>
                                        <span className="badge badge-neutral">{event.eventType.replace(/_/g, ' ')}</span>
                                        <span>{event.resolved ? '✅ Resolved' : '🔴 Unresolved'}</span>
                                        <span>{new Date(event.createdAt).toLocaleString()}</span>
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
