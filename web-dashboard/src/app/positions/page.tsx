'use client';

import { useEffect, useState } from 'react';

interface Position {
    id: string;
    marketId: string;
    side: string;
    sizeUsd: number;
    avgEntryPrice: number;
    currentPrice: number;
    unrealizedPnl: number;
    realizedPnl: number;
    status: string;
    createdAt: string;
    market?: { question: string; conditionId: string; priceYes: number; priceNo: number };
}

export default function PositionsPage() {
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchPositions() {
            try {
                const res = await fetch('/api/positions');
                if (res.ok) {
                    const data = await res.json();
                    setPositions(data.positions || []);
                }
            } catch (e) {
                console.error('Positions fetch error:', e);
            } finally {
                setLoading(false);
            }
        }
        fetchPositions();
        const interval = setInterval(fetchPositions, 15000);
        return () => clearInterval(interval);
    }, []);

    const totalUnrealized = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const totalSize = positions.reduce((sum, p) => sum + p.sizeUsd, 0);

    return (
        <div>
            <div className="page-header">
                <h1>Open Positions</h1>
                <p>{positions.length} active position{positions.length !== 1 ? 's' : ''} — auto-refreshes every 15s</p>
            </div>

            {/* Summary cards */}
            <div className="section">
                <div className="grid-3">
                    <div className="card">
                        <div className="card-header"><span className="card-title">Total Deployed</span></div>
                        <div className="card-value">${totalSize.toFixed(2)}</div>
                    </div>
                    <div className="card">
                        <div className="card-header"><span className="card-title">Unrealized P&L</span></div>
                        <div className={`card-value ${totalUnrealized >= 0 ? 'stat-positive' : 'stat-negative'}`}>
                            {totalUnrealized >= 0 ? '+' : ''}${totalUnrealized.toFixed(2)}
                        </div>
                    </div>
                    <div className="card">
                        <div className="card-header"><span className="card-title">Positions Count</span></div>
                        <div className="card-value">{positions.length}</div>
                    </div>
                </div>
            </div>

            {/* Positions table */}
            <div className="table-container">
                {loading ? (
                    <div style={{ padding: 24 }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                <div className="skeleton" style={{ height: 16, width: '80%', marginBottom: 8 }} />
                                <div className="skeleton" style={{ height: 12, width: '40%' }} />
                            </div>
                        ))}
                    </div>
                ) : positions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📌</div>
                        <h3>No open positions</h3>
                        <p>Positions will appear here when the bot opens trades on Polymarket.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Market</th>
                                <th>Side</th>
                                <th>Size (USD)</th>
                                <th>Entry Price</th>
                                <th>Current Price</th>
                                <th>Unrealized P&L</th>
                                <th>Realized P&L</th>
                                <th>Return %</th>
                                <th>Opened</th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map(p => {
                                const returnPct = p.avgEntryPrice > 0
                                    ? ((p.currentPrice - p.avgEntryPrice) / p.avgEntryPrice) * 100
                                    : 0;
                                return (
                                    <tr key={p.id}>
                                        <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {p.market?.question || p.marketId.slice(0, 16) + '...'}
                                        </td>
                                        <td>
                                            <span className={`badge ${p.side === 'YES' ? 'badge-success' : 'badge-danger'}`}>
                                                {p.side}
                                            </span>
                                        </td>
                                        <td>${p.sizeUsd.toFixed(2)}</td>
                                        <td>{p.avgEntryPrice.toFixed(4)}</td>
                                        <td>{p.currentPrice.toFixed(4)}</td>
                                        <td className={p.unrealizedPnl >= 0 ? 'stat-positive' : 'stat-negative'}>
                                            {p.unrealizedPnl >= 0 ? '+' : ''}${p.unrealizedPnl.toFixed(2)}
                                        </td>
                                        <td className={p.realizedPnl >= 0 ? 'stat-positive' : 'stat-negative'}>
                                            {p.realizedPnl >= 0 ? '+' : ''}${p.realizedPnl.toFixed(2)}
                                        </td>
                                        <td className={returnPct >= 0 ? 'stat-positive' : 'stat-negative'}>
                                            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                                        </td>
                                        <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                            {new Date(p.createdAt).toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
