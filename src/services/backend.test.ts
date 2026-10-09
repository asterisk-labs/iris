import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSiteCatalog, loadSiteConfig, saveCustomProject } from './backend';

describe('site project catalog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('loads the projects shown on the start page', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      default: 'clouds',
      allow_custom_projects: true,
      projects: [{
        id: 'clouds', name: 'Clouds', project: 'clouds/project.json', login: 'huggingface',
        admin: { username: 'admin', password: 'admin' },
      }],
    })));

    const catalog = await loadSiteCatalog();

    expect(catalog.showLanding).toBe(true);
    expect(catalog.default).toBe('clouds');
    expect(catalog.projects[0].admin?.username).toBe('admin');
  });

  it('keeps the old single-project configuration working without a landing page', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      project: 'demo/project.json', guests: true,
    })));

    const catalog = await loadSiteCatalog();

    expect(catalog.showLanding).toBe(false);
    expect(catalog.projects[0]).toMatchObject({ id: 'default', project: 'demo/project.json' });
  });

  it('opens a custom project only for the current browser session', async () => {
    saveCustomProject({
      id: 'custom', name: 'Private clouds', project: 'hf://datasets/org/clouds/project.json',
      login: 'huggingface',
    });

    expect(await loadSiteConfig('custom')).toMatchObject({
      project: 'hf://datasets/org/clouds/project.json', login: 'huggingface',
    });
  });

  it('rejects malformed public administrator accounts', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      projects: [{ id: 'clouds', name: 'Clouds', project: 'project.json', admin: { username: 'admin' } }],
    })));

    await expect(loadSiteCatalog()).rejects.toThrow(/invalid admin account/);
  });
});
