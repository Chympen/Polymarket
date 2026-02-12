'use client';

import { useEffect, useState, useCallback } from 'react';

interface MarketAnalyzed {
    question: string;
    conditionId?: string;
    priceYes: number;
    volume24h: number;
    liquidity: number;
}

interface MarketProcessed {
    question: string;
    signals: number;
    traded: boolean;
    outcome?: string;
}

interface ActivityItem {
    id: string;
    level: string;
    type: string;
    message: string;
    details: Record<string, unknown>;
    createdAt: string;
}

export default function ActivityPage() {
    const [items, setItems] = useState<ActivityItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filterLevel, setFilterLevel] = useState('');
    const [filterType, setFilterType] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchActivity = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (filterLevel) params.set('level', filterLevel);
            if (filterType) params.set('type', filterType);
            params.set('limit', '100');

            const res = await fetch(`/api/activity?${params}`);
            if (res.ok) {
                const data = await res.json();
                setItems(data.items || []);
                setTotal(data.total || 0);
            }
        } catch (e) {
            console.error('Activity fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [filterLevel, filterType]);

    useEffect(() => {
        fetchActivity();
        if (autoRefresh) {
            const interval = setInterval(fetchActivity, 5000);
            return () => clearInterval(interval);
        }
    }, [fetchActivity, autoRefresh]);

    const levelIcon: Record<string, string> = {
        INFO: 'ℹ️', SUCCESS: '✅', WARN: '⚠️', ERROR: '❌', TRADE: '💹',
    };
    const levelClass: Record<string, string> = {
        INFO: 'info', SUCCESS: 'success', WARN: 'warn', ERROR: 'error', TRADE: 'trade',
    };

    const hasDetails = (item: ActivityItem) =>
        item.details && Object.keys(item.details).length > 0;

    const toggleExpand = (id: string) => {
        setExpandedId(prev => prev === id ? null : id);
    };

    const outcomeLabel: Record<string, { text: string; class: string }> = {
        executed: { text: '✅ Executed', class: 'badge-success' },
        no_signal: { text: '— No Signal', class: 'badge-neutral' },
        no_consensus: { text: '⚖️ No Consensus', class: 'badge-info' },
        risk_rejected: { text: '🛡️ Risk Rejected', class: 'badge-warning' },
    };

    function renderDetailPanel(item: ActivityItem) {
        const details = item.details;

        // Markets Analyzed table
        const marketsAnalyzed = details.marketsAnalyzed as MarketAnalyzed[] | undefined;
        if (marketsAnalyzed && Array.isArray(marketsAnalyzed)) {
            return (
                <div className="feed-detail-panel">
                    <div className="detail-section-title">
                        📊 Top {marketsAnalyzed.length} Markets Being Analyzed
                    </div>
                    <div className="table-container" style={{ border: 'none' }}>
                        <table className="market-detail-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '5%' }}>#</th>
                                    <th style={{ width: '50%' }}>Market</th>
                                    <th>Price (Yes)</th>
                                    <th>24h Volume</th>
                                    <th>Liquidity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {marketsAnalyzed.map((m, i) => (
                                    <tr key={i}>
                                        <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                        <td style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {m.question}
                                        </td>
                                        <td>
                                            <span style={{
                                                color: m.priceYes >= 0.7 ? 'var(--color-success)' :
                                                    m.priceYes <= 0.3 ? 'var(--color-danger)' : 'var(--text-primary)',
                                                fontWeight: 600,
                                                fontFamily: 'monospace',
                                            }}>
                                                {(m.priceYes * 100).toFixed(1)}¢
                                            </span>
                                        </td>
                                        <td style={{ fontFamily: 'monospace' }}>
                                            ${m.volume24h >= 1000 ? `${(m.volume24h / 1000).toFixed(1)}k` : m.volume24h.toFixed(0)}
                                        </td>
                                        <td style={{ fontFamily: 'monospace' }}>
                                            ${m.liquidity >= 1000 ? `${(m.liquidity / 1000).toFixed(1)}k` : m.liquidity.toFixed(0)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        // Processed markets summary
        const marketsProcessed = details.marketsProcessed as MarketProcessed[] | undefined;
        if (marketsProcessed && Array.isArray(marketsProcessed)) {
            const traded = marketsProcessed.filter(m => m.traded).length;
            const rejected = marketsProcessed.filter(m => m.outcome === 'risk_rejected').length;
            const noSignal = marketsProcessed.filter(m => m.outcome === 'no_signal').length;
            const noConsensus = marketsProcessed.filter(m => m.outcome === 'no_consensus').length;

            return (
                <div className="feed-detail-panel">
                    <div className="detail-summary-row">
                        <div className="detail-stat">
                            <span className="detail-stat-value stat-positive">{traded}</span>
                            <span className="detail-stat-label">Executed</span>
                        </div>
                        <div className="detail-stat">
                            <span className="detail-stat-value stat-negative">{rejected}</span>
                            <span className="detail-stat-label">Rejected</span>
                        </div>
                        <div className="detail-stat">
                            <span className="detail-stat-value stat-neutral">{noConsensus}</span>
                            <span className="detail-stat-label">No Consensus</span>
                        </div>
                        <div className="detail-stat">
                            <span className="detail-stat-value stat-neutral">{noSignal}</span>
                            <span className="detail-stat-label">No Signal</span>
                        </div>
                    </div>
                    <div className="detail-section-title" style={{ marginTop: 12 }}>
                        Market-by-Market Breakdown
                    </div>
                    <div className="table-container" style={{ border: 'none' }}>
                        <table className="market-detail-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '5%' }}>#</th>
                                    <th style={{ width: '50%' }}>Market</th>
                                    <th>Signals</th>
                                    <th>Outcome</th>
                                </tr>
                            </thead>
                            <tbody>
                                {marketsProcessed.map((m, i) => {
                                    const outcome = outcomeLabel[m.outcome || ''] || { text: m.outcome || '—', class: 'badge-neutral' };
                                    return (
                                        <tr key={i}>
                                            <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                            <td style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {m.question}
                                            </td>
                                            <td style={{ fontFamily: 'monospace' }}>{m.signals}</td>
                                            <td><span className={`badge ${outcome.class}`}>{outcome.text}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        // Trade detail grid (side, confidence, reasons, size, etc.)
        const knownKeys = ['side', 'confidence', 'signals', 'reasons', 'size'];
        const tradeDetails = Object.entries(details).filter(([k]) => knownKeys.includes(k));
        if (tradeDetails.length > 0) {
            return (
                <div className="feed-detail-panel">
                    <div className="detail-grid">
                        {tradeDetails.map(([key, value]) => (
                            <div key={key} className="detail-grid-item">
                                <span className="detail-grid-label">{key}</span>
                                <span className="detail-grid-value">
                                    {typeof value === 'number'
                                        ? key === 'confidence' ? `${(value * 100).toFixed(1)}%`
                                            : key === 'size' ? `$${value.toFixed(2)}`
                                                : value
                                        : Array.isArray(value) ? value.join(', ')
                                            : String(value)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // Fallback: formatted JSON
        return (
            <div className="feed-detail-panel">
                <pre className="detail-json">
                    {JSON.stringify(details, null, 2)}
                </pre>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1>Activity Feed</h1>
                <p>Granular log of every action the bot takes — {total.toLocaleString()} total events</p>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <select className="filter-select" value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
                    <option value="">All Levels</option>
                    <option value="INFO">Info</option>
                    <option value="SUCCESS">Success</option>
                    <option value="WARN">Warning</option>
                    <option value="ERROR">Error</option>
                    <option value="TRADE">Trade</option>
                </select>
                <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="">All Types</option>
                    <option value="SYSTEM">System</option>
                    <option value="ANALYSIS">Analysis</option>
                    <option value="RISK">Risk</option>
                    <option value="EXECUTION">Execution</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Auto-refresh (5s)
                    <div className="toggle-switch">
                        <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
                        <span className="toggle-slider" />
                    </div>
                </label>
            </div>

            {/* Activity List */}
            <div className="card" style={{ padding: 0 }}>
                {loading ? (
                    <div style={{ padding: 24 }}>
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                                <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 8 }} />
                                <div className="skeleton" style={{ height: 12, width: '30%' }} />
                            </div>
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📝</div>
                        <h3>No activity logs found</h3>
                        <p>Activity will appear here when the bot starts running. Try adjusting your filters or start a trading cycle.</p>
                    </div>
                ) : (
                    items.map(item => (
                        <div key={item.id}>
                            <div
                                className={`feed-item ${hasDetails(item) ? 'feed-item-expandable' : ''} ${expandedId === item.id ? 'feed-item-expanded' : ''}`}
                                onClick={() => hasDetails(item) && toggleExpand(item.id)}
                            >
                                <div className={`feed-icon ${levelClass[item.level] || 'info'}`}>
                                    {levelIcon[item.level] || 'ℹ️'}
                                </div>
                                <div className="feed-content">
                                    <div className="feed-message">{item.message}</div>
                                    <div className="feed-meta">
                                        <span className={`badge badge-${item.level === 'TRADE' ? 'trade' : item.level === 'SUCCESS' ? 'success' : item.level === 'WARN' ? 'warning' : item.level === 'ERROR' ? 'danger' : 'info'}`}>
                                            {item.level}
                                        </span>
                                        <span className="badge badge-neutral">{item.type}</span>
                                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                                    </div>
                                </div>
                                {hasDetails(item) && (
                                    <div className="feed-chevron">
                                        {expandedId === item.id ? '▾' : '▸'}
                                    </div>
                                )}
                            </div>
                            {expandedId === item.id && hasDetails(item) && renderDetailPanel(item)}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
