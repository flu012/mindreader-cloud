import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e0e0e8', fontSize: 14, boxSizing: 'border-box' as const };
  const btnStyle = { width: '100%', padding: '12px', background: '#4aff9e', color: '#0a0a14', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 16, cursor: 'pointer' };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 400, padding: 32, background: 'rgba(255,255,255,0.02)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h1 style={{ color: '#e0e0e8', fontSize: 24, textAlign: 'center', marginBottom: 8 }}>Sign In</h1>
        <p style={{ color: '#8888aa', textAlign: 'center', marginBottom: 24, fontSize: 14 }}>Welcome back to MindReader Cloud</p>

        {error && <div style={{ padding: '8px 12px', background: '#ff4a4a22', color: '#ff4a4a', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
          <button type="submit" disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>

        <p style={{ color: '#8888aa', textAlign: 'center', marginTop: 20, fontSize: 13 }}>
          Don't have an account? <Link to="/register" style={{ color: '#4aff9e' }}>Sign up</Link>
        </p>
        <p style={{ textAlign: 'center', marginTop: 8 }}><Link to="/" style={{ color: '#4a9eff', fontSize: 12 }}>&larr; Back to home</Link></p>
      </div>
    </div>
  );
}
