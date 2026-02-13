'use client';

import { useEffect, useState } from 'react';

export default function BudgetPage() {
    const [config, setConfig] = useState<BudgetConfig>({
        maxDailyLossUsd: 50, maxWeeklyLossUsd: 200, maxTotalExposureUsd: 1000,
        maxTradeSizeUsd: 50, alertThresholdPercent: 80, tradingPaused: false,
        minConfidence: 0.55, estimatedSlippagePercent: 3.5, minLiquidityUsd: 1000,
        minPriceThreshold: 0.08, maxPriceThreshold: 0.92
    });
    const [metrics, setMetrics] = useState({
        dailyLoss: 0,
        weeklyLoss: 0,
        dailyPnl: 0,
        weeklyPnl: 0,
        currentExposure: 0,
        todayTrades: 0,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editConfig, setEditConfig] = useState<BudgetConfig | null>(null);

    async function fetchBudget() {
        try {
            const res = await fetch('/api/budget');
            if (res.ok) {
                const data = await res.json();
                setConfig(data.config);
                setMetrics(data.metrics);
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

    const exposurePercent = config.maxTotalExposureUsd > 0 ? (metrics.currentExposure / config.maxTotalExposureUsd) * 100 : 0;
    const dailyLossPercent = config.maxDailyLossUsd > 0 ? (metrics.dailyLoss / config.maxDailyLossUsd) * 100 : 0;
    const weeklyLossPercent = config.maxWeeklyLossUsd > 0 ? (metrics.weeklyLoss / config.maxWeeklyLossUsd) * 100 : 0;

    function progressClass(pct: number) {
        if (pct >= 90) return 'danger';
        if (pct >= config.alertThresholdPercent) return 'warning';
        return 'success';
    }

    if (loading) {
        return (
            <div>
                <div className="page-header"><h1>Risk Management</h1></div>
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
                <h1>Risk Management</h1>
                <p>Manage capital protection, exposure limits, and global trading status</p>
            </div>

            {/* Risk Overview */}
            <div className="section">
                <div className="grid-3">
                    <div className="card">
                        <div className="card-header"><span className="card-title">Current Exposure</span></div>
                        <div className="card-value">${metrics.currentExposure.toFixed(2)}</div>
                        <div className="budget-progress">
                            <div className="progress-bar">
                                <div className={`progress-fill ${progressClass(exposurePercent)}`} style={{ width: `${Math.min(exposurePercent, 100)}%` }} />
                            </div>
                            <div className="budget-labels">
                                <span>{exposurePercent.toFixed(0)}% used</span>
                                <span>Limit: ${config.maxTotalExposureUsd.toFixed(0)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header"><span className="card-title">Daily Loss Guard</span></div>
                        <div className={`card-value ${metrics.dailyPnl < 0 ? 'stat-negative' : 'stat-positive'}`}>
                            ${metrics.dailyPnl.toFixed(2)}
                        </div>
                        <div className="budget-progress">
                            <div className="progress-bar">
                                <div className={`progress-fill ${progressClass(dailyLossPercent)}`} style={{ width: `${Math.min(dailyLossPercent, 100)}%` }} />
                            </div>
                            <div className="budget-labels">
                                <span>{dailyLossPercent.toFixed(0)}% of loss limit</span>
                                <span>Limit: ${config.maxDailyLossUsd.toFixed(0)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header"><span className="card-title">Weekly Loss Guard</span></div>
                        <div className={`card-value ${metrics.weeklyPnl < 0 ? 'stat-negative' : 'stat-positive'}`}>
                            ${metrics.weeklyPnl.toFixed(2)}
                        </div>
                        <div className="budget-progress">
                            <div className="progress-bar">
                                <div className={`progress-fill ${progressClass(weeklyLossPercent)}`} style={{ width: `${Math.min(weeklyLossPercent, 100)}%` }} />
                            </div>
                            <div className="budget-labels">
                                <span>{weeklyLossPercent.toFixed(0)}% of loss limit</span>
                                <span>Limit: ${config.maxWeeklyLossUsd.toFixed(0)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Strategy Stats */}
            <div className="section">
                <div className="grid-2">
                    <div className="card">
                        <div className="card-header"><span className="card-title">Trading Status</span></div>
                        <div className="metric-row"><span className="metric-label">Trades Today</span><span className="metric-value">{metrics.todayTrades}</span></div>
                        <div className="metric-row">
                            <span className="metric-label">Execution Status</span>
                            <span className="metric-value">
                                <span className={`badge ${config.tradingPaused ? 'badge-danger' : 'badge-success'}`}>
                                    {config.tradingPaused ? '⏸ PAUSED' : '▶ ACTIVE'}
                                </span>
                            </span>
                        </div>
                        <div className="metric-row"><span className="metric-label">Risk Check Latency</span><span className="metric-value">~12ms</span></div>
                    </div>

                    <div className="card">
                        <div className="card-header"><span className="card-title">Capital Overview</span></div>
                        <div className="metric-row"><span className="metric-label">Daily PnL</span><span className={`metric-value ${metrics.dailyPnl >= 0 ? 'stat-positive' : 'stat-negative'}`}>${metrics.dailyPnl.toFixed(2)}</span></div>
                        <div className="metric-row"><span className="metric-label">Weekly PnL</span><span className={`metric-value ${metrics.weeklyPnl >= 0 ? 'stat-positive' : 'stat-negative'}`}>${metrics.weeklyPnl.toFixed(2)}</span></div>
                        <div className="metric-row"><span className="metric-label">Safety Buffer</span><span className="metric-value">${(config.maxDailyLossUsd - metrics.dailyLoss).toFixed(2)}</span></div>
                    </div>
                </div>
            </div>

            {/* Risk Configuration */}
            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Risk Configuration</span>
                        {!editing ? (
                            <button className="btn btn-outline btn-sm" onClick={() => setEditConfig({ ...config })}>✏️ Edit Guards</button>
                        ) : (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-primary btn-sm" onClick={saveConfig} disabled={saving}>
                                    {saving ? '...' : '💾 Save Changes'}
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditConfig(null)}>Cancel</button>
                            </div>
                        )}
                    </div>

                    <div className="grid-2" style={{ gap: 16 }}>
                        {[
                            { key: 'maxDailyLossUsd', label: 'Max Daily Loss ($)' },
                            { key: 'maxWeeklyLossUsd', label: 'Max Weekly Loss ($)' },
                            { key: 'maxTotalExposureUsd', label: 'Max Total Exposure ($)' },
                            { key: 'maxTradeSizeUsd', label: 'Max Single Trade Size ($)' },
                            { key: 'minConfidence', label: 'Min AI Confidence (0-1)' },
                            { key: 'estimatedSlippagePercent', label: 'Est. Slippage (%)' },
                            { key: 'minLiquidityUsd', label: 'Min Liquidity ($)' },
                            { key: 'minPriceThreshold', label: 'Min Price (0-1)' },
                            { key: 'maxPriceThreshold', label: 'Max Price (0-1)' },
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
                            <span className="metric-label">Master Trading Pause</span>
                            {editing ? (
                                <div className="toggle-switch">
                                    <input type="checkbox" checked={cfg.tradingPaused}
                                        onChange={e => setEditConfig(prev => prev ? { ...prev, tradingPaused: e.target.checked } : null)} />
                                    <span className="toggle-slider" />
                                </div>
                            ) : (
                                <span className={`badge ${config.tradingPaused ? 'badge-danger' : 'badge-success'}`}>
                                    {config.tradingPaused ? 'PAUSED' : 'ACTIVE'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface BudgetConfig {
    maxDailyLossUsd: number;
    maxWeeklyLossUsd: number;
    maxTotalExposureUsd: number;
    maxTradeSizeUsd: number;
    minConfidence: number;
    estimatedSlippagePercent: number;
    minLiquidityUsd: number;
    minPriceThreshold: number;
    maxPriceThreshold: number;
    alertThresholdPercent: number;
    tradingPaused: boolean;
}
