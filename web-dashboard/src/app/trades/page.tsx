'use client';

import { useEffect, useState, useCallback } from 'react';

interface Trade {
    id: string;
    marketId: string;
    side: string;
    type: string;
    direction: string;
    sizeUsd: number;
    price: number;
    filledPrice: number | null;
    filledSizeUsd: number | null;
    slippage: number | null;
    status: string;
    strategyId: string | null;
    confidence: number | null;
    reasoning: string | null;
    createdAt: string;
    market?: { question: string; conditionId: string };
}

export default function TradesPage() {
    const [trades, setTrades] = useState<Trade[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [strategyFilter, setStrategyFilter] = useState('');

    const fetchTrades = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            if (strategyFilter) params.set('strategy', strategyFilter);
            params.set('limit', '50');

            const res = await fetch(`/api/trades?${params}`);
            if (res.ok) {
                const data = await res.json();
                setTrades(data.trades || []);
                setTotal(data.total || 0);
            }
        } catch (e) {
            console.error('Trades fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, strategyFilter]);

    useEffect(() => {
        fetchTrades();
    }, [fetchTrades]);

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            FILLED: 'badge-success',
            PENDING: 'badge-warning',
            SUBMITTED: 'badge-info',
            FAILED: 'badge-danger',
            CANCELLED: 'badge-neutral',
        };
        return map[status] || 'badge-neutral';
    };

    return (
        <div>
            <div className="page-header">
                <h1>Trade History</h1>
                <p>{total.toLocaleString()} total trades recorded</p>
            </div>

            <div className="filters-bar">
                <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Status</option>
                    <option value="FILLED">Filled</option>
                    <option value="PENDING">Pending</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="FAILED">Failed</option>
                    <option value="CANCELLED">Cancelled</option>
                </select>
                <select className="filter-select" value={strategyFilter} onChange={e => setStrategyFilter(e.target.value)}>
                    <option value="">All Strategies</option>
                    <option value="arbitrage">Arbitrage</option>
                    <option value="momentum">Momentum</option>
                    <option value="mean-reversion">Mean Reversion</option>
                    <option value="sentiment">Sentiment</option>
                    <option value="portfolio-optimization">Portfolio Optimization</option>
                    <option value="meta-allocator">Meta Allocator</option>
                </select>
                <button className="btn btn-outline btn-sm" onClick={fetchTrades} style={{ marginLeft: 'auto' }}>
                    ↻ Refresh
                </button>
            </div>

            <div className="table-container">
                {loading ? (
                    <div style={{ padding: 24 }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                <div className="skeleton" style={{ height: 16, width: '90%', marginBottom: 8 }} />
                                <div className="skeleton" style={{ height: 12, width: '40%' }} />
                            </div>
                        ))}
                    </div>
                ) : trades.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">💹</div>
                        <h3>No trades found</h3>
                        <p>Trades will appear here once the bot starts executing. Try adjusting your filters.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Market</th>
                                <th>Side</th>
                                <th>Direction</th>
                                <th>Size</th>
                                <th>Price</th>
                                <th>Filled Price</th>
                                <th>Slippage</th>
                                <th>Strategy</th>
                                <th>Confidence</th>
                                <th>Status</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trades.map(t => (
                                <tr key={t.id}>
                                    <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {t.market?.question || t.marketId.slice(0, 12) + '...'}
                                    </td>
                                    <td>
                                        <span className={`badge ${t.side === 'YES' ? 'badge-success' : 'badge-danger'}`}>
                                            {t.side}
                                        </span>
                                    </td>
                                    <td>{t.direction}</td>
                                    <td>${t.sizeUsd.toFixed(2)}</td>
                                    <td>{t.price.toFixed(4)}</td>
                                    <td>{t.filledPrice?.toFixed(4) || '—'}</td>
                                    <td>{t.slippage != null ? `${(t.slippage * 100).toFixed(1)}%` : '—'}</td>
                                    <td style={{ fontSize: '0.78rem' }}>{t.strategyId || '—'}</td>
                                    <td>{t.confidence ? `${(t.confidence * 100).toFixed(0)}%` : '—'}</td>
                                    <td><span className={`badge ${statusBadge(t.status)}`}>{t.status}</span></td>
                                    <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                        {new Date(t.createdAt).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
