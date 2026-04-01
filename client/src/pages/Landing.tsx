import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#e0e0e8' }}>
      {/* Hero */}
      <header style={{ padding: '60px 20px', textAlign: 'center', maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ fontSize: 48, fontWeight: 800, marginBottom: 16 }}>
          <span style={{ background: 'linear-gradient(135deg, #4aff9e, #4a9eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>MindReader</span> Cloud
        </h1>
        <p style={{ fontSize: 20, color: '#8888aa', marginBottom: 32 }}>
          Personal knowledge graph for your AI agents. See, manage, and evolve what your AI remembers.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Link to="/register" style={{ padding: '12px 32px', background: '#4aff9e', color: '#0a0a14', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 16 }}>
            Get Started Free
          </Link>
          <Link to="/login" style={{ padding: '12px 32px', background: 'rgba(255,255,255,0.06)', color: '#e0e0e8', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 16, border: '1px solid rgba(255,255,255,0.1)' }}>
            Sign In
          </Link>
        </div>
      </header>

      {/* Features */}
      <section style={{ padding: '40px 20px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24 }}>
          {[
            { icon: '\u{1F9E0}', title: 'Visual Memory Graph', desc: 'See your entire knowledge landscape as an interactive graph. No more black boxes.' },
            { icon: '\u2728', title: 'Self-Evolution', desc: 'Nodes research themselves via web search and expand your knowledge automatically.' },
            { icon: '\u231B', title: 'Time Travel', desc: 'Drag a slider to see your graph at any point in time. Watch memories grow and fade.' },
            { icon: '\u{1F512}', title: 'Your Data, Isolated', desc: 'Complete tenant isolation. Your knowledge graph is yours alone.' },
            { icon: '\u{1F916}', title: 'Works with Any Agent', desc: 'OpenClaw, Claude Code, Cursor \u2014 connect via MCP or plugin.' },
            { icon: '\u{1F193}', title: 'Free Tier', desc: '100 entities, 500 relationships, 5 evolves per day. No credit card required.' },
          ].map((f, i) => (
            <div key={i} style={{ padding: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: '#8888aa', lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Free tier */}
      <section style={{ padding: '60px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, marginBottom: 16 }}>Start Free</h2>
        <p style={{ color: '#8888aa', marginBottom: 24 }}>No credit card. No time limit. Upgrade when you need more.</p>
        <Link to="/register" style={{ padding: '14px 40px', background: '#4aff9e', color: '#0a0a14', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 16 }}>
          Create Your Knowledge Graph
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ padding: '20px', textAlign: 'center', color: '#555', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        MindReader Cloud &copy; 2026 | <a href="https://github.com/flu012/mindreaderv2" style={{ color: '#4a9eff' }}>Open Source</a>
      </footer>
    </div>
  );
}
