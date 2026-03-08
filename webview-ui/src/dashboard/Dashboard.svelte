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
    cost: number;
    tokensIn: number;
    tokensOut: number;
  }

  let specs: SpecData[] = $state([]);
  let executions: ExecutionRecord[] = $state([]);
  let totalCost = $state(0);
  let totalTokens = $state(0);

  const STATUS_ORDER = ['draft', 'ready', 'in_progress', 'review', 'done'];

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

  const avgCost = $derived(
    executions.length > 0 ? totalCost / Math.max(1, new Set(executions.map((e) => e.specId)).size) : 0,
  );

  const phaseBreakdown = $derived.by(() => {
    const map = new Map<string, number>();
    for (const spec of specs) {
      const phaseTag = spec.tags.find((t) => t.startsWith('phase-'));
      const label = phaseTag ?? 'untagged';
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  });

  onMount(() => {
    onMessage((msg) => {
      if (msg.type === 'dashboardData') {
        const d = msg.data as typeof msg.data & {
          specs: SpecData[];
          executions: ExecutionRecord[];
          totalCost: number;
          totalTokens: number;
        };
        specs = d.specs ?? [];
        executions = d.executions ?? [];
        totalCost = d.totalCost ?? 0;
        totalTokens = d.totalTokens ?? 0;
      }
    });
  });

  function openSpec(specId: string) {
    postMessage('navigate', { specId });
  }

  function openKanban() {
    postMessage('openKanban', {});
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

  function formatCost(cost: number) {
    return `$${cost.toFixed(4)}`;
  }
</script>

<main>
  <div class="page-header">
    <h1 class="page-title">SDD Dashboard</h1>
    <button class="kanban-btn" onclick={openKanban}>Open Kanban Board</button>
  </div>

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

  <!-- Phase Breakdown -->
  <section class="card">
    <h2>Phase Breakdown</h2>
    {#if phaseBreakdown.length === 0}
      <p class="muted">No phase tags found.</p>
    {:else}
      <ul class="phase-list">
        {#each phaseBreakdown as [phase, count]}
          <li><span class="phase-tag">{phase}</span> <span class="phase-count">{count}</span></li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Cost Summary -->
  <section class="card">
    <h2>Cost Summary</h2>
    <dl class="stats">
      <dt>Total tokens</dt><dd>{totalTokens.toLocaleString()}</dd>
      <dt>Total cost</dt><dd>{formatCost(totalCost)}</dd>
      <dt>Executions</dt><dd>{executions.length}</dd>
      <dt>Avg cost / spec</dt><dd>{formatCost(avgCost)}</dd>
    </dl>
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
            <th>Cost</th>
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
              <td>{formatCost(exec.cost)}</td>
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
