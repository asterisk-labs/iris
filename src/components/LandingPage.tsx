import React, { FormEvent, useState } from 'react';
import type { SiteCatalog, SiteProject } from '../services/backend';
import '../styles/landing.css';

interface LandingPageProps {
  catalog: SiteCatalog;
  onOpen: (project: SiteProject) => void;
  onOpenCustom: (project: SiteProject) => void;
}

const hfProjectPattern = /^hf:\/\/(datasets|buckets)\/[^/@]+\/[^/@]+(?:@[^/]+)?\/.+/;

const projectTitle = (location: string) => {
  const file = location.split('/').pop()?.replace(/\.(json|ya?ml)$/i, '') || 'Custom project';
  return file.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const LandingPage: React.FC<LandingPageProps> = ({ catalog, onOpen, onOpenCustom }) => {
  const [remoteProject, setRemoteProject] = useState('');
  const [remoteLabels, setRemoteLabels] = useState('');
  const [localProject, setLocalProject] = useState('/project.json');
  const [error, setError] = useState<string | null>(null);
  const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const openRemote = (event: FormEvent) => {
    event.preventDefault();
    const project = remoteProject.trim();
    const labels = remoteLabels.trim();
    if (!hfProjectPattern.test(project)) {
      setError('Enter the complete Hugging Face path to a project file, for example hf://datasets/owner/name/project.json');
      return;
    }
    if (labels && !/^hf:\/\/(datasets|buckets)\/[^/@]+\/[^/@]+/.test(labels)) {
      setError('Label storage must be a Hugging Face dataset or bucket path');
      return;
    }
    setError(null);
    onOpenCustom({
      id: 'custom',
      name: projectTitle(project),
      description: 'A project opened directly from Hugging Face',
      project,
      labels: labels || undefined,
      login: 'huggingface',
      guests: true,
      tags: ['Hugging Face'],
    });
  };

  const openLocal = (event: FormEvent) => {
    event.preventDefault();
    const project = localProject.trim();
    if (!project) {
      setError('Enter the address of the local project file');
      return;
    }
    setError(null);
    onOpenCustom({
      id: 'custom',
      name: projectTitle(project),
      description: 'A project served from this computer',
      project,
      guests: false,
      tags: ['Local'],
    });
  };

  return (
    <main className="landing-shell">
      <header className="landing-header">
        <div className="landing-partners" aria-label="Project partners">
          <div className="partner partner-esa">
            <img src="./brand/esa-logo.png" alt="ESA" />
            <span>Φ-lab</span>
          </div>
          <span className="partner-divider" aria-hidden="true" />
          <div className="partner partner-asterisk">
            <img src="./brand/asterisk-mark.png" alt="" />
            <span>asterisk labs</span>
          </div>
        </div>
        <a className="landing-github" href="https://github.com/asterisk-labs/iris" target="_blank" rel="noreferrer">
          View on GitHub <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className="landing-hero">
        <div className="landing-kicker"><span /> Earth observation annotation workspace</div>
        <h1><strong>IRIS</strong> turns imagery into trustworthy training data.</h1>
        <p>Choose a prepared dataset or connect one from Hugging Face. Authentication happens only after you select where you want to work.</p>
      </section>

      <section className="landing-section" aria-labelledby="prepared-projects">
        <div className="landing-section-heading">
          <div>
            <span className="section-number">01</span>
            <h2 id="prepared-projects">Choose a dataset</h2>
          </div>
          <p>Projects define imagery, classes, views and where annotations are saved.</p>
        </div>

        <div className="project-grid">
          {catalog.projects.map((project) => (
            <article className="project-card" key={project.id}>
              <div className="project-preview">
                {project.thumbnail
                  ? <img src={project.thumbnail} alt="" />
                  : <div className="project-placeholder" aria-hidden="true"><span>IRIS</span></div>}
                <div className="project-tags">
                  {(project.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </div>
              <div className="project-copy">
                <div>
                  <h3>{project.name}</h3>
                  <p>{project.description || 'Open this dataset in IRIS.'}</p>
                </div>
                <button type="button" onClick={() => onOpen(project)}>
                  Open dataset <span aria-hidden="true">→</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {catalog.allowCustomProjects && <section className="landing-section connect-section" aria-labelledby="connect-project">
        <div className="landing-section-heading">
          <div>
            <span className="section-number">02</span>
            <h2 id="connect-project">Connect your data</h2>
          </div>
          <p>The source must contain an IRIS project file and Cloud Optimized GeoTIFF imagery.</p>
        </div>

        <div className="connect-grid">
          <form className="connect-card" onSubmit={openRemote}>
            <div className="connect-icon remote-icon" aria-hidden="true">HF</div>
            <div className="connect-title">
              <div><span>Remote</span><h3>Hugging Face</h3></div>
              <span className="recommended">Recommended</span>
            </div>
            <p>Open a public or private dataset. IRIS will request your token on the next screen.</p>
            <label>
              <span>Project file</span>
              <input
                value={remoteProject}
                onChange={(event) => setRemoteProject(event.target.value)}
                placeholder="hf://datasets/owner/name/project.json"
                spellCheck={false}
              />
            </label>
            <label>
              <span>Label storage <em>optional</em></span>
              <input
                value={remoteLabels}
                onChange={(event) => setRemoteLabels(event.target.value)}
                placeholder="hf://buckets/owner/name"
                spellCheck={false}
              />
            </label>
            <button type="submit">Connect remote dataset <span aria-hidden="true">→</span></button>
          </form>

          <form className={`connect-card ${localHost ? '' : 'connect-card-muted'}`} onSubmit={openLocal}>
            <div className="connect-icon local-icon" aria-hidden="true">⌂</div>
            <div className="connect-title">
              <div><span>Local</span><h3>This computer</h3></div>
              <span className="local-status">{localHost ? 'Available' : 'Use localhost'}</span>
            </div>
            <p>{localHost
              ? 'Open a project served alongside IRIS. The local user is the administrator by default.'
              : 'Run IRIS locally to work with data on this computer without sending it to a remote service.'}</p>
            {localHost ? <>
              <label>
                <span>Local project file</span>
                <input value={localProject} onChange={(event) => setLocalProject(event.target.value)} spellCheck={false} />
              </label>
              <button type="submit">Open local project <span aria-hidden="true">→</span></button>
            </> : <div className="local-command"><code>npm run dev</code><small>Then open IRIS on localhost</small></div>}
          </form>
        </div>
        {error && <p className="landing-error" role="alert">{error}</p>}
      </section>}

      <footer className="landing-footer">
        <span>IRIS · Browser-based Earth observation labelling</span>
        <span>Data stays where you choose.</span>
      </footer>
    </main>
  );
};

export default LandingPage;
