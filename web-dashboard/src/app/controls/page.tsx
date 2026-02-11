'use client';

import { useEffect, useState, useCallback } from 'react';

interface ServiceHealth {
    status: string;
    service?: string;
    mode?: string;
    uptime?: number;
    agents?: string[];
    address?: string;
}

export default function ControlsPage() {
    const [services, setServices] = useState<Record<string, ServiceHealth>>({});
    const [loading, setLoading] = useState(true);
    const [triggerLoading, setTriggerLoading] = useState(false);
    const [reflectLoading, setReflectLoading] = useState(false);
    const [lastAction, setLastAction] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const fetchHealth = useCallback(async () => {
        try {
            const res = await fetch('/api/health');
            if (res.ok) {
                const data = await res.json();
                setServices(data.services);
            }
        } catch (e) {
            console.error('Health fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHealth();
        const interval = setInterval(fetchHealth, 10000);
        return () => clearInterval(interval);
    }, [fetchHealth]);

    async function triggerCycle() {
        setTriggerLoading(true);
        setLastAction(null);
        try {
            const res = await fetch('/api/controls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'trigger-cycle' }),
            });
            const data = await res.json();
            if (res.ok) {
                setLastAction({ message: '✅ Trading cycle triggered successfully!', type: 'success' });
            } else {
                setLastAction({ message: `❌ ${data.error || 'Failed to trigger cycle'}`, type: 'error' });
            }
        } catch {
            setLastAction({ message: '❌ Failed to connect to agent service', type: 'error' });
        } finally {
            setTriggerLoading(false);
        }
    }

    async function triggerReflection() {
        setReflectLoading(true);
        setLastAction(null);
        try {
            const res = await fetch('/api/controls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'self-reflect' }),
            });
            const data = await res.json();
            if (res.ok) {
                setLastAction({ message: '✅ Self-reflection completed!', type: 'success' });
            } else {
                setLastAction({ message: `❌ ${data.error || 'Failed to trigger reflection'}`, type: 'error' });
            }
        } catch {
            setLastAction({ message: '❌ Failed to connect to agent service', type: 'error' });
        } finally {
            setReflectLoading(false);
        }
    }

    function formatUptime(seconds?: number) {
        if (!seconds) return '—';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h ${m}m`;
        return `${h}h ${m}m`;
    }

    return (
        <div>
            <div className="page-header">
                <h1>Bot Controls</h1>
                <p>Start and stop trading cycles, trigger manual actions, and monitor service status</p>
            </div>

            {/* Action Feedback */}
            {lastAction && (
                <div className="section">
                    <div className={`card ${lastAction.type === 'error' ? 'kill-switch-card' : ''}`} style={{
                        borderColor: lastAction.type === 'success' ? 'var(--color-success-border)' : undefined,
                        background: lastAction.type === 'success' ? 'var(--color-success-bg)' : undefined,
                    }}>
                        <p style={{ fontSize: '0.95rem' }}>{lastAction.message}</p>
                    </div>
                </div>
            )}

            {/* Trading Actions */}
            <div className="section">
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>Trading Actions</h2>

                <div className="action-row">
                    <div className="action-row-info">
                        <h3>🔄 Trigger Trading Cycle</h3>
                        <p>Run a full trading cycle: fetch markets → analyze with all agents → build consensus → validate risk → execute trades</p>
                    </div>
                    <button className="btn btn-primary btn-lg" onClick={triggerCycle} disabled={triggerLoading || services.agent?.status !== 'online'}>
                        {triggerLoading ? '⏳ Running...' : '▶ Run Cycle'}
                    </button>
                </div>

                <div className="action-row">
                    <div className="action-row-info">
                        <h3>🧠 Trigger Self-Reflection</h3>
                        <p>Run the meta-allocator self-reflection: reviews past trades, updates strategy weights based on performance</p>
                    </div>
                    <button className="btn btn-outline btn-lg" onClick={triggerReflection} disabled={reflectLoading || services.agent?.status !== 'online'}>
                        {reflectLoading ? '⏳ Reflecting...' : '🧠 Reflect'}
                    </button>
                </div>
            </div>

            {/* Service Status */}
            <div className="section">
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>Service Status</h2>
                <div className="health-grid">
                    {[
                        { key: 'agent', name: 'OpenClaw Agent Service', port: 3001, description: 'AI agents, LLM decisions, trading cycles' },
                        { key: 'risk', name: 'Risk Guardian Service', port: 3002, description: 'Risk validation, kill switch, Monte Carlo' },
                        { key: 'executor', name: 'Trade Executor Service', port: 3003, description: 'Wallet, order execution, blockchain' },
                    ].map(svc => {
                        const health = services[svc.key];
                        const online = health?.status === 'online';
                        return (
                            <div key={svc.key} className="card" style={{ padding: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                    <div className={`health-dot ${online ? 'online' : 'offline'}`} />
                                    <div>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{svc.name}</h3>
                                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{svc.description}</p>
                                    </div>
                                </div>
                                <div className="metric-row"><span className="metric-label">Status</span>
                                    <span className={`badge ${online ? 'badge-success' : 'badge-danger'}`}>{online ? 'Online' : 'Offline'}</span>
                                </div>
                                <div className="metric-row"><span className="metric-label">Port</span><span className="metric-value">{svc.port}</span></div>
                                <div className="metric-row"><span className="metric-label">Uptime</span><span className="metric-value">{formatUptime(health?.uptime)}</span></div>
                                <div className="metric-row"><span className="metric-label">Mode</span><span className="metric-value">{health?.mode || '—'}</span></div>
                                {svc.key === 'agent' && health?.agents && (
                                    <div className="metric-row"><span className="metric-label">Agents</span><span className="metric-value">{health.agents.length} loaded</span></div>
                                )}
                                {svc.key === 'executor' && health?.address && (
                                    <div className="metric-row"><span className="metric-label">Wallet</span>
                                        <span className="metric-value" style={{ fontSize: '0.72rem', fontFamily: 'monospace' }}>{health.address.slice(0, 10)}...{health.address.slice(-8)}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Auto Schedule Info */}
            <div className="section">
                <div className="card">
                    <div className="card-header"><span className="card-title">Automated Schedule</span></div>
                    <div className="metric-row"><span className="metric-label">Trading Cycle</span><span className="metric-value">Every 5 minutes (cron)</span></div>
                    <div className="metric-row"><span className="metric-label">Schedule Pattern</span><span className="metric-value" style={{ fontFamily: 'monospace' }}>*/5 * * * *</span></div>
                    <div className="metric-row">
                        <span className="metric-label">Status</span>
                        <span className={`badge ${services.agent?.status === 'online' ? 'badge-success' : 'badge-danger'}`}>
                            {services.agent?.status === 'online' ? '✅ Running' : '❌ Not Active (Agent Offline)'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
