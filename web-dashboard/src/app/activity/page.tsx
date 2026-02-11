'use client';

import { useEffect, useState, useCallback } from 'react';

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
                        <div key={item.id} className="feed-item">
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
                                {item.details && Object.keys(item.details).length > 0 && (
                                    <pre style={{
                                        marginTop: 6,
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        background: 'var(--bg-input)',
                                        padding: '6px 10px',
                                        borderRadius: 'var(--radius-sm)',
                                        overflow: 'auto',
                                    }}>
                                        {JSON.stringify(item.details, null, 2)}
                                    </pre>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
