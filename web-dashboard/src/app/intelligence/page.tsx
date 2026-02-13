'use client';

import { useState, useEffect } from 'react';
import { agentApi } from '@/lib/api';

// Types for our smart data (mirrors backend types)
interface SmartOverview {
    feedback: {
        winRate: number;
        totalTrades: number;
        averageWeight: number;
        recentOutcomes: any[];
    };
    memory: {
        totalMemories: number;
        activeRules: number;
        recentlyApplied: any[];
    };
    regime: {
        current: string;
        volatility: number;
        trendStrength: number;
        history: any[];
    };
    postMortem: {
        totalMistakes: number;
        topCategory: string;
        recentNotes: any[];
    };
    clusters: {
        totalClusters: number;
        highExposure: number;
        clusters: any[];
    };
}

export default function IntelligencePage() {
    const [activeTab, setActiveTab] = useState('overviews');
    const [data, setData] = useState<SmartOverview | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Fetch data on mount and every 30s
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    async function fetchData() {
        try {
            // In a real app we'd fetch from our new /api/intelligence endpoint
            // capable of aggregating all this. For now we'll simulate or mock if needed,
            // but ideally we hit the real agent service.
            const res = await fetch('/api/intelligence');
            if (!res.ok) throw new Error('Failed to fetch intelligence data');
            const json = await res.json();
            setData(json);
            setLastUpdated(new Date());
        } catch (error) {
            console.error('Error fetching intelligence data:', error);
        } finally {
            setIsLoading(false);
        }
    }

    // ── Render Helpers ──

    const renderMetricCard = (title: string, value: string | number, subtext: string, icon: string, color: string = 'text-primary') => (
        <div className="card p-5">
            <div className="flex justify-between items-start mb-2">
                <h3 className="text-sm font-medium text-muted">{title}</h3>
                <span className="text-xl">{icon}</span>
            </div>
            <div className={`text-2xl font-bold mb-1 ${color}`}>{value}</div>
            <div className="text-xs text-muted">{subtext}</div>
        </div>
    );

    const renderTabButton = (id: string, label: string, icon: string) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === id
                ? 'bg-accent text-white shadow-md'
                : 'text-muted hover:text-primary hover:bg-white/5'
                }`}
        >
            <span>{icon}</span>
            {label}
        </button>
    );

    // ── Tab Content Renderers ──

    const renderOverview = () => {
        if (!data) return null;
        return (
            <div className="space-y-6">
                {/* Top High-Level Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {renderMetricCard(
                        'Current Regime',
                        data.regime?.current?.replace('_', ' ') || 'UNKNOWN',
                        `Vol: ${((data.regime?.volatility || 0) * 100).toFixed(1)}% | Trend: ${((data.regime?.trendStrength || 0) * 100).toFixed(1)}%`,
                        '🌡️',
                        'text-accent'
                    )}
                    {renderMetricCard(
                        'Win Rate (Feedback)',
                        `${(data.feedback.winRate * 100).toFixed(1)}%`,
                        `${data.feedback.totalTrades} total trades tracked`,
                        '🔄',
                        data.feedback.winRate > 0.5 ? 'text-success' : 'text-warning'
                    )}
                    {renderMetricCard(
                        'Active Memories',
                        data.memory.activeRules,
                        `${data.memory.totalMemories} total cases indexed`,
                        '🧠'
                    )}
                    {renderMetricCard(
                        'Cluster Exposure',
                        `${data.clusters.highExposure} High Risk`,
                        `${data.clusters.totalClusters} total market clusters`,
                        '🔗',
                        data.clusters.highExposure > 0 ? 'text-danger' : 'text-success'
                    )}
                </div>

                {/* Recent Activity Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="card p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <span className="text-xl">📝</span> Recent Post-Mortems
                        </h3>
                        <div className="space-y-3">
                            {(data.postMortem?.recentNotes || []).length === 0 ? (
                                <div className="empty-state">No recent major losses analyzed.</div>
                            ) : (
                                data.postMortem.recentNotes.map((note: any, i: number) => (
                                    <div key={i} className="p-3 bg-bg-input rounded-md border border-border-subtle">
                                        <div className="flex justify-between mb-1">
                                            <span className="font-medium text-danger text-sm">{note.category}</span>
                                            <span className="text-xs text-muted">{new Date(note.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-sm text-secondary line-clamp-2">{note.content}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="card p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <span className="text-xl">🔄</span> Recent Strategy Feedback
                        </h3>
                        <div className="space-y-3">
                            {(data.feedback?.recentOutcomes || []).length === 0 ? (
                                <div className="empty-state">No recent trade feedback.</div>
                            ) : (
                                data.feedback.recentOutcomes.slice(0, 5).map((outcome: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-2 border-b border-border-subtle last:border-0">
                                        <div>
                                            <div className="text-sm font-medium">{outcome.symbol || 'Unknown Market'}</div>
                                            <div className="text-xs text-muted">{outcome.strategyId}</div>
                                        </div>
                                        <div className={`text-sm font-bold ${outcome.pnl > 0 ? 'text-success' : 'text-danger'}`}>
                                            {outcome.pnl > 0 ? '+' : ''}{outcome.pnl.toFixed(2)} USD
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderFeedbackTab = () => (
        <div className="card p-6">
            <h3 className="text-lg font-semibold mb-6">Strategy Performance Feedback Loop</h3>
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Strategy</th>
                            <th>Market</th>
                            <th>Result</th>
                            <th>PnL</th>
                            <th>New Weight</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(data?.feedback?.recentOutcomes || []).map((outcome: any, i: number) => (
                            <tr key={i}>
                                <td>{new Date(outcome.timestamp).toLocaleString()}</td>
                                <td><span className="badge">{outcome.strategyId}</span></td>
                                <td className="max-w-[200px] truncate" title={outcome.symbol || 'Unknown'}>{outcome.symbol || 'Unknown'}</td>
                                <td>
                                    <span className={`badge ${outcome.pnl > 0 ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`}>
                                        {outcome.pnl > 0 ? 'WIN' : 'LOSS'}
                                    </span>
                                </td>
                                <td className={outcome.pnl > 0 ? 'text-success' : 'text-danger'}>
                                    ${outcome.pnl.toFixed(2)}
                                </td>
                                <td>{(outcome.newWeight || 1.0).toFixed(3)}x</td>
                            </tr>
                        ))}
                        {!data?.feedback.recentOutcomes.length && (
                            <tr><td colSpan={6} className="text-center py-8 text-muted">No feedback data available yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderMemoryTab = () => (
        <div className="space-y-6">
            <div className="card p-6">
                <h3 className="text-lg font-semibold mb-2">Active Correction Rules (Long-Term Memory)</h3>
                <p className="text-sm text-muted mb-6">These rules are injected into the LLM prompt when similar market conditions are detected.</p>

                <div className="grid gap-4">
                    {(data?.memory?.recentlyApplied || []).map((item: any, i: number) => (
                        <div key={i} className="border border-border-primary rounded-lg p-4 bg-bg-card-hover">
                            <div className="flex justify-between items-start mb-2">
                                <span className="badge bg-accent-subtle text-accent">Rule #{item.id?.slice(0, 8) || 'unknown'}</span>
                                <span className="text-xs text-muted">Applied {item.applyCount} times</span>
                            </div>
                            <p className="text-sm font-medium mb-1">{item.content}</p>
                            <div className="text-xs text-muted mt-2">
                                <strong>Trigger:</strong> Found similar past mistake regarding "{item.triggerKeyword}"
                            </div>
                        </div>
                    ))}
                    {!data?.memory.recentlyApplied.length && (
                        <div className="empty-state">No active memory rules have been triggered recently.</div>
                    )}
                </div>
            </div>
        </div>
    );

    const renderRegimeTab = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card p-6 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center text-3xl mb-4">
                        🌡️
                    </div>
                    <h3 className="text-xl font-bold mb-1">{data?.regime?.current?.replace('_', ' ') || 'UNKNOWN'}</h3>
                    <p className="text-muted text-sm">Current Detected Market Regime</p>
                </div>
                <div className="card p-6">
                    <h4 className="text-sm font-medium text-muted mb-4">Market Vitals</h4>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span>Volatility Index</span>
                                <span>{((data?.regime.volatility || 0) * 100).toFixed(1)}%</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill warning" style={{ width: `${(data?.regime.volatility || 0) * 100}%` }}></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span>Trend Strength</span>
                                <span>{((data?.regime.trendStrength || 0) * 100).toFixed(1)}%</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${(data?.regime.trendStrength || 0) * 100}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card p-6">
                <h3 className="text-lg font-semibold mb-4">Regime History</h3>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Regime Detected</th>
                                <th>Volatility</th>
                                <th>Liquidity Score</th>
                                <th>Action Taken</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data?.regime?.history || []).map((snap: any, i: number) => (
                                <tr key={i}>
                                    <td>{new Date(snap.timestamp).toLocaleString()}</td>
                                    <td><span className="badge bg-secondary-subtle">{snap.regime}</span></td>
                                    <td>{(snap.volatility * 100).toFixed(1)}%</td>
                                    <td>{snap.liquidityScore?.toFixed(2) || 'N/A'}</td>
                                    <td><span className="text-xs font-mono">{JSON.stringify(snap.multipliers)}</span></td>
                                </tr>
                            ))}
                            {!data?.regime.history.length && (
                                <tr><td colSpan={5} className="text-center py-8 text-muted">No regime history recorded yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderPostMortemTab = () => (
        <div className="card p-6">
            <h3 className="text-lg font-semibold mb-6">Loss Analysis (Post-Mortems)</h3>
            <div className="grid gap-4">
                {(data?.postMortem?.recentNotes || []).map((note: any, i: number) => (
                    <div key={i} className="border border-danger-border rounded-lg p-5 bg-danger-bg-subtle relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-danger"></div>
                        <div className="flex justify-between mb-2">
                            <h4 className="font-bold text-danger flex items-center gap-2">
                                Analysis #{note.id?.slice(0, 6) || 'unknown'}
                                <span className="text-xs font-normal text-muted px-2 py-0.5 bg-bg-card rounded border border-border-subtle">{note.category}</span>
                            </h4>
                            <span className="text-xs text-muted">{new Date(note.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-sm mb-3">{note.content}</p>
                        <div className="bg-bg-card p-3 rounded text-xs font-mono text-secondary border border-border-subtle">
                            <strong>Learned Rule:</strong> "{note.correctionRule}"
                        </div>
                    </div>
                ))}
                {!data?.postMortem.recentNotes.length && (
                    <div className="empty-state">No post-mortems generated yet. (Good news!)</div>
                )}
            </div>
        </div>
    );

    const renderClustersTab = () => (
        <div className="space-y-6">
            <div className="card p-6">
                <h3 className="text-lg font-semibold mb-2">Market Correlation Clusters</h3>
                <p className="text-sm text-muted mb-6">Markets are grouped by correlation to prevent over-exposure to single topics (e.g., "Middle East Conflict" or "US Politics").</p>

                <div className="space-y-6">
                    {(data?.clusters?.clusters || []).map((cluster: any, i: number) => (
                        <div key={i}>
                            <div className="flex justify-between items-end mb-1">
                                <div>
                                    <h4 className="font-semibold text-sm">{cluster.name}</h4>
                                    <span className="text-xs text-muted">{cluster.marketCount} markets</span>
                                </div>
                                <div className="text-right">
                                    <span className={`text-sm font-bold ${cluster.exposure > cluster.limit ? 'text-danger' : 'text-success'}`}>
                                        ${cluster.exposure.toFixed(0)} / ${cluster.limit.toFixed(0)}
                                    </span>
                                    <div className="text-xs text-muted">Exposure Used</div>
                                </div>
                            </div>
                            <div className="progress-bar">
                                <div
                                    className={`progress-fill ${cluster.exposure > cluster.limit ? 'danger' : 'success'}`}
                                    style={{ width: `${Math.min((cluster.exposure / cluster.limit) * 100, 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    ))}
                    {!data?.clusters.clusters.length && (
                        <div className="empty-state">No market clusters identified yet.</div>
                    )}
                </div>
            </div>
        </div>
    );


    // ── Main Render ──

    if (isLoading) {
        return (
            <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
                <h1 className="text-2xl font-bold mb-6">🧠 AI Intelligence</h1>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-32"></div>)}
                </div>
                <div className="skeleton h-96"></div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        🧠 AI Intelligence
                        {lastUpdated && <span className="text-xs font-normal text-muted mt-1 px-2 py-0.5 bg-bg-input rounded-full">Updated {lastUpdated.toLocaleTimeString()}</span>}
                    </h1>
                    <p className="text-secondary mt-1">Real-time monitoring of agent learning, memory, and adaptation.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex overflow-x-auto gap-2 mb-8 bg-input p-1 rounded-xl w-fit">
                {renderTabButton('overview', 'Overview', '📊')}
                {renderTabButton('feedback', 'Feedback Loop', '🔄')}
                {renderTabButton('memory', 'Memory', '🧠')}
                {renderTabButton('regime', 'Regime', '🌡️')}
                {renderTabButton('postmortem', 'Post-Mortems', '📝')}
                {renderTabButton('clusters', 'Clusters', '🔗')}
            </div>

            {/* Content */}
            <div className="min-h-[500px] anime-fade-in">
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'feedback' && renderFeedbackTab()}
                {activeTab === 'memory' && renderMemoryTab()}
                {activeTab === 'regime' && renderRegimeTab()}
                {activeTab === 'postmortem' && renderPostMortemTab()}
                {activeTab === 'clusters' && renderClustersTab()}
            </div>
        </div>
    );
}
