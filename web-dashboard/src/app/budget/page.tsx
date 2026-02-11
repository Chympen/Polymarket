'use client';

import { useEffect, useState } from 'react';

interface BudgetConfig {
    maxDailyAiSpend: number;
    maxMonthlyAiSpend: number;
    maxTotalTradeSpend: number;
    maxTradeSize: number;
    alertThresholdPercent: number;
    aiSpendingPaused: boolean;
}

interface PurposeBreakdown {
    purpose: string;
    _sum: { costUsd: number };
    _count: number;
}

export default function BudgetPage() {
    const [config, setConfig] = useState<BudgetConfig>({
        maxDailyAiSpend: 10, maxMonthlyAiSpend: 200, maxTotalTradeSpend: 1000,
        maxTradeSize: 50, alertThresholdPercent: 80, aiSpendingPaused: false,
    });
    const [dailyAiSpend, setDailyAiSpend] = useState(0);
    const [monthlyAiSpend, setMonthlyAiSpend] = useState(0);
    const [monthlyAiCalls, setMonthlyAiCalls] = useState(0);
    const [monthlyTokens, setMonthlyTokens] = useState(0);
    const [totalTradeSpend, setTotalTradeSpend] = useState(0);
    const [purposeBreakdown, setPurposeBreakdown] = useState<PurposeBreakdown[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editConfig, setEditConfig] = useState<BudgetConfig | null>(null);

    async function fetchBudget() {
        try {
            const res = await fetch('/api/budget');
            if (res.ok) {
                const data = await res.json();
                setConfig(data.config);
                setDailyAiSpend(data.dailyAiSpend);
                setMonthlyAiSpend(data.monthlyAiSpend);
                setMonthlyAiCalls(data.monthlyAiCalls);
                setMonthlyTokens(data.monthlyTokens);
                setTotalTradeSpend(data.totalTradeSpend);
                setPurposeBreakdown(data.purposeBreakdown || []);
            }
        } catch (e) {
            console.error('Budget fetch error:', e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchBudget();
        const interval = setInterval(fetchBudget, 30000);
        return () => clearInterval(interval);
    }, []);

    async function saveConfig() {
        if (!editConfig) return;
        setSaving(true);
        try {
            await fetch('/api/budget', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editConfig),
            });
            setConfig(editConfig);
            setEditConfig(null);
            await fetchBudget();
        } catch (e) {
            console.error('Save config error:', e);
        } finally {
            setSaving(false);
        }
    }

    const dailyPercent = config.maxDailyAiSpend > 0 ? (dailyAiSpend / config.maxDailyAiSpend) * 100 : 0;
    const monthlyPercent = config.maxMonthlyAiSpend > 0 ? (monthlyAiSpend / config.maxMonthlyAiSpend) * 100 : 0;
    const tradePercent = config.maxTotalTradeSpend > 0 ? (totalTradeSpend / config.maxTotalTradeSpend) * 100 : 0;

    function progressClass(pct: number) {
        if (pct >= 90) return 'danger';
        if (pct >= config.alertThresholdPercent) return 'warning';
        return 'success';
    }

    const purposeColors: Record<string, string> = {
        trade_decision: '#6366f1',
        market_analysis: '#3b82f6',
        sentiment: '#8b5cf6',
        portfolio_optimization: '#10b981',
    };

    if (loading) {
        return (
            <div>
                <div className="page-header"><h1>Budget Manager</h1></div>
                <div className="grid-3">
                    {[1, 2, 3].map(i => <div key={i} className="card"><div className="skeleton" style={{ height: 100 }} /></div>)}
                </div>
            </div>
        );
    }

    const editing = editConfig !== null;
    const cfg = editing ? editConfig! : config;

    return (
        <div>
            <div className="page-header">
                <h1>Budget Manager</h1>
                <p>Track AI costs, manage spending limits, and prevent overspending</p>
            </div>

            {/* AI Spending Overview */}
            <div className="section">
                <div className="grid-3">
                    <div className="card">
                        <div className="card-header"><span className="card-title">Today&apos;s AI Spend</span></div>
                        <div className={`card-value ${dailyPercent >= 90 ? 'stat-negative' : ''}`}>
                            ${dailyAiSpend.toFixed(2)}
                        </div>
                        <div className="budget-progress">
                            <div className="progress-bar">
                                <div className={`progress-fill ${progressClass(dailyPercent)}`} style={{ width: `${Math.min(dailyPercent, 100)}%` }} />
                            </div>
                            <div className="budget-labels">
                                <span>{dailyPercent.toFixed(0)}% used</span>
                                <span>Limit: ${config.maxDailyAiSpend.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header"><span className="card-title">Monthly AI Spend</span></div>
                        <div className={`card-value ${monthlyPercent >= 90 ? 'stat-negative' : ''}`}>
                            ${monthlyAiSpend.toFixed(2)}
                        </div>
                        <div className="budget-progress">
                            <div className="progress-bar">
                                <div className={`progress-fill ${progressClass(monthlyPercent)}`} style={{ width: `${Math.min(monthlyPercent, 100)}%` }} />
                            </div>
                            <div className="budget-labels">
                                <span>{monthlyPercent.toFixed(0)}% used</span>
                                <span>Limit: ${config.maxMonthlyAiSpend.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header"><span className="card-title">Total Trade Spend</span></div>
                        <div className="card-value">${totalTradeSpend.toFixed(2)}</div>
                        <div className="budget-progress">
                            <div className="progress-bar">
                                <div className={`progress-fill ${progressClass(tradePercent)}`} style={{ width: `${Math.min(tradePercent, 100)}%` }} />
                            </div>
                            <div className="budget-labels">
                                <span>{tradePercent.toFixed(0)}% used</span>
                                <span>Limit: ${config.maxTotalTradeSpend.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Usage Stats */}
            <div className="section">
                <div className="grid-2">
                    <div className="card">
                        <div className="card-header"><span className="card-title">AI Usage This Month</span></div>
                        <div className="metric-row"><span className="metric-label">API Calls</span><span className="metric-value">{monthlyAiCalls.toLocaleString()}</span></div>
                        <div className="metric-row"><span className="metric-label">Total Tokens</span><span className="metric-value">{monthlyTokens.toLocaleString()}</span></div>
                        <div className="metric-row"><span className="metric-label">Avg Cost per Call</span><span className="metric-value">${monthlyAiCalls > 0 ? (monthlyAiSpend / monthlyAiCalls).toFixed(4) : '0.00'}</span></div>
                        <div className="metric-row">
                            <span className="metric-label">AI Spending</span>
                            <span className="metric-value">
                                <span className={`badge ${config.aiSpendingPaused ? 'badge-danger' : 'badge-success'}`}>
                                    {config.aiSpendingPaused ? '⏸ Paused' : '▶ Active'}
                                </span>
                            </span>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header"><span className="card-title">Cost by Purpose</span></div>
                        {purposeBreakdown.length === 0 ? (
                            <div className="empty-state" style={{ padding: '24px 0' }}>
                                <p style={{ fontSize: '0.85rem' }}>No AI costs recorded yet</p>
                            </div>
                        ) : (
                            purposeBreakdown.map(p => {
                                const pct = monthlyAiSpend > 0 ? ((p._sum.costUsd || 0) / monthlyAiSpend) * 100 : 0;
                                return (
                                    <div key={p.purpose} style={{ marginBottom: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>{p.purpose.replace(/_/g, ' ')}</span>
                                            <span style={{ fontWeight: 600 }}>${(p._sum.costUsd || 0).toFixed(2)} ({pct.toFixed(0)}%)</span>
                                        </div>
                                        <div className="progress-bar" style={{ height: 6 }}>
                                            <div style={{
                                                height: '100%', width: `${pct}%`, borderRadius: 'inherit',
                                                background: purposeColors[p.purpose] || 'var(--accent-primary)',
                                            }} />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Budget Configuration */}
            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Budget Configuration</span>
                        {!editing ? (
                            <button className="btn btn-outline btn-sm" onClick={() => setEditConfig({ ...config })}>✏️ Edit Limits</button>
                        ) : (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-primary btn-sm" onClick={saveConfig} disabled={saving}>
                                    {saving ? '...' : '💾 Save'}
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditConfig(null)}>Cancel</button>
                            </div>
                        )}
                    </div>

                    <div className="grid-2" style={{ gap: 16 }}>
                        {[
                            { key: 'maxDailyAiSpend', label: 'Max Daily AI Spend ($)' },
                            { key: 'maxMonthlyAiSpend', label: 'Max Monthly AI Spend ($)' },
                            { key: 'maxTotalTradeSpend', label: 'Max Total Trade Spend ($)' },
                            { key: 'maxTradeSize', label: 'Max Single Trade Size ($)' },
                            { key: 'alertThresholdPercent', label: 'Alert Threshold (%)' },
                        ].map(field => (
                            <div key={field.key} className="metric-row" style={{ padding: '8px 0' }}>
                                <span className="metric-label">{field.label}</span>
                                {editing ? (
                                    <input
                                        className="input"
                                        type="number"
                                        style={{ width: 120, textAlign: 'right' }}
                                        value={cfg[field.key as keyof BudgetConfig] as number}
                                        onChange={e => setEditConfig(prev => prev ? { ...prev, [field.key]: parseFloat(e.target.value) || 0 } : null)}
                                    />
                                ) : (
                                    <span className="metric-value">
                                        {field.key.includes('Percent') ? `${cfg[field.key as keyof BudgetConfig]}%` : `$${cfg[field.key as keyof BudgetConfig]}`}
                                    </span>
                                )}
                            </div>
                        ))}

                        <div className="metric-row" style={{ padding: '8px 0' }}>
                            <span className="metric-label">Pause AI Spending</span>
                            {editing ? (
                                <div className="toggle-switch">
                                    <input type="checkbox" checked={cfg.aiSpendingPaused}
                                        onChange={e => setEditConfig(prev => prev ? { ...prev, aiSpendingPaused: e.target.checked } : null)} />
                                    <span className="toggle-slider" />
                                </div>
                            ) : (
                                <span className={`badge ${config.aiSpendingPaused ? 'badge-danger' : 'badge-success'}`}>
                                    {config.aiSpendingPaused ? 'Paused' : 'Active'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
