<script lang="ts">
  import { onMount } from 'svelte';
  import { onMessage, postMessage } from '../lib/vscode';

  interface FormData {
    spec_id: string;
    title: string;
    status: string;
    priority: string;
    complexity: string;
    tags: string[];
    agent_skills: string;
    relevant_files: string[];
    must_not_touch: string[];
    depends_on: string[];
    budget_max_tokens: number;
    created: string;
    context: string;
    functionalRequirements: string;
    nonFunctionalRequirements: string;
    automatedCriteria: string;
    manualCriteria: string;
    constraints: string;
    examples: string;
  }

  type Mode = 'create' | 'edit';

  let mode = $state<Mode>('create');
  let specId = $state('');
  let filePath = $state<string | undefined>(undefined);
  let allSpecIds = $state<string[]>([]);

  let title = $state('');
  let status = $state('draft');
  let priority = $state('medium');
  let complexity = $state('medium');
  let agentSkills = $state('backend-dev');
  let tagInput = $state('');
  let tags = $state<string[]>([]);
  let relevantFiles = $state('');
  let mustNotTouch = $state('');
  let dependsOn = $state<string[]>([]);
  let budgetTokens = $state(100000);

  let context = $state('');
  let functionalReqs = $state('');
  let nonFunctionalReqs = $state('');
  let automatedCriteria = $state('');
  let manualCriteria = $state('');
  let constraints = $state('');
  let examples = $state('');

  let saveStatus = $state<'idle' | 'success' | 'error'>('idle');
  let saveMessage = $state('');
  let attempted = $state(false);

  const SPEC_ID_PATTERN = /^[A-Z]+-\d+$/;

  const specIdInvalid = $derived(mode === 'create' && specId && !SPEC_ID_PATTERN.test(specId));
  const titleInvalid = $derived(attempted && !title.trim());
  const relevantFilesEmpty = $derived(attempted && !relevantFiles.trim());

  onMount(() => {
    onMessage((msg) => {
      if (msg.type === 'initForm') {
        const d = msg.data as {
          mode: Mode;
          specId: string;
          filePath?: string;
          allSpecIds: string[];
          formData: FormData | null;
        };
        mode = d.mode;
        specId = d.specId;
        filePath = d.filePath;
        allSpecIds = d.allSpecIds;

        if (d.formData) {
          populateForm(d.formData);
        }
      } else if (msg.type === 'saveSuccess') {
        saveStatus = 'success';
        saveMessage = 'Spec saved successfully.';
        setTimeout(() => { saveStatus = 'idle'; }, 3000);
      } else if (msg.type === 'saveError') {
        saveStatus = 'error';
        saveMessage = (msg.data as { message: string }).message;
      }
    });
  });

  function populateForm(f: FormData) {
    title = f.title ?? '';
    status = f.status ?? 'draft';
    priority = f.priority ?? 'medium';
    complexity = f.complexity ?? 'medium';
    agentSkills = f.agent_skills ?? 'backend-dev';
    tags = f.tags ?? [];
    relevantFiles = (f.relevant_files ?? []).join('\n');
    mustNotTouch = (f.must_not_touch ?? []).join('\n');
    dependsOn = f.depends_on ?? [];
    budgetTokens = f.budget_max_tokens ?? 100000;
    context = f.context ?? '';
    functionalReqs = f.functionalRequirements ?? '';
    nonFunctionalReqs = f.nonFunctionalRequirements ?? '';
    automatedCriteria = f.automatedCriteria ?? '';
    manualCriteria = f.manualCriteria ?? '';
    constraints = f.constraints ?? '';
    examples = f.examples ?? '';
  }

  function addTag(e: KeyboardEvent) {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        tags = [...tags, tagInput.trim()];
      }
      tagInput = '';
    }
  }

  function removeTag(tag: string) {
    tags = tags.filter((t) => t !== tag);
  }

  function toggleDepends(id: string) {
    dependsOn = dependsOn.includes(id)
      ? dependsOn.filter((d) => d !== id)
      : [...dependsOn, id];
  }

  /** Bypass Svelte 5 event delegation — attach a real DOM listener. */
  function directClick(node: HTMLElement, handler: () => void) {
    node.addEventListener('click', handler);
    return { destroy: () => node.removeEventListener('click', handler) };
  }

  function save() {
    attempted = true;
    if (!title.trim() || specIdInvalid) return;

    // JSON round-trip strips Svelte 5 $state Proxy wrappers so postMessage can serialize the object.
    const formData: FormData = JSON.parse(JSON.stringify({
      spec_id: specId,
      title: title.trim(),
      status: mode === 'create' ? 'draft' : status,
      priority,
      complexity,
      tags,
      agent_skills: agentSkills,
      relevant_files: relevantFiles.split('\n').map((l) => l.trim()).filter(Boolean),
      must_not_touch: mustNotTouch.split('\n').map((l) => l.trim()).filter(Boolean),
      depends_on: dependsOn,
      budget_max_tokens: budgetTokens,
      created: new Date().toISOString().slice(0, 10),
      context,
      functionalRequirements: functionalReqs,
      nonFunctionalRequirements: nonFunctionalReqs,
      automatedCriteria,
      manualCriteria,
      constraints,
      examples,
    }));

    postMessage('saveSpec', formData);
  }

  function openFile() {
    if (filePath) postMessage('openFile', { filePath });
  }
</script>

<div class="form-root">
  <h1 class="page-title">{mode === 'create' ? 'New Spec' : `Edit: ${specId}`}</h1>

  <!-- Identity -->
  <fieldset class="group">
    <legend>Identity</legend>

    <div class="field">
      <label for="spec_id">Spec ID</label>
      <input
        id="spec_id"
        type="text"
        value={specId}
        readonly={mode === 'edit'}
        class:invalid={specIdInvalid}
        oninput={(e) => { specId = (e.target as HTMLInputElement).value; }}
      />
      {#if specIdInvalid}
        <span class="error-msg">Must match format SDD-001</span>
      {/if}
    </div>

    <div class="field">
      <label for="title">Title <span class="required">*</span></label>
      <input
        id="title"
        type="text"
        bind:value={title}
        class:invalid={titleInvalid}
        placeholder="Short imperative description"
      />
      {#if titleInvalid}
        <span class="error-msg">Title is required</span>
      {/if}
    </div>

    <div class="field-row">
      <div class="field">
        <label for="status">Status</label>
        <select id="status" bind:value={status} disabled={mode === 'create'}>
          {#each ['draft','ready','in_progress','review','done'] as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="priority">Priority</label>
        <select id="priority" bind:value={priority}>
          {#each ['high','medium','low'] as p}
            <option value={p}>{p}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="complexity">Complexity</label>
        <select id="complexity" bind:value={complexity}>
          {#each ['low','medium','high'] as c}
            <option value={c}>{c}</option>
          {/each}
        </select>
      </div>
    </div>
  </fieldset>

  <!-- Classification -->
  <fieldset class="group">
    <legend>Classification</legend>

    <div class="field">
      <label for="tags">Tags</label>
      <div class="tag-area">
        {#each tags as tag}
          <span class="tag-chip">
            {tag}
            <button class="tag-remove" onclick={() => removeTag(tag)}>×</button>
          </span>
        {/each}
        <input
          id="tags"
          type="text"
          bind:value={tagInput}
          onkeydown={addTag}
          placeholder="Type + Enter to add tag"
          class="tag-input"
        />
      </div>
    </div>

    <div class="field">
      <label for="agent_skills">Agent Skills</label>
      <select id="agent_skills" bind:value={agentSkills}>
        {#each ['backend-dev','frontend-dev','sdd-planner'] as skill}
          <option value={skill}>{skill}</option>
        {/each}
      </select>
    </div>
  </fieldset>

  <!-- Scope -->
  <fieldset class="group">
    <legend>Scope</legend>

    <div class="field">
      <label for="relevant_files">
        Relevant Files
        {#if relevantFilesEmpty}<span class="warn-msg"> (recommended — no context for agent)</span>{/if}
      </label>
      <textarea
        id="relevant_files"
        bind:value={relevantFiles}
        placeholder="One path per line"
        rows={4}
      ></textarea>
    </div>

    <div class="field">
      <label for="must_not_touch">Must Not Touch</label>
      <textarea
        id="must_not_touch"
        bind:value={mustNotTouch}
        placeholder="One path per line"
        rows={3}
      ></textarea>
    </div>

    <div class="field">
      <label>Depends On</label>
      <div class="depends-list">
        {#each allSpecIds.filter((id) => id !== specId) as id}
          <label class="depends-item">
            <input
              type="checkbox"
              checked={dependsOn.includes(id)}
              onchange={() => toggleDepends(id)}
            />
            {id}
          </label>
        {/each}
        {#if allSpecIds.filter((id) => id !== specId).length === 0}
          <span class="muted">No other specs</span>
        {/if}
      </div>
    </div>
  </fieldset>

  <!-- Budget -->
  <fieldset class="group">
    <legend>Budget</legend>
    <div class="field budget-field">
      <label for="budget">Max Tokens: <strong>{budgetTokens.toLocaleString()}</strong></label>
      <input
        id="budget"
        type="range"
        min={10000}
        max={500000}
        step={10000}
        bind:value={budgetTokens}
      />
    </div>
  </fieldset>

  <!-- Body Sections -->
  <fieldset class="group">
    <legend>Body</legend>

    <div class="field">
      <label for="context">Context</label>
      <textarea id="context" bind:value={context} placeholder="What this spec addresses and why" rows={4}></textarea>
    </div>

    <div class="field">
      <label for="func_reqs">Functional Requirements</label>
      <textarea id="func_reqs" bind:value={functionalReqs} placeholder="- Bullet list of functional requirements" rows={5}></textarea>
    </div>

    <div class="field">
      <label for="nonfunc_reqs">Non-Functional Requirements</label>
      <textarea id="nonfunc_reqs" bind:value={nonFunctionalReqs} placeholder="Performance, security, and other non-functional requirements" rows={3}></textarea>
    </div>

    <div class="field">
      <label for="auto_criteria">Acceptance Criteria – Automated</label>
      <textarea id="auto_criteria" bind:value={automatedCriteria} placeholder="- [ ] Automated test descriptions" rows={3}></textarea>
    </div>

    <div class="field">
      <label for="manual_criteria">Acceptance Criteria – Manual</label>
      <textarea id="manual_criteria" bind:value={manualCriteria} placeholder="- [ ] Manual verification steps" rows={3}></textarea>
    </div>

    <div class="field">
      <label for="constraints">Constraints</label>
      <textarea id="constraints" bind:value={constraints} placeholder="Hard limits and rules the agent must follow" rows={3}></textarea>
    </div>

    <div class="field">
      <label for="examples">Examples</label>
      <textarea id="examples" bind:value={examples} placeholder="Input/output examples or code snippets" rows={4}></textarea>
    </div>
  </fieldset>

  <!-- Sticky action bar -->
  <div class="action-bar">
    <button class="btn-save" use:directClick={save}>Save Spec</button>
    {#if mode === 'edit' && filePath}
      <button class="btn-open" onclick={openFile}>Open File</button>
    {/if}

    {#if saveStatus === 'success'}
      <span class="status-msg status-ok">{saveMessage}</span>
    {:else if saveStatus === 'error'}
      <span class="status-msg status-err">{saveMessage}</span>
    {/if}
  </div>
</div>

<style>
  .form-root {
    padding: 16px 20px 80px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    max-width: 700px;
  }

  .page-title {
    margin: 0 0 16px;
    font-size: 1.3em;
    font-weight: 700;
  }

  fieldset.group {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 16px;
  }
  legend {
    font-weight: 600;
    font-size: 0.85em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--vscode-descriptionForeground);
    padding: 0 4px;
  }

  .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .field:last-child { margin-bottom: 0; }

  .field-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .field-row .field { flex: 1; min-width: 100px; }

  label {
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    font-weight: 500;
  }

  input[type="text"],
  input[type="search"],
  select,
  textarea {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 5px 8px;
    font-size: inherit;
    font-family: var(--vscode-editor-font-family, inherit);
    resize: vertical;
  }

  input[type="text"]:focus,
  select:focus,
  textarea:focus {
    outline: 1px solid var(--vscode-focusBorder);
  }

  input[readonly] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .invalid {
    border-color: var(--vscode-inputValidation-errorBorder) !important;
    background: var(--vscode-inputValidation-errorBackground) !important;
  }

  .error-msg { font-size: 0.8em; color: var(--vscode-inputValidation-errorForeground, #f00); }
  .warn-msg  { font-size: 0.8em; color: var(--vscode-charts-yellow, #cc0); }
  .muted { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  .required { color: var(--vscode-charts-red, #c00); }

  /* Tags */
  .tag-area {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    min-height: 32px;
    align-items: center;
  }

  .tag-chip {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 0.8em;
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .tag-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    padding: 0;
    line-height: 1;
    font-size: 1em;
    opacity: 0.7;
  }
  .tag-remove:hover { opacity: 1; }

  .tag-input {
    border: none !important;
    background: transparent !important;
    outline: none !important;
    flex: 1;
    min-width: 120px;
    padding: 2px 4px !important;
    color: var(--vscode-input-foreground);
  }

  /* Depends */
  .depends-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 120px;
    overflow-y: auto;
    padding: 4px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
  }

  .depends-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85em;
    cursor: pointer;
    color: var(--vscode-foreground);
  }

  /* Budget */
  .budget-field { gap: 8px; }
  input[type="range"] { width: 100%; accent-color: var(--vscode-button-background); }

  /* Textarea auto-expand approximation */
  textarea { min-height: 60px; max-height: 300px; }

  /* Action bar */
  .action-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--vscode-editor-background);
    border-top: 1px solid var(--vscode-panel-border);
    padding: 10px 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 100;
  }

  .btn-save {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 6px 16px;
    font-size: inherit;
    font-family: inherit;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-save:hover { background: var(--vscode-button-hoverBackground); }

  .btn-open {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    padding: 6px 14px;
    font-size: inherit;
    font-family: inherit;
    cursor: pointer;
  }
  .btn-open:hover { background: var(--vscode-button-secondaryHoverBackground); }

  .status-msg { font-size: 0.9em; }
  .status-ok  { color: var(--vscode-charts-green); }
  .status-err { color: var(--vscode-charts-red, #c00); }
</style>
