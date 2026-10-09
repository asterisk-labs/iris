import React, { useState } from 'react';
import { chosenBackend } from '../services/backend';
import '../styles/login.css';

interface LoginFormProps {
  onSuccess?: () => void;
}

/** Sign in with credentials.json or a Hugging Face token, or enter as a guest */
export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminLogin, setAdminLogin] = useState(false);

  const source = chosenBackend();
  const options = source?.signInOptions() ?? { guest: false, method: 'credentials' as const };
  const huggingFaceLogin = options.method === 'huggingface' && !adminLogin;

  const changeMode = (admin: boolean) => {
    setAdminLogin(admin);
    setUsername('');
    setPassword('');
    setError(null);
  };

  const finish = () => {
    if (onSuccess) { onSuccess(); } else { window.location.reload(); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const secret = huggingFaceLogin ? password.trim() : password;
    if (!huggingFaceLogin && !username.trim()) { setError('Username is required'); return; }
    if (!secret) {
      setError(huggingFaceLogin ? 'Hugging Face token is required' : 'Password is required');
      return;
    }
    if (!source) { setError('The project is not loaded'); return; }
    setLoading(true);
    try {
      await source.signIn(username, secret);
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  const enterAsGuest = async () => {
    setError(null);
    if (!source) { setError('The project is not loaded'); return; }
    setLoading(true);
    try {
      await source.enterAsGuest();
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enter as guest');
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brands" aria-label="Project partners">
          <div className="login-brand login-brand-esa">
            <img src="./brand/esa-logo.png" alt="ESA" />
            <span>Φ-lab</span>
          </div>
          <div className="login-brand login-brand-asterisk">
            <img src="./brand/asterisk-mark.png" alt="" />
            <span>asterisk labs</span>
          </div>
        </div>

        <div className="login-card">
          <header className="login-heading">
            <span>IRIS</span>
            <h1 id="login-title">{huggingFaceLogin ? 'Hugging Face login' : adminLogin ? 'Administrator login' : 'Login'}</h1>
          </header>

          {options.method === 'huggingface' && options.admin && <div className="login-tabs">
            <button
              type="button"
              onClick={() => changeMode(false)}
              className={!adminLogin ? 'active' : ''}
            >
              Hugging Face
            </button>
            <button
              type="button"
              onClick={() => changeMode(true)}
              className={adminLogin ? 'active' : ''}
            >
              Administrator
            </button>
          </div>}

          {options.method === 'huggingface' && options.admin && <div className="login-mode-note">
            <strong>{adminLogin ? 'Administrator' : 'Hugging Face'}</strong>
            <span>{adminLogin
              ? 'Sign in with the administrator account of this site to open the review and the project settings.'
              : 'Use your personal Hugging Face token. Annotations are saved with the permissions of your own account.'}</span>
          </div>}

          <form onSubmit={handleSubmit}>
            <div className="login-fields">
              {!huggingFaceLogin && <div className="login-field">
                <label htmlFor="login-username">Username:</label>
                <input
                  type="text"
                  id="login-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  autoFocus
                  autoComplete="username"
                />
              </div>}

              <div className="login-field">
                <label htmlFor="login-password">
                  {huggingFaceLogin ? 'Hugging Face token:' : 'Password:'}
                </label>
                <input
                  type="password"
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete={huggingFaceLogin ? 'off' : 'current-password'}
                />
                {huggingFaceLogin && <small className="login-help">
                  <a
                    href="https://huggingface.co/settings/tokens"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get a Hugging Face token
                  </a>
                  {' '}with the Write role, or fine-grained write access to this dataset or bucket. Your HF account must also
                  have write access to its organization. The token remains in this tab's session.
                </small>}
              </div>
            </div>

            {error && <div className="login-error" role="alert">{error}</div>}

            <div className="login-actions">
              <button
                type="submit"
                disabled={loading}
                className="login-primary"
              >
                {loading ? 'Please wait...' : huggingFaceLogin ? 'Sign in with Hugging Face' : adminLogin ? 'Enter as administrator' : 'Login'}
              </button>

              {options.guest && <button
                type="button"
                onClick={enterAsGuest}
                disabled={loading}
                title="Enter without an account: your masks stay in this browser"
                className="login-secondary"
              >
                Continue without account
              </button>}
            </div>
          </form>
        </div>
      </section>
    </main>
  );
};
