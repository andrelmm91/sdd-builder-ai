<script lang="ts">
  import { onMount } from 'svelte';
  import { onMessage, postMessage } from '../lib/vscode';

  interface SpecData {
    spec_id: string;
    title: string;
    status: string;
    priority: string;
    complexity: string;
    tags: string[];
  }

  interface ExecutionRecord {
    specId: string;
    timestamp: string;
    status: string;
    tokensIn: number;
    tokensOut: number;
  }

  interface FeatureCard {
    name: string;
    title: string;
    status: string;
    filePath: string;
    folderPath: string;
    hasIdealization: boolean;
    requirementType?: string;
  }

  let specs: SpecData[] = $state([]);
  let executions: ExecutionRecord[] = $state([]);
  let features: FeatureCard[] = $state([]);
  let notInitialized = $state(false);

  interface DoctorCheck {
    id: string;
    label: string;
    status: 'ok' | 'warn' | 'fail';
    detail: string;
    fix?: string;
  }
  interface DoctorReport {
    checks: DoctorCheck[];
    ranAt: string;
    ready: boolean;
  }

  let doctorReport: DoctorReport | undefined = $state();
  let rechecking = $state(false);

  const problems = $derived((doctorReport?.checks ?? []).filter((c) => c.status !== 'ok'));
  const failCount = $derived(problems.filter((c) => c.status === 'fail').length);

  const STATUS_ORDER = ['draft', 'ready', 'in_progress', 'review', 'done'];
  const REQUIREMENT_STATUS_ORDER = ['New Requirement', 'Idealization In Review', 'SDD Created'];

  const byStatus = $derived(
    STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
      acc[s] = specs.filter((sp) => sp.status === s).length;
      return acc;
    }, {}),
  );

  const total = $derived(specs.length);
  const doneCount = $derived(byStatus['done'] ?? 0);
  const completionPct = $derived(total > 0 ? Math.round((doneCount / total) * 100) : 0);

  const recentActivity = $derived(executions.slice(0, 10));

  const totalFeatures = $derived(features.length);
  const byRequirementStatus = $derived(
    REQUIREMENT_STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
      acc[s] = features.filter((f) => f.status === s).length;
      return acc;
    }, {}),
  );

  const tagMappings = $derived.by(() => {
    const map = new Map<string, number>();
    for (const spec of specs) {
      if (spec.tags.length === 0) {
        map.set('untagged', (map.get('untagged') ?? 0) + 1);
      } else {
        for (const tag of spec.tags) {
          map.set(tag, (map.get(tag) ?? 0) + 1);
        }
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  });

  onMount(() => {
    onMessage((msg) => {
      if (msg.type === 'dashboardData') {
        notInitialized = false;
        const d = msg.data as typeof msg.data & {
          specs: SpecData[];
          executions: ExecutionRecord[];
          features: FeatureCard[];
        };
        specs = d.specs ?? [];
        executions = d.executions ?? [];
        features = d.features ?? [];
      } else if (msg.type === 'notInitialized') {
        notInitialized = true;
      } else if (msg.type === 'doctorReport') {
        doctorReport = msg.data as DoctorReport;
        rechecking = false;
      }
    });
    postMessage('refresh', {});
  });

  function openSpec(specId: string) {
    postMessage('navigate', { specId });
  }

  function openKanban() {
    postMessage('openKanban', {});
  }

  function openRequirementBoard() {
    postMessage('openRequirementBoard', {});
  }

  function handleInitProject() {
    postMessage('initProject', {});
  }

  function recheck() {
    rechecking = true;
    postMessage('runDoctor', {});
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

</script>

<main>
  <div class="page-header">
    <h1 class="page-title">SDD Builder AI Dashboard</h1>
    <div class="header-actions">
      <button class="kanban-btn" onclick={openKanban}>Open SDD Kanban</button>
      <button class="kanban-btn" onclick={openRequirementBoard}>Open Requirement Board</button>
    </div>
  </div>

  {#if !notInitialized && doctorReport && problems.length > 0}
    <section class="card doctor-banner" class:doctor-error={!doctorReport.ready} class:doctor-warning={doctorReport.ready}>
      <div class="doctor-header">
        <strong>
          {#if doctorReport.ready}
            Ready to execute, with {problems.length} warning(s)
          {:else}
            Not ready to execute: {failCount} blocking problem(s)
          {/if}
        </strong>
        <button class="kanban-btn" onclick={recheck} disabled={rechecking}>
          {#if rechecking}<span class="spinner"></span>{/if}Re-check
        </button>
      </div>
      <ul class="doctor-list">
        {#each problems as check (check.id)}
          <li>
            <span class="doctor-icon" class:fail={check.status === 'fail'}>{check.status === 'fail' ? '✗' : '⚠'}</span>
            <div>
              <div><strong>{check.label}</strong>: {check.detail}</div>
              {#if check.fix}<div class="doctor-fix">{check.fix}</div>{/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if notInitialized}
    <section class="card init-card">
      <p>Project not initialized. Initialize to start using SDD.</p>
      <button class="btn-init" onclick={handleInitProject}>Initialize SDD Project</button>
    </section>
  {/if}

  <!-- Requirement Status Summary -->
  <section class="card">
    <h2>Requirement Status</h2>
    {#if totalFeatures === 0}
      <p class="muted">No requirements found.</p>
    {:else}
      <div class="status-bars">
        {#each REQUIREMENT_STATUS_ORDER as status}
          {@const count = byRequirementStatus[status] ?? 0}
          {@const pct = totalFeatures > 0 ? (count / totalFeatures) * 100 : 0}
          <div class="status-row">
            <span class="status-label">{status}</span>
            <div class="bar-track">
              <div class="bar-fill req-status-{status.toLowerCase().replace(/ /g, '-')}" style="width: {pct}%"></div>
            </div>
            <span class="status-count">{count}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Spec Status Summary -->
  <section class="card">
    <h2>Spec Status</h2>
    {#if total === 0}
      <p class="muted">No specs found.</p>
    {:else}
      <div class="status-bars">
        {#each STATUS_ORDER as status}
          {@const count = byStatus[status] ?? 0}
          {@const pct = total > 0 ? (count / total) * 100 : 0}
          <div class="status-row">
            <span class="status-label">{status.replace('_', ' ')}</span>
            <div class="bar-track">
              <div class="bar-fill status-{status}" style="width: {pct}%"></div>
            </div>
            <span class="status-count">{count}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Completion Progress -->
  <section class="card">
    <h2>Completion</h2>
    <div class="progress-row">
      <div class="bar-track progress-track">
        <div class="bar-fill progress-fill" style="width: {completionPct}%"></div>
      </div>
      <span class="progress-label">{completionPct}% ({doneCount} / {total})</span>
    </div>
  </section>

  <!-- Tag Mappings -->
  <section class="card">
    <h2>Tag Mappings</h2>
    {#if tagMappings.length === 0}
      <p class="muted">No tags found.</p>
    {:else}
      <ul class="phase-list">
        {#each tagMappings as [tag, count]}
          <li><span class="phase-tag">{tag}</span> <span class="phase-count">{count}</span></li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Recent Activity -->
  <section class="card">
    <h2>Recent Activity</h2>
    {#if recentActivity.length === 0}
      <p class="muted">No executions recorded yet.</p>
    {:else}
      <table class="activity-table">
        <thead>
          <tr>
            <th>Spec</th>
            <th>Time</th>
            <th>Status</th>
            <th>Tokens</th>
          </tr>
        </thead>
        <tbody>
          {#each recentActivity as exec (exec.specId + exec.timestamp)}
            <tr>
              <td>
                <button class="link-btn" onclick={() => openSpec(exec.specId)}>
                  {exec.specId}
                </button>
              </td>
              <td class="muted">{formatDate(exec.timestamp)}</td>
              <td>
                <span class="badge exec-{exec.status}">{exec.status}</span>
              </td>
              <td>{(exec.tokensIn + exec.tokensOut).toLocaleString()}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</main>

<style>
  main {
    padding: 16px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    max-width: 900px;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .page-title {
    margin: 0;
    font-size: 1.4em;
    font-weight: 600;
  }

  .kanban-btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    font-family: inherit;
  }
  .kanban-btn:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .doctor-error { border-color: var(--vscode-inputValidation-errorBorder); }
  .doctor-warning { border-color: var(--vscode-inputValidation-warningBorder); }
  .doctor-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .doctor-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .doctor-list li { display: flex; gap: 8px; }
  .doctor-icon { color: var(--vscode-editorWarning-foreground); }
  .doctor-icon.fail { color: var(--vscode-errorForeground); }
  .doctor-fix { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .kanban-btn:disabled { opacity: 0.6; cursor: default; }
  .spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-right: 6px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .init-card {
    text-align: center;
    padding: 24px 16px;
  }
  .init-card p {
    margin: 0 0 12px;
    color: var(--vscode-descriptionForeground);
  }
  .btn-init {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 8px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1em;
    font-family: inherit;
    font-weight: 600;
  }
  .btn-init:hover {
    background: var(--vscode-button-hoverBackground);
  }

  .card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 12px 16px;
    margin-bottom: 16px;
  }

  .card h2 {
    margin: 0 0 10px;
    font-size: 1em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--vscode-descriptionForeground);
  }

  .muted {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  /* Status bars */
  .status-bars { display: flex; flex-direction: column; gap: 6px; }
  .status-row { display: flex; align-items: center; gap: 8px; }
  .status-label { width: 90px; text-transform: capitalize; font-size: 0.9em; }
  .status-count { width: 30px; text-align: right; font-size: 0.9em; color: var(--vscode-descriptionForeground); }

  .bar-track {
    flex: 1;
    height: 8px;
    background: var(--vscode-input-background);
    border-radius: 4px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .status-draft      { background: var(--vscode-charts-blue); }
  .status-ready      { background: var(--vscode-charts-yellow); }
  .status-in_progress { background: var(--vscode-charts-orange); }
  .status-review     { background: var(--vscode-charts-purple); }
  .status-done       { background: var(--vscode-charts-green); }

  .req-status-new-requirement            { background: var(--vscode-charts-blue); }
  .req-status-idealization-in-review { background: var(--vscode-charts-orange); }
  .req-status-sdd-created            { background: var(--vscode-charts-green); }

  /* Completion */
  .progress-row { display: flex; align-items: center; gap: 12px; }
  .progress-track { flex: 1; height: 12px; }
  .progress-fill { background: var(--vscode-charts-green); }
  .progress-label { white-space: nowrap; font-weight: 600; }

  /* Phase list */
  .phase-list { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
  .phase-list li { display: flex; align-items: center; gap: 6px; }
  .phase-tag {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.85em;
  }
  .phase-count { font-weight: 600; }

  /* Stats */
  dl.stats { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 0; }
  dt { color: var(--vscode-descriptionForeground); }
  dd { margin: 0; font-weight: 600; }

  /* Activity table */
  .activity-table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
  .activity-table th { text-align: left; padding: 4px 8px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
  .activity-table td { padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border, #ffffff10); }

  .link-btn {
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    padding: 0;
    font-size: inherit;
    font-family: inherit;
    text-decoration: underline;
  }
  .link-btn:hover { color: var(--vscode-textLink-activeForeground); }

  .badge {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.8em;
    font-weight: 600;
  }
  .exec-completed { background: var(--vscode-charts-green); color: #fff; }
  .exec-failed    { background: var(--vscode-charts-red); color: #fff; }
  .exec-running   { background: var(--vscode-charts-blue); color: #fff; }
  .exec-aborted   { background: var(--vscode-descriptionForeground); color: #fff; }
</style>
