<script lang="ts">
  import { onMount } from 'svelte';
  import { onMessage, postMessage } from '../lib/vscode';
  import type { BulkExecutionState } from '../lib/types';

  type SpecStatus = 'draft' | 'ready' | 'in_progress' | 'review' | 'done';

  interface SpecCard {
    spec_id: string;
    title: string;
    status: SpecStatus;
    priority: string;
    complexity: string;
    tags: string[];
    depends_on: string[];
    changedFiles?: string[];
    automatedCriteria?: string;
    manualCriteria?: string;
  }

  const COLUMNS: { id: SpecStatus; label: string }[] = [
    { id: 'draft', label: 'Draft' },
    { id: 'ready', label: 'Ready' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'review', label: 'Review' },
    { id: 'done', label: 'Done' },
  ];

  // Valid forward transitions (client-side pre-validation only)
  const VALID_TRANSITIONS: Record<SpecStatus, SpecStatus[]> = {
    draft: ['ready'],
    ready: ['in_progress'],
    in_progress: ['review'],
    review: ['done', 'ready', 'draft'],
    done: ['draft'],
  };

  let specs: SpecCard[] = $state([]);
  let filterText = $state('');
  let draggedId = $state<string | null>(null);
  let errorMap = $state<Map<string, string>>(new Map());
  let bulkState = $state<BulkExecutionState>({ items: [], isRunning: false, currentIndex: -1 });
  let modalSpec = $state<SpecCard | null>(null);
  let feedbackText = $state('');

  const filtered = $derived(
    filterText.trim() === ''
      ? specs
      : specs.filter((s) => {
          const q = filterText.toLowerCase();
          return (
            s.spec_id.toLowerCase().includes(q) ||
            s.title.toLowerCase().includes(q) ||
            s.tags.some((t) => t.toLowerCase().includes(q))
          );
        }),
  );

  const bulkSpecIdSet = $derived(new Set(bulkState.items.map((i) => i.specId)));

  function cardsForColumn(status: SpecStatus): SpecCard[] {
    const cards = filtered.filter((s) => s.status === status);
    // Ready: exclude cards that are in the bulk queue (they appear in the bulk frame)
    if (status === 'ready') return cards.filter((c) => !bulkSpecIdSet.has(c.spec_id));
    return cards;
  }

  onMount(() => {
    postMessage('requestBulkState', {});
    onMessage((msg) => {
      if (msg.type === 'specList') {
        const d = msg.data as { specs: SpecCard[] };
        specs = d.specs ?? [];
      } else if (msg.type === 'moveError') {
        const d = msg.data as { specId: string; message: string };
        showError(d.specId, d.message);
      } else if (msg.type === 'bulkState') {
        bulkState = msg.data as BulkExecutionState;
      }
    });
  });

  function showError(specId: string, message: string) {
    errorMap = new Map(errorMap).set(specId, message);
    setTimeout(() => {
      errorMap = new Map([...errorMap].filter(([k]) => k !== specId));
    }, 3000);
  }

  // Drag and drop
  function onDragStart(event: DragEvent, specId: string) {
    draggedId = specId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', specId);
    }
  }

  function onDragEnd() {
    draggedId = null;
  }

  function isValidDrop(targetStatus: SpecStatus): boolean {
    if (!draggedId) return false;
    const card = specs.find((s) => s.spec_id === draggedId);
    if (!card) return false;
    return VALID_TRANSITIONS[card.status]?.includes(targetStatus) ?? false;
  }

  function onDrop(event: DragEvent, targetStatus: SpecStatus) {
    event.preventDefault();
    const specId = event.dataTransfer?.getData('text/plain') ?? draggedId;
    if (!specId) return;
    postMessage('kanbanMove', { specId, newStatus: targetStatus });
    draggedId = null;
  }

  function onDragOver(event: DragEvent, targetStatus: SpecStatus) {
    if (isValidDrop(targetStatus)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }
  }

  // Actions
  function openSpec(specId: string) {
    postMessage('openFile', { specId });
  }

  function openSpecForm() {
    postMessage('openSpecForm', {});
  }

  function openAiConfig() {
    postMessage('openAiConfig', {});
  }

  function cardAction(action: string, specId: string) {
    postMessage('cardAction', { action, specId });
  }

  function addToBulk(specId: string) {
    postMessage('addToBulk', { specId });
  }

  function removeFromBulk(specId: string) {
    postMessage('removeFromBulk', { specId });
  }

  function executeAll() {
    postMessage('executeAll', {});
  }

  function clearBulk() {
    postMessage('clearBulk', {});
  }

  function openModal(card: SpecCard) {
    feedbackText = '';
    modalSpec = card;
  }

  function closeModal() {
    modalSpec = null;
  }

  function submitModal() {
    if (!modalSpec) return;
    postMessage('requestChanges', { specId: modalSpec.spec_id, feedback: feedbackText });
    closeModal();
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) closeModal();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeModal();
  }

  function complexityColor(c: string) {
    return c === 'low' ? 'badge-low' : c === 'medium' ? 'badge-medium' : 'badge-high';
  }

  function priorityColor(p: string) {
    return p === 'high' ? 'badge-high' : p === 'medium' ? 'badge-medium' : 'badge-low';
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="kanban-root">
  <header class="kanban-header">
    <span class="kanban-title">SDD Kanban</span>
    <button class="btn-new" onclick={openSpecForm}>New Spec +</button>
    <button class="btn-new btn-config" onclick={openAiConfig}>⚙ AI Config</button>
    <input
      class="filter-input"
      type="search"
      placeholder="Search by ID, title, or tag…"
      bind:value={filterText}
    />
  </header>

  <div class="board">
    {#each COLUMNS as col (col.id)}
      {@const cards = cardsForColumn(col.id)}
      {@const validTarget = draggedId !== null && isValidDrop(col.id)}
      {@const invalidTarget = draggedId !== null && !isValidDrop(col.id)}
      <div
        class="column"
        class:drop-valid={validTarget}
        class:drop-invalid={invalidTarget}
        ondragover={(e) => onDragOver(e, col.id)}
        ondrop={(e) => onDrop(e, col.id)}
      >
        <div class="column-header">
          <span class="column-title">{col.label}</span>
          <span class="column-count">{cards.length + (col.id === 'ready' ? bulkState.items.filter((i) => i.status === 'queued').length : 0)}</span>
        </div>

        <!-- Bulk queue frame in Ready column (not running) -->
        {#if col.id === 'ready' && bulkState.items.some((i) => i.status === 'queued')}
          <div class="bulk-frame">
            <div class="bulk-frame-header">
              <span class="bulk-frame-title">Bulk Queue ({bulkState.items.length})</span>
              <div class="bulk-frame-actions">
                <button class="btn-action btn-execute-all" onclick={executeAll}>Execute All</button>
                <button class="btn-action btn-clear" onclick={clearBulk}>Clear</button>
              </div>
            </div>
            {#each bulkState.items as item (item.specId)}
              {@const card = specs.find((s) => s.spec_id === item.specId)}
              {#if card}
                <div class="bulk-item">
                  <button class="link-btn bulk-item-id" onclick={() => openSpec(item.specId)}>
                    {item.specId}
                  </button>
                  <span class="bulk-item-title">{card.title}</span>
                  <button class="btn-remove" onclick={() => removeFromBulk(item.specId)} title="Remove from bulk">✕</button>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        <!-- Bulk execution frame in In Progress column (running) -->
        {#if col.id === 'in_progress' && bulkState.isRunning}
          <div class="bulk-frame bulk-frame-running">
            <div class="bulk-frame-header">
              <span class="bulk-frame-title">Bulk Execution</span>
            </div>
            {#each bulkState.items as item (item.specId)}
              {@const card = specs.find((s) => s.spec_id === item.specId)}
              <div class="bulk-item">
                <span
                  class="bulk-status-icon"
                  class:icon-executing={item.status === 'executing'}
                  class:icon-done={item.status === 'completed'}
                  class:icon-failed={item.status === 'failed'}
                >
                  {#if item.status === 'executing'}
                    <span class="spinner"></span>
                  {:else if item.status === 'completed'}
                    ✓
                  {:else if item.status === 'failed'}
                    ✗
                  {:else}
                    ·
                  {/if}
                </span>
                <button class="link-btn bulk-item-id" onclick={() => openSpec(item.specId)}>
                  {item.specId}
                </button>
                <span class="bulk-item-title">{card?.title ?? item.specId}</span>
              </div>
            {/each}
          </div>
        {/if}

        {#if cards.length === 0 && !(col.id === 'ready' && bulkState.items.some((i) => i.status === 'queued'))}
          <p class="empty-col">No specs</p>
        {:else}
          {#each cards as card (card.spec_id)}
            {@const cardError = errorMap.get(card.spec_id)}
            <div
              class="spec-card"
              class:dragging={draggedId === card.spec_id}
              draggable={true}
              ondragstart={(e) => onDragStart(e, card.spec_id)}
              ondragend={onDragEnd}
            >
              {#if cardError}
                <div class="card-error">{cardError}</div>
              {/if}

              <div class="card-top">
                <button class="link-btn spec-id" onclick={() => openSpec(card.spec_id)}>
                  {card.spec_id}
                </button>
                <span class="badge {complexityColor(card.complexity)}">{card.complexity}</span>
              </div>

              <button class="link-btn card-title" onclick={() => openSpec(card.spec_id)}>
                {card.title}
              </button>

              <div class="card-meta">
                <span class="badge {priorityColor(card.priority)}">{card.priority}</span>
                {#each card.tags.slice(0, 3) as tag}
                  <span class="tag-chip">{tag}</span>
                {/each}
                {#if card.tags.length > 3}
                  <span class="tag-chip muted">+{card.tags.length - 3}</span>
                {/if}
              </div>

              {#if card.depends_on.length > 0}
                <div class="depends-indicator">⚠ depends on {card.depends_on.join(', ')}</div>
              {/if}

              <div class="card-actions">
                {#if card.status === 'draft'}
                  <button class="btn-action" onclick={() => cardAction('markReady', card.spec_id)}>
                    Mark Ready
                  </button>
                {:else if card.status === 'ready'}
                  <button class="btn-action" onclick={() => cardAction('execute', card.spec_id)}>
                    Execute
                  </button>
                  <button class="btn-action btn-add-bulk" onclick={() => addToBulk(card.spec_id)}>
                    + Bulk
                  </button>
                {:else if card.status === 'review'}
                  <button class="btn-action btn-approve" onclick={() => cardAction('approve', card.spec_id)}>
                    Approve
                  </button>
                  <button class="btn-action btn-changes" onclick={() => openModal(card)}>
                    Request Changes
                  </button>
                {/if}
              </div>

            </div>
          {/each}
        {/if}
      </div>
    {/each}
  </div>

  {#if modalSpec}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={handleBackdropClick}>
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div class="modal-header">
          <span id="modal-title" class="modal-title">Request Changes</span>
          <span class="modal-spec-id">{modalSpec.spec_id}</span>
        </div>
        <p class="modal-subtitle">{modalSpec.title}</p>

        <label class="modal-label" for="feedback-area">Feedback</label>
        <textarea
          id="feedback-area"
          class="modal-textarea"
          bind:value={feedbackText}
          placeholder="Describe what needs to be fixed…"
          rows={10}
        ></textarea>

        <div class="modal-actions">
          <button class="btn-action btn-approve" onclick={submitModal}>Submit</button>
          <button class="btn-action" onclick={closeModal}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .kanban-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    overflow: hidden;
  }

  .kanban-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }

  .kanban-title {
    font-weight: 700;
    font-size: 1.1em;
    white-space: nowrap;
  }

  .filter-input {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 4px 8px;
    font-size: inherit;
    font-family: inherit;
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
    flex: 0 0 220px;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    transition: border-color 0.1s, box-shadow 0.1s;
  }

  .column.drop-valid {
    border-color: var(--vscode-charts-green);
    box-shadow: 0 0 0 2px var(--vscode-charts-green);
  }

  .column.drop-invalid {
    border-color: var(--vscode-charts-red);
    opacity: 0.7;
  }

  .column-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 4px 4px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .column-title { font-weight: 600; font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.04em; }
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

  /* Bulk frame */
  .bulk-frame {
    border: 1.5px solid var(--vscode-charts-blue, #4aa0ff);
    background: var(--vscode-editor-inactiveSelectionBackground, rgba(74,160,255,0.06));
    border-radius: 5px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bulk-frame-running {
    border-color: var(--vscode-charts-purple, #9b59b6);
    background: var(--vscode-editor-inactiveSelectionBackground, rgba(155,89,182,0.06));
  }

  .bulk-frame-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    margin-bottom: 4px;
  }

  .bulk-frame-title {
    font-size: 0.78em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--vscode-charts-blue, #4aa0ff);
  }

  .bulk-frame-running .bulk-frame-title {
    color: var(--vscode-charts-purple, #9b59b6);
  }

  .bulk-frame-actions {
    display: flex;
    gap: 4px;
  }

  .bulk-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8em;
    min-width: 0;
  }

  .bulk-item-id {
    font-weight: 700;
    font-size: 0.85em;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .bulk-item-title {
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .btn-remove {
    background: none;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 0 2px;
    font-size: 0.9em;
    line-height: 1;
    flex-shrink: 0;
  }
  .btn-remove:hover { color: var(--vscode-charts-red); }

  .bulk-status-icon {
    width: 16px;
    flex-shrink: 0;
    text-align: center;
    font-size: 1em;
  }
  .icon-executing { color: var(--vscode-charts-blue, #4aa0ff); }
  .icon-done { color: var(--vscode-charts-green); font-weight: 700; }
  .icon-failed { color: var(--vscode-charts-red); font-weight: 700; }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--vscode-charts-blue, #4aa0ff);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  /* Card styles */
  .spec-card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 8px;
    cursor: grab;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: box-shadow 0.1s;
  }
  .spec-card:hover { box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
  .spec-card.dragging { opacity: 0.5; cursor: grabbing; }

  .card-error {
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    color: var(--vscode-inputValidation-errorForeground, var(--vscode-foreground));
    border-radius: 3px;
    padding: 4px 6px;
    font-size: 0.8em;
  }

  .card-top { display: flex; align-items: center; justify-content: space-between; gap: 4px; }

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

  .spec-id { font-weight: 700; font-size: 0.85em; }
  .card-title { font-size: 0.9em; line-height: 1.3; word-break: break-word; }

  .card-meta { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }

  .badge {
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.75em;
    font-weight: 600;
    text-transform: capitalize;
  }
  .badge-low    { background: var(--vscode-charts-green); color: #fff; }
  .badge-medium { background: var(--vscode-charts-yellow); color: #fff; }
  .badge-high   { background: var(--vscode-charts-red); color: #fff; }

  .tag-chip {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 1px 5px;
    border-radius: 10px;
    font-size: 0.75em;
  }
  .muted { color: var(--vscode-descriptionForeground); }

  .depends-indicator {
    font-size: 0.75em;
    color: var(--vscode-charts-yellow, #cc0);
  }

  .card-actions { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }

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
  .btn-approve  { background: var(--vscode-charts-green); color: #fff; }
  .btn-approve:hover { background: var(--vscode-charts-green); opacity: 0.85; }
  .btn-changes  { background: var(--vscode-charts-orange); color: #fff; }
  .btn-changes:hover { background: var(--vscode-charts-orange); opacity: 0.85; }
  .btn-execute-all { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn-execute-all:hover { background: var(--vscode-button-hoverBackground); }
  .btn-add-bulk {
    background: color-mix(in srgb, var(--vscode-charts-blue, #4aa0ff) 15%, transparent);
    color: var(--vscode-charts-blue, #4aa0ff);
    border: 1px solid var(--vscode-charts-blue, #4aa0ff);
  }
  .btn-add-bulk:hover {
    background: color-mix(in srgb, var(--vscode-charts-blue, #4aa0ff) 25%, transparent);
  }
  .btn-clear {
    background: none;
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-panel-border);
  }
  .btn-clear:hover { background: var(--vscode-button-secondaryHoverBackground); }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 20px;
    width: 480px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-title {
    font-weight: 700;
    font-size: 1em;
  }

  .modal-spec-id {
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .modal-subtitle {
    margin: 0;
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }

  .modal-label {
    font-size: 0.85em;
    font-weight: 600;
  }

  .modal-textarea {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 6px 8px;
    font-size: 0.82em;
    font-family: var(--vscode-editor-font-family, monospace);
    resize: vertical;
    width: 100%;
    box-sizing: border-box;
  }

  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;
  }
</style>
