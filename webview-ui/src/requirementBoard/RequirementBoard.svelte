<script lang="ts">
  import { onMount } from 'svelte';
  import { onMessage, postMessage } from '../lib/vscode';
  import FeatureForm from './FeatureForm.svelte';

  type FeatureStatus = 'Feature Backlog' | 'Idealization In Review' | 'SDD Created';
  type RequirementType = 'new_feature' | 'bug_fix' | 'technical_debt';

  interface FeatureCard {
    name: string;
    title: string;
    status: FeatureStatus;
    filePath: string;
    folderPath: string;
    hasIdealization: boolean;
    requirementType?: RequirementType;
  }

  const COLUMNS: { id: FeatureStatus; label: string }[] = [
    { id: 'Feature Backlog', label: 'Requirement Backlog' },
    { id: 'Idealization In Review', label: 'Idealization In Review' },
    { id: 'SDD Created', label: 'SDD Created' },
  ];

  const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
    new_feature: 'New Feature',
    bug_fix: 'Bug Fix',
    technical_debt: 'Tech Debt',
  };

  let features: FeatureCard[] = $state([]);
  let showFeatureForm = $state(false);
  let loading = $state(true);
  let actionInProgress: string | null = $state(null);

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
        loading = false;
        actionInProgress = null;
      }
    });
  });

  function openFile(filePath: string) {
    postMessage('openFile', { filePath });
  }

  function idealizeRequirements(featureName: string, folderPath: string) {
    if (actionInProgress !== null) return;
    actionInProgress = featureName;
    postMessage('idealizeRequirements', { featureName, folderPath });
  }

  function createSddCards(featureName: string, folderPath: string) {
    if (actionInProgress !== null) return;
    actionInProgress = featureName;
    postMessage('createSddCards', { featureName, folderPath });
  }

  function addNewFeature() {
    showFeatureForm = true;
  }

  function hideFeatureForm() {
    showFeatureForm = false;
  }

  function openAiConfig() {
    postMessage('openAiConfig', {});
  }

  function refresh() {
    postMessage('requestRequirementBoardData', {});
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
    <button class="btn-refresh" onclick={refresh} title="Refresh">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 8A6 6 0 1 1 8 2" stroke-linecap="round"/>
        <path d="M8 0l3 2-3 2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button class="btn-new" onclick={addNewFeature}>Add New Requirement +</button>
    <button class="btn-new btn-config" onclick={openAiConfig}>⚙ AI Config</button>
  </header>

  {#if showFeatureForm}
    <FeatureForm oncancel={hideFeatureForm} onsubmit={hideFeatureForm} />
  {/if}

  {#if loading}
    <p class="loading-state">Loading...</p>
  {/if}

  <div class="board" class:hidden={loading}>
    {#each COLUMNS as col (col.id)}
      {@const cards = featuresByStatus[col.id] ?? []}
      <div class="column">
        <div class="column-header">
          <span class="column-title">{col.label}</span>
          <span class="column-count">{cards.length}</span>
        </div>

        {#if cards.length === 0}
          <p class="empty-col">No requirements</p>
        {:else}
          {#each cards as card (card.name)}
            <div class="feature-card">
              <button class="link-btn card-title" onclick={() => openFile(card.filePath)}>
                {card.title || card.name}
              </button>

              <div class="card-meta">
                <span class="badge {statusBadgeClass(card.status)}">{card.status}</span>
                {#if card.requirementType}
                  <span class="badge badge-type badge-type-{card.requirementType}">
                    {REQUIREMENT_TYPE_LABELS[card.requirementType]}
                  </span>
                {/if}
              </div>

              <div class="card-actions">
                {#if col.id === 'Feature Backlog'}
                  {#if actionInProgress === card.name}
                    <span class="processing-indicator">Processing...</span>
                  {:else}
                    <button
                      class="btn-action"
                      disabled={actionInProgress !== null}
                      onclick={() => idealizeRequirements(card.name, card.folderPath)}
                    >
                      Idealize Requirements
                    </button>
                  {/if}
                {:else if col.id === 'Idealization In Review'}
                  {#if actionInProgress === card.name}
                    <span class="processing-indicator">Processing...</span>
                  {:else}
                    <button
                      class="btn-action btn-primary"
                      disabled={actionInProgress !== null}
                      onclick={() => createSddCards(card.name, card.folderPath)}
                    >
                      Create SDD Cards
                    </button>
                  {/if}
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
  }

  .btn-refresh {
    background: none;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    color: var(--vscode-foreground);
    cursor: pointer;
    padding: 4px 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .btn-refresh:hover {
    background: var(--vscode-button-secondaryHoverBackground);
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

  .btn-config {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn-config:hover { background: var(--vscode-button-secondaryHoverBackground); }

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

  .badge-type { font-weight: 500; }
  .badge-type-new_feature     { background: var(--vscode-charts-blue, #0078d4); color: #fff; }
  .badge-type-bug_fix         { background: var(--vscode-charts-orange, #ca5010); color: #fff; }
  .badge-type-technical_debt  { background: var(--vscode-charts-purple, #8764b8); color: #fff; }

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

  .btn-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-action:disabled:hover {
    background: var(--vscode-button-secondaryBackground);
  }
  .btn-primary:disabled:hover {
    background: var(--vscode-button-background);
  }

  .loading-state {
    text-align: center;
    color: var(--vscode-descriptionForeground);
    padding: 24px;
    font-style: italic;
  }

  .hidden { display: none; }

  .processing-indicator {
    font-size: 0.78em;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    padding: 2px 0;
  }
</style>
