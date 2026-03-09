<script lang="ts">
  import { onMount } from 'svelte';
  import { onMessage, postMessage } from '../lib/vscode';

  type FeatureStatus = 'Feature Backlog' | 'Idealization In Review' | 'SDD Created';

  interface FeatureCard {
    name: string;
    title: string;
    status: FeatureStatus;
    filePath: string;
    folderPath: string;
    hasIdealization: boolean;
  }

  const COLUMNS: { id: FeatureStatus; label: string }[] = [
    { id: 'Feature Backlog', label: 'Feature Backlog' },
    { id: 'Idealization In Review', label: 'Idealization In Review' },
    { id: 'SDD Created', label: 'SDD Created' },
  ];

  let features: FeatureCard[] = $state([]);
  let showFeatureForm = $state(false);

  const featuresByStatus = $derived(
    Object.fromEntries(
      COLUMNS.map((col) => [col.id, features.filter((f) => f.status === col.id)]),
    ) as Record<FeatureStatus, FeatureCard[]>,
  );

  onMount(() => {
    postMessage('requestRequirementBoardData', {});
    onMessage((msg) => {
      if (msg.type === 'requirementBoardData') {
        const d = msg.data as { features: FeatureCard[] };
        features = d.features ?? [];
      }
    });
  });

  function openFile(filePath: string) {
    postMessage('openFile', { filePath });
  }

  function idealizeRequirements(featureName: string, folderPath: string) {
    postMessage('idealizeRequirements', { featureName, folderPath });
  }

  function createSddCards(featureName: string, folderPath: string) {
    postMessage('createSddCards', { featureName, folderPath });
  }

  function addNewFeature() {
    showFeatureForm = !showFeatureForm;
    postMessage('showFeatureForm', {});
  }

  function statusBadgeClass(status: FeatureStatus): string {
    if (status === 'Feature Backlog') return 'badge-low';
    if (status === 'Idealization In Review') return 'badge-medium';
    return 'badge-high';
  }
</script>

<div class="board-root">
  <header class="board-header">
    <span class="board-title">Requirement Board</span>
    <button class="btn-new" onclick={addNewFeature}>Add New Feature +</button>
  </header>

  <div class="board">
    {#each COLUMNS as col (col.id)}
      {@const cards = featuresByStatus[col.id] ?? []}
      <div class="column">
        <div class="column-header">
          <span class="column-title">{col.label}</span>
          <span class="column-count">{cards.length}</span>
        </div>

        {#if cards.length === 0}
          <p class="empty-col">No features</p>
        {:else}
          {#each cards as card (card.name)}
            <div class="feature-card">
              <button class="link-btn card-title" onclick={() => openFile(card.filePath)}>
                {card.title || card.name}
              </button>

              <div class="card-meta">
                <span class="badge {statusBadgeClass(card.status)}">{card.status}</span>
              </div>

              <div class="card-actions">
                {#if col.id === 'Feature Backlog'}
                  <button
                    class="btn-action"
                    onclick={() => idealizeRequirements(card.name, card.folderPath)}
                  >
                    Idealize Requirements
                  </button>
                {:else if col.id === 'Idealization In Review'}
                  <button
                    class="btn-action btn-primary"
                    onclick={() => createSddCards(card.name, card.folderPath)}
                  >
                    Create SDD Cards
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .board-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    overflow: hidden;
  }

  .board-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }

  .board-title {
    font-weight: 700;
    font-size: 1.1em;
    white-space: nowrap;
    flex: 1;
  }

  .btn-new {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 4px 12px;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    white-space: nowrap;
  }
  .btn-new:hover { background: var(--vscode-button-hoverBackground); }

  .board {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    align-items: flex-start;
  }

  .column {
    flex: 1 1 0;
    min-width: 200px;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }

  .column-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 4px 4px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .column-title {
    font-weight: 600;
    font-size: 0.9em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .column-count {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 0.8em;
  }

  .empty-col {
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 0.85em;
    padding: 12px 0;
  }

  .feature-card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: box-shadow 0.1s;
  }
  .feature-card:hover { box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2); }

  .link-btn {
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    padding: 0;
    font-size: inherit;
    font-family: inherit;
    text-align: left;
  }
  .link-btn:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }

  .card-title { font-size: 0.9em; line-height: 1.3; word-break: break-word; }

  .card-meta { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 2px; }

  .badge {
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.75em;
    font-weight: 600;
  }
  .badge-low    { background: var(--vscode-charts-green); color: #fff; }
  .badge-medium { background: var(--vscode-charts-yellow); color: #fff; }
  .badge-high   { background: var(--vscode-charts-red); color: #fff; }

  .card-actions { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }

  .btn-action {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    padding: 2px 8px;
    font-size: 0.78em;
    cursor: pointer;
    font-family: inherit;
  }
  .btn-action:hover { background: var(--vscode-button-secondaryHoverBackground); }

  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
</style>
