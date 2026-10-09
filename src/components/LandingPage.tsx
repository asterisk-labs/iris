import React, { FormEvent, useState } from 'react';
import type { SiteCatalog, SiteProject } from '../services/backend';
import '../styles/landing.css';

interface LandingPageProps {
  catalog: SiteCatalog;
  onOpen: (project: SiteProject) => void;
  onOpenCustom: (project: SiteProject) => void;
}

const hfProjectPattern = /^hf:\/\/(datasets|buckets)\/[^/@]+\/[^/@]+(?:@[^/]+)?\/.+/;

const projectName = (path: string) => {
  const file = path.split('/').pop()?.replace(/\.(json|ya?ml)$/i, '') || 'Custom project';
  return file.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

/** A slice of toast shaped like a cat, for the datasets that are not ready yet */
const TOAST = 'M14 55 L14 31 C7 29 7 15 19 14 C24 10 40 10 45 14 C57 15 57 29 50 31 L50 55 Q50 57 48 57 L16 57 Q14 57 14 55 Z';
const ToastCat: React.FC = () => (
  <svg className="project-toast" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="6" fill="#e7eee9" />
    <path d="M17 16 L20 4 L29 12 Z M35 12 L44 4 L47 16 Z" fill="#c27a3c" stroke="#9c5a26" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M20 13 L21 8 L25 12 Z M39 12 L43 8 L44 13 Z" fill="#e9a678" />
    <path d={TOAST} fill="#c27a3c" stroke="#9c5a26" strokeWidth="1.5" strokeLinejoin="round" />
    <path d={TOAST} fill="#f6dba2" transform="translate(32 35) scale(.8) translate(-32 -35)" />
    <g fill="#e6bd78">
      <ellipse cx="22" cy="48" rx="1.2" ry=".8" />
      <ellipse cx="40" cy="50" rx="1" ry=".7" />
      <ellipse cx="27" cy="22" rx="1" ry=".7" />
      <ellipse cx="43" cy="25" rx="1.2" ry=".8" />
    </g>
    <circle cx="21" cy="38" r="2.6" fill="#e8a678" opacity=".6" />
    <circle cx="43" cy="38" r="2.6" fill="#e8a678" opacity=".6" />
    <g fill="none" stroke="#6e3f1c" strokeWidth="1.8" strokeLinecap="round">
      <path d="M22 31 q3 3 6 0 M36 31 q3 3 6 0" />
      <path d="M32 38 q-2 3 -4 1 M32 38 q2 3 4 1" />
      <path d="M19 38 L12 36 M19 40 L12 41 M45 38 L52 36 M45 40 L52 41" strokeWidth="1.1" />
    </g>
    <path d="M30.5 35 h3 l-1.5 2 z" fill="#6e3f1c" />
  </svg>
);

export const LandingPage: React.FC<LandingPageProps> = ({ catalog, onOpen, onOpenCustom }) => {
  const [mode, setMode] = useState<'remote' | 'local'>('remote');
  const [remoteProject, setRemoteProject] = useState('');
  const [localProject, setLocalProject] = useState('/project.json');
  const [error, setError] = useState<string | null>(null);
  const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const selectMode = (next: 'remote' | 'local') => {
    setMode(next);
    setError(null);
  };

  const openRemote = (event: FormEvent) => {
    event.preventDefault();
    const project = remoteProject.trim();
    if (!hfProjectPattern.test(project)) {
      setError('Enter the complete Hugging Face path to an IRIS project file.');
      return;
    }
    onOpenCustom({ id: 'custom', name: projectName(project), project, login: 'huggingface', guests: true });
  };

  const openLocal = (event: FormEvent) => {
    event.preventDefault();
    const project = localProject.trim();
    if (!project) {
      setError('Enter the path to project.json.');
      return;
    }
    onOpenCustom({ id: 'custom', name: projectName(project), project, guests: false });
  };

  return (
    <main className="launcher">
      <header className="launcher-header">
        <div className="launcher-partners" aria-label="Project partners">
          <div className="launcher-esa"><img src="./brand/esa-logo.png" alt="ESA" /><span>Φ-lab</span></div>
          <div className="launcher-asterisk"><img src="./brand/asterisk-mark.png" alt="" /><span>asterisk labs</span></div>
        </div>
        <div className="launcher-product"><strong>IRIS</strong><span>Satellite image segmentation</span></div>
      </header>

      <section className="launcher-layout">
        <aside className="launcher-sidebar">
          <div className="launcher-intro">
            <span>Intelligently Reinforced Image Segmentation<sup>1</sup></span>
            <h1>Label satellite imagery in your browser.</h1>
            <p>A tool for manual segmentation of satellite imagery, made to speed up building training datasets for Earth Observation. You paint a few pixels, a gradient boosted tree fills in the rest.</p>
            <small className="launcher-footnote"><sup>1</sup>Yes, it is a <a href="https://en.wikipedia.org/wiki/Backronym" target="_blank" rel="noreferrer">backronym</a>.</small>
          </div>

          <div className="launcher-modes" role="radiogroup" aria-label="Mode">
            <span className="launcher-modes-label">Two modes</span>
            <button type="button" role="radio" aria-label="Remote mode" aria-checked={mode === 'remote'} className={mode === 'remote' ? 'active' : ''} onClick={() => selectMode('remote')}>
              <i aria-hidden="true" />
              <strong>Remote</strong>
              <small>Projects on Hugging Face. Sign in with your token to save your masks there, or look around as a guest.</small>
            </button>
            <button type="button" role="radio" aria-label="Local mode" aria-checked={mode === 'local'} className={mode === 'local' ? 'active' : ''} onClick={() => selectMode('local')}>
              <i aria-hidden="true" />
              <strong>Local</strong>
              <small>Projects served from this computer. No account, your masks stay in this browser.</small>
            </button>
          </div>

          <p className="launcher-help">{mode === 'remote'
            ? 'Pick a project. IRIS then asks for your Hugging Face token, or lets you continue as a guest.'
            : 'Needs Node.js 22 or newer. Nothing else to install.'}</p>
        </aside>

        <section className="launcher-workspace">
          {mode === 'remote' ? <>
            <header className="workspace-heading">
              <div><span>Remote mode</span><h2>Choose a dataset</h2></div>
              <small>{catalog.projects.length} projects</small>
            </header>

            <div className="project-catalog">
              {catalog.projects.map((project) => <button
                type="button"
                className={`project-tile ${project.coming_soon ? 'coming-soon' : ''}`}
                key={project.id}
                onClick={() => onOpen(project)}
                disabled={project.coming_soon}
              >
                {project.thumbnail
                  ? <img src={project.thumbnail} alt="" />
                  : project.coming_soon
                    ? <ToastCat />
                    : <span className="project-monogram" aria-hidden="true">{project.name.slice(0, 2).toUpperCase()}</span>}
                <span className="project-copy">
                  <strong>{project.name}</strong>
                  <small>{project.description || project.project}</small>
                </span>
                <span className={`project-status ${project.coming_soon ? '' : 'available'}`}>
                  {project.coming_soon ? 'Coming soon' : 'Available'}
                </span>
              </button>)}
            </div>

            {catalog.allowCustomProjects && <form className="remote-connect" onSubmit={openRemote}>
              <div className="connect-heading"><strong>Connect another project</strong><span>Masks are saved next to it, in segmentation/.</span></div>
              <label><span>Project file</span><input aria-label="Hugging Face project file" value={remoteProject} onChange={(event) => setRemoteProject(event.target.value)} placeholder="hf://datasets/owner/name/project.json" spellCheck={false} /></label>
              <button type="submit">Connect</button>
            </form>}
          </> : <>
            <header className="workspace-heading">
              <div><span>Local mode</span><h2>Open a project from this computer</h2></div>
              <small>No account needed</small>
            </header>

            <div className="local-guide">
              <div><span>1</span><p><strong>Try the demo</strong>Two Sentinel-2 scenes, opened in your browser.<code>npx @asterisk-labs/iris demo</code></p></div>
              <div><span>2</span><p><strong>Start a project</strong>A copy of the demo to edit: project file, image list and COGs.<code>npx @asterisk-labs/iris init my-project</code></p></div>
              <div><span>3</span><p><strong>Open it</strong>IRIS serves the folder and opens it. Your masks stay in the browser.<code>npx @asterisk-labs/iris my-project</code></p></div>
            </div>

            {localHost && <form className="local-connect" onSubmit={openLocal}>
              <label><span>Project file served here</span><input aria-label="Local project file" value={localProject} onChange={(event) => setLocalProject(event.target.value)} spellCheck={false} /></label>
              <button type="submit">Open project</button>
            </form>}
          </>}

          {error && <div className="launcher-error" role="alert">{error}</div>}
        </section>
      </section>
    </main>
  );
};

export default LandingPage;
