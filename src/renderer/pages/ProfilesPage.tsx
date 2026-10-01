import type { BrowserProfile } from '../../shared/types';
import { PageHeader } from '../App';

export function ProfilesPage({ profiles, onChange, onError }: { profiles: BrowserProfile[]; onChange(): Promise<void>; onError(error: unknown): void }) {
  async function create() {
    const name = window.prompt('Profile name');
    if (!name) return;
    try { await window.siteRunner.profiles.create(name); await onChange(); } catch (error) { onError(error); }
  }
  async function remove(profile: BrowserProfile) {
    if (!window.confirm(`Delete profile “${profile.name}”?`)) return;
    try { await window.siteRunner.profiles.remove(profile.id); await onChange(); } catch (error) { onError(error); }
  }
  return <><PageHeader eyebrow="BROWSER STATE" title="Profiles" description="Separate local Chromium sessions for different accounts and sites." actions={<button className="primary" onClick={create}>New profile</button>} />
    <section className="card-grid">{profiles.map((profile) => <article className="panel profile-card" key={profile.id}><span className="profile-glyph">◫</span><div><h2>{profile.name}</h2><p>Created {new Date(profile.createdAt).toLocaleDateString()}</p></div><div className="card-actions"><button className="secondary" onClick={() => void window.siteRunner.profiles.open(profile.id).catch(onError)}>Open browser</button><button className="danger-ghost" onClick={() => void remove(profile)}>Delete</button></div></article>)}</section>
  </>;
}
