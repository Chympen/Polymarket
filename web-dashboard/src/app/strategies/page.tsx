
'use client';

import { useState, useEffect } from 'react';

interface TradingStrategy {
    id: string;
    name: string;
    description: string | null;
    keywords: string[];
    maxDailyTrades: number;
    maxPositionSizeUsd: number;
    active: boolean;
    createdAt: string;
    performance?: {
        totalPnl: number;
        winRate: number;
        totalTrades: number;
        openPositions: number;
    };
}

export default function StrategiesPage() {
    const [strategies, setStrategies] = useState<TradingStrategy[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        keywords: '',
        maxDailyTrades: 5,
        maxPositionSizeUsd: 100.0,
        active: true,
    });

    useEffect(() => {
        fetchStrategies();
    }, []);

    async function fetchStrategies() {
        try {
            const res = await fetch('/api/strategies');
            if (res.ok) {
                const data = await res.json();
                setStrategies(data.strategies);
            }
        } catch (error) {
            console.error('Failed to fetch strategies:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        try {
            const payload = {
                ...formData,
                keywords: formData.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0),
            };

            const url = editingId ? `/api/strategies/${editingId}` : '/api/strategies';
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                await fetchStrategies();
                setIsCreating(false);
                setEditingId(null);
                setFormData({ name: '', description: '', keywords: '', maxDailyTrades: 5, maxPositionSizeUsd: 100.0, active: true });
            } else {
                alert(`Failed to ${editingId ? 'update' : 'create'} strategy`);
            }
        } catch (error) {
            console.error(`Failed to ${editingId ? 'update' : 'create'} strategy:`, error);
        }
    }

    function handleEdit(strategy: TradingStrategy) {
        setFormData({
            name: strategy.name,
            description: strategy.description || '',
            keywords: strategy.keywords.join(', '),
            maxDailyTrades: strategy.maxDailyTrades,
            maxPositionSizeUsd: strategy.maxPositionSizeUsd,
            active: strategy.active,
        });
        setEditingId(strategy.id);
        setIsCreating(true);
    }

    function handleCancel() {
        setIsCreating(false);
        setEditingId(null);
        setFormData({ name: '', description: '', keywords: '', maxDailyTrades: 5, maxPositionSizeUsd: 100.0, active: true });
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this strategy?')) return;

        try {
            const res = await fetch(`/api/strategies/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setStrategies(strategies.filter(s => s.id !== id));
            } else {
                alert('Failed to delete strategy');
            }
        } catch (error) {
            console.error('Failed to delete strategy:', error);
        }
    }

    async function toggleActive(strategy: TradingStrategy) {
        try {
            const res = await fetch(`/api/strategies/${strategy.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: !strategy.active }),
            });

            if (res.ok) {
                const updated = await res.json();
                setStrategies(strategies.map(s => s.id === strategy.id ? { ...s, active: updated.strategy.active } : s));
            }
        } catch (error) {
            console.error('Failed to toggle strategy:', error);
        }
    }

    if (loading) return <div>Loading strategies...</div>;

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1>Trading Strategies</h1>
                    <p>Define what the bot should trade on and set limits.</p>
                </div>
                <button
                    onClick={() => {
                        handleCancel();
                        setIsCreating(true);
                    }}
                    className="btn btn-primary"
                    style={{ backgroundColor: '#2563eb', color: 'white', padding: '10px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                >
                    + New Strategy
                </button>
            </div>

            {isCreating && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '20px'
                }}>
                    <div className="section" style={{
                        backgroundColor: '#1e293b',
                        padding: '32px',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '600px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        position: 'relative',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                        <button
                            onClick={handleCancel}
                            style={{
                                position: 'absolute',
                                top: '20px',
                                right: '20px',
                                background: 'none',
                                border: 'none',
                                color: '#94a3b8',
                                fontSize: '1.5rem',
                                cursor: 'pointer',
                                lineHeight: 1
                            }}
                        >
                            &times;
                        </button>

                        <h3 style={{ fontSize: '1.5rem', marginBottom: '24px' }}>{editingId ? 'Edit Strategy' : 'Create New Strategy'}</h3>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>Strategy Name</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    placeholder="e.g. Bitcoin Only"
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>Description (Optional)</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="e.g. Focus purely on BTC price markets"
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>Keywords (Comma Separated)</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={formData.keywords}
                                    onChange={e => setFormData({ ...formData, keywords: e.target.value })}
                                    required
                                    placeholder="e.g. Bitcoin, BTC, Crypto"
                                />
                                <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px' }}>Markets must contain at least one keyword to match.</p>
                            </div>
                            <div style={{ display: 'flex', gap: '24px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>Max Daily Trades</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={formData.maxDailyTrades}
                                        onChange={e => setFormData({ ...formData, maxDailyTrades: parseInt(e.target.value) })}
                                        min="1"
                                        required
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>Max Spend per Trade ($)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={formData.maxPositionSizeUsd}
                                        onChange={e => setFormData({ ...formData, maxPositionSizeUsd: parseFloat(e.target.value) })}
                                        min="1"
                                        step="0.01"
                                        required
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                <button type="submit" className="btn btn-primary btn-lg" style={{ flex: 1 }}>
                                    {editingId ? 'Update Strategy' : 'Save Strategy'}
                                </button>
                                <button type="button" onClick={handleCancel} className="btn btn-outline btn-lg" style={{ flex: 1 }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="grid-grid-cols-1 md:grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {strategies.map(strategy => (
                    <div key={strategy.id} className="card" style={{ position: 'relative', borderLeft: strategy.active ? '4px solid #22c55e' : '4px solid #64748b' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{strategy.name}</h3>
                                <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>{strategy.description || 'No description'}</p>
                            </div>
                            <span style={{
                                backgroundColor: strategy.active ? '#22c55e20' : '#64748b20',
                                color: strategy.active ? '#22c55e' : '#64748b',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                fontWeight: 'bold'
                            }}>
                                {strategy.active ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Keywords:</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                                    {strategy.keywords.map((k, i) => (
                                        <span key={i} style={{ backgroundColor: '#334155', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>{k}</span>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <div>
                                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Daily Limit:</span>
                                    <span style={{ marginLeft: '8px', fontWeight: 'bold' }}>{strategy.maxDailyTrades} trades</span>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Trade Cap:</span>
                                    <span style={{ marginLeft: '8px', fontWeight: 'bold' }}>${strategy.maxPositionSizeUsd}</span>
                                </div>
                            </div>
                        </div>

                        {/* Performance Stats */}
                        <div style={{ marginTop: '12px', marginBottom: '16px', padding: '12px', backgroundColor: '#0f172a', borderRadius: '6px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block' }}>Total PnL</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: (strategy.performance?.totalPnl || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                                        ${(strategy.performance?.totalPnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block' }}>Win Rate</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white' }}>
                                        {(strategy.performance?.winRate || 0).toFixed(1)}%
                                    </span>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block' }}>Trades</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white' }}>
                                        {strategy.performance?.totalTrades || 0}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block' }}>Open Pos</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white' }}>
                                        {strategy.performance?.openPositions || 0}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', borderTop: '1px solid #334155', paddingTop: '12px' }}>
                            <button
                                onClick={() => toggleActive(strategy)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: strategy.active ? '#fbbf24' : '#22c55e',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem'
                                }}
                            >
                                {strategy.active ? '⏸ Pause' : '▶ Activate'}
                            </button>
                            <button
                                onClick={() => handleEdit(strategy)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#3b82f6',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem'
                                }}
                            >
                                ✏️ Edit
                            </button>
                            <button
                                onClick={() => handleDelete(strategy.id)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem'
                                }}
                            >
                                🗑 Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {
                strategies.length === 0 && !isCreating && !loading && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                        <p>No active strategies defined. The bot is strictly configured to only trade within user-defined strategies.</p>
                        <button
                            onClick={() => setIsCreating(true)}
                            style={{ marginTop: '12px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            Create your first strategy
                        </button>
                    </div>
                )
            }
        </div >
    );
}
