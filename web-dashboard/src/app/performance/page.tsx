'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false });

interface PerformanceMetric {
    id: string;
    metricDate: string;
    totalPnl: number;
    dailyPnl: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
    portfolioValue: number;
}

interface StrategyScore {
    id: string;
    strategyId: string;
    strategyName: string;
    winRate: number;
    totalTrades: number;
    totalPnl: number;
    sharpeRatio: number;
    maxDrawdown: number;
    weight: number;
}

export default function PerformancePage() {
    const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
    const [strategies, setStrategies] = useState<StrategyScore[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchPerformance() {
            try {
                const res = await fetch('/api/performance');
                if (res.ok) {
                    const data = await res.json();
                    setMetrics(data.metrics || []);
                    setStrategies(data.strategies || []);
                }
            } catch (e) {
                console.error('Performance fetch error:', e);
            } finally {
                setLoading(false);
            }
        }
        fetchPerformance();
    }, []);

    const latest = metrics.length > 0 ? metrics[metrics.length - 1] : null;

    const chartData = metrics.map(m => ({
        date: new Date(m.metricDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        pnl: m.totalPnl,
        daily: m.dailyPnl,
        portfolio: m.portfolioValue,
    }));

    return (
        <div>
            <div className="page-header">
                <h1>Performance Analytics</h1>
                <p>Detailed performance metrics and strategy breakdown</p>
            </div>

            {/* Key Metrics */}
            <div className="section">
                <div className="grid-4">
                    <div className="card">
                        <div className="card-header"><span className="card-title">Sharpe Ratio</span></div>
                        <div className="card-value">{latest?.sharpeRatio?.toFixed(3) || '—'}</div>
                    </div>
                    <div className="card">
                        <div className="card-header"><span className="card-title">Win Rate</span></div>
                        <div className="card-value">{latest ? `${(latest.winRate * 100).toFixed(1)}%` : '—'}</div>
                    </div>
                    <div className="card">
                        <div className="card-header"><span className="card-title">Max Drawdown</span></div>
                        <div className="card-value stat-negative">{latest ? `${(latest.maxDrawdown * 100).toFixed(2)}%` : '—'}</div>
                    </div>
                    <div className="card">
                        <div className="card-header"><span className="card-title">Total P&L</span></div>
                        <div className={`card-value ${(latest?.totalPnl || 0) >= 0 ? 'stat-positive' : 'stat-negative'}`}>
                            ${latest?.totalPnl?.toFixed(2) || '0.00'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Equity Curve */}
            <div className="section">
                <div className="card">
                    <div className="card-header"><span className="card-title">Portfolio Value Over Time</span></div>
                    {loading ? (
                        <div className="skeleton" style={{ height: 300 }} />
                    ) : chartData.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">📈</div>
                            <h3>No performance data yet</h3>
                            <p>Charts will populate as the bot completes trading cycles and records metrics.</p>
                        </div>
                    ) : (
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(55,65,90,0.3)" />
                                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1a1f2e',
                                            border: '1px solid rgba(55,65,90,0.5)',
                                            borderRadius: 10,
                                            color: '#f1f5f9',
                                        }}
                                    />
                                    <Area type="monotone" dataKey="portfolio" stroke="#6366f1" fillOpacity={1} fill="url(#pnlGradient)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* Daily P&L Chart */}
            <div className="section">
                <div className="card">
                    <div className="card-header"><span className="card-title">Daily P&L</span></div>
                    {chartData.length > 0 && (
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(55,65,90,0.3)" />
                                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1a1f2e',
                                            border: '1px solid rgba(55,65,90,0.5)',
                                            borderRadius: 10,
                                            color: '#f1f5f9',
                                        }}
                                    />
                                    <Bar dataKey="daily" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* Strategy Leaderboard */}
            <div className="section">
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Strategy Leaderboard</span>
                        <span className="badge badge-info">{strategies.length} strategies</span>
                    </div>
                    {strategies.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🏆</div>
                            <h3>No strategy data yet</h3>
                            <p>Strategy performance will be tracked after trades are executed.</p>
                        </div>
                    ) : (
                        <div className="table-container" style={{ border: 'none' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th>Strategy</th>
                                        <th>P&L</th>
                                        <th>Win Rate</th>
                                        <th>Sharpe</th>
                                        <th>Trades</th>
                                        <th>Max DD</th>
                                        <th>Weight</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {strategies.map((s, i) => (
                                        <tr key={s.id}>
                                            <td>
                                                <span style={{ fontSize: '1.1rem' }}>
                                                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 600 }}>{s.strategyName}</td>
                                            <td className={s.totalPnl >= 0 ? 'stat-positive' : 'stat-negative'}>
                                                {s.totalPnl >= 0 ? '+' : ''}${s.totalPnl.toFixed(2)}
                                            </td>
                                            <td>{(s.winRate * 100).toFixed(1)}%</td>
                                            <td>{s.sharpeRatio.toFixed(3)}</td>
                                            <td>{s.totalTrades}</td>
                                            <td className="stat-negative">{(s.maxDrawdown * 100).toFixed(2)}%</td>
                                            <td>{s.weight.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
