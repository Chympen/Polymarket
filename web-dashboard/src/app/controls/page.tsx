'use client';

import { useEffect, useState, useCallback } from 'react';

interface ServiceHealth {
    status: string;
    service?: string;
    mode?: string;
    uptime?: number;
    agents?: string[];
    address?: string;
    schedule?: string;
}

const PRESETS = [
    { name: '1 Min', pattern: '*/1 * * * *' },
    { name: '5 Mins', pattern: '*/5 * * * *' },
    { name: '15 Mins', pattern: '*/15 * * * *' },
    { name: '1 Hour', pattern: '0 * * * *' },
    { name: 'Daily', pattern: '0 0 * * *' },
];

function describeCron(pattern: string) {
    if (pattern === '*/1 * * * *') return 'Runs every minute';
    if (pattern === '*/5 * * * *') return 'Runs every 5 minutes';
    if (pattern === '*/15 * * * *') return 'Runs every 15 minutes';
    if (pattern === '0 * * * *') return 'Runs at the start of every hour';
    if (pattern === '0 0 * * *') return 'Runs once a day at midnight';

    const match = pattern.match(/^\*\/(\d+)\s\*\s\*\s\*\s\*$/);
    if (match) return `Runs every ${match[1]} minutes`;

    return 'Custom schedule pattern';
}

export default function ControlsPage() {
    const [services, setServices] = useState<Record<string, ServiceHealth>>({});
    const [loading, setLoading] = useState(true);
    const [triggerLoading, setTriggerLoading] = useState(false);
    const [reflectLoading, setReflectLoading] = useState(false);
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [schedule, setSchedule] = useState('');
    const [showCustomCron, setShowCustomCron] = useState(false);
    const [lastAction, setLastAction] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const fetchHealth = useCallback(async () => {
        try {
            const res = await fetch('/api/health');
            if (res.ok) {
                const data = await res.json();
                setServices(data.services);
                if (data.services.agent?.schedule) {
                    setSchedule(data.services.agent.schedule);
                }
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

    async function saveSchedule() {
        setScheduleLoading(true);
        setLastAction(null);
        try {
            const res = await fetch('/api/controls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'setSchedule', schedule }),
            });
            const data = await res.json();
            if (res.ok) {
                setLastAction({ message: '✅ Schedule updated successfully!', type: 'success' });
                fetchHealth();
            } else {
                setLastAction({ message: `❌ ${data.error || 'Failed to update schedule'}`, type: 'error' });
            }
        } catch {
            setLastAction({ message: '❌ Failed to connect to agent service', type: 'error' });
        } finally {
            setScheduleLoading(false);
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

            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Automated Trading Schedule</span>
                        <span className={`badge ${services.agent?.status === 'online' ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: 'auto' }}>
                            {services.agent?.status === 'online' ? 'Active' : 'Offline'}
                        </span>
                    </div>

                    <div style={{ padding: '20px 0' }}>
                        <div style={{ marginBottom: 20 }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Quick Presets
                            </p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {PRESETS.map(p => (
                                    <button
                                        key={p.pattern}
                                        className={`btn btn-sm ${schedule === p.pattern ? 'btn-primary' : 'btn-outline'}`}
                                        onClick={() => setSchedule(p.pattern)}
                                        disabled={scheduleLoading || services.agent?.status !== 'online'}
                                    >
                                        {p.name}
                                    </button>
                                ))}
                                <button
                                    className={`btn btn-sm ${showCustomCron ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={() => setShowCustomCron(!showCustomCron)}
                                >
                                    {showCustomCron ? 'Hide Custom' : 'Custom Cron'}
                                </button>
                            </div>
                        </div>

                        {showCustomCron && (
                            <div style={{ marginBottom: 20, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                                    Enter a standard 5-part cron expression (e.g., <code style={{ color: 'var(--color-primary)' }}>*/15 * * * *</code>)
                                </p>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <input
                                        type="text"
                                        className="input"
                                        style={{ maxWidth: 200, fontFamily: 'monospace', letterSpacing: '0.1em' }}
                                        value={schedule}
                                        onChange={(e) => setSchedule(e.target.value)}
                                        placeholder="*/5 * * * *"
                                    />
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--color-success-bg)', borderRadius: 8, border: '1px solid var(--color-success-border)' }}>
                            <div>
                                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{describeCron(schedule)}</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 4 }}>Pattern: {schedule}</p>
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={saveSchedule}
                                disabled={scheduleLoading || !schedule || services.agent?.status !== 'online' || schedule === services.agent?.schedule}
                            >
                                {scheduleLoading ? 'Saving...' : 'Apply Schedule'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
