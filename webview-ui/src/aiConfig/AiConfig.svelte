<script lang="ts">
  import { onMount } from 'svelte';
  import { onMessage, postMessage } from '../lib/vscode';

  type AIProvider = 'claude' | 'copilot';
  type PermissionMode = 'default' | 'dangerously-skip-permissions' | 'plan' | 'yolo';

  interface TagSkillMapping {
    tag: string;
    skill: string;
  }

  interface AIConfig {
    provider: AIProvider;
    permissionMode: PermissionMode;
    model: string;
    tagSkillMappings: TagSkillMapping[];
    prePromptTemplate: string;
    commitCommand: string;
    commitCommandEnabled: boolean;
    prCommand: string;
    prCommandEnabled: boolean;
  }

  const PROVIDER_OPTIONS: { value: AIProvider; label: string }[] = [
    { value: 'claude', label: 'Claude' },
    { value: 'copilot', label: 'Copilot' },
  ];

  const PERMISSION_MODES: Record<AIProvider, { value: PermissionMode; label: string }[]> = {
    claude: [
      { value: 'default', label: 'Default (ask)' },
      { value: 'dangerously-skip-permissions', label: 'Full permissions (--dangerously-skip-permissions)' },
      { value: 'plan', label: 'Plan mode (--plan)' },
    ],
    copilot: [
      { value: 'default', label: 'Default (ask)' },
      { value: 'yolo', label: 'Full permissions (--yolo)' },
    ],
  };

  const MODELS: Record<AIProvider, string[]> = {
    claude: ['opus', 'sonnet', 'haiku'],
    copilot: ['claude-sonnet-4.6', 'gpt-4o', 'gpt-5.1', 'codex', 'opus'],
  };

  let provider = $state<AIProvider>('claude');
  let permissionMode = $state<PermissionMode>('default');
  let model = $state<string>('sonnet');
  let tagSkillMappings = $state<TagSkillMapping[]>([]);
  let prePromptTemplate = $state<string>('');
  let availableTags = $state<string[]>([]);
  let availableSkills = $state<string[]>([]);
  let commitCommand = $state<string>('');
  let commitCommandEnabled = $state<boolean>(false);
  let prCommand = $state<string>('');
  let prCommandEnabled = $state<boolean>(false);
  let newTag = $state('');
  let newSkill = $state('');
  let saved = $state(false);
  let saveError = $state(false);
  let notInitialized = $state(false);

  const permissionOptions = $derived(PERMISSION_MODES[provider]);
  const modelOptions = $derived(MODELS[provider]);

  function onProviderChange(newProvider: AIProvider) {
    provider = newProvider;
    permissionMode = PERMISSION_MODES[newProvider][0].value;
    model = MODELS[newProvider][0];
  }

  function addMapping() {
    const tag = newTag.trim();
    const skill = newSkill.trim();
    if (!tag || !skill) return;
    tagSkillMappings = [...tagSkillMappings, { tag, skill }];
    newTag = '';
    newSkill = '';
  }

  function removeMapping(index: number) {
    tagSkillMappings = tagSkillMappings.filter((_, i) => i !== index);
  }

  function updateMappingTag(index: number, value: string) {
    tagSkillMappings = tagSkillMappings.map((m, i) => (i === index ? { ...m, tag: value } : m));
  }

  function updateMappingSkill(index: number, value: string) {
    tagSkillMappings = tagSkillMappings.map((m, i) => (i === index ? { ...m, skill: value } : m));
  }

  function save() {
    // Use JSON round-trip to strip Svelte 5 $state Proxy wrappers —
    // vscodeApi.postMessage cannot serialize Proxy objects.
    const config: AIConfig = JSON.parse(JSON.stringify({
      provider, permissionMode, model, tagSkillMappings,
      prePromptTemplate, commitCommand, commitCommandEnabled,
      prCommand, prCommandEnabled,
    }));
    postMessage('saveConfig', config);
  }

  /** Bypass Svelte 5 event delegation — attach a real DOM listener. */
  function directClick(node: HTMLElement, handler: () => void) {
    node.addEventListener('click', handler);
    return { destroy: () => node.removeEventListener('click', handler) };
  }

  onMount(() => {
    onMessage((msg) => {
      if (msg.type === 'saveConfirmed') {
        saved = true;
        saveError = false;
        setTimeout(() => (saved = false), 2000);
      } else if (msg.type === 'saveError') {
        saveError = true;
        setTimeout(() => (saveError = false), 3000);
      } else if (msg.type === 'configData') {
        const d = msg.data as { config: AIConfig; tags: string[]; skills: string[] };
        const c = d.config;
        notInitialized = false;
        provider = c.provider;
        permissionMode = c.permissionMode;
        model = c.model;
        tagSkillMappings = c.tagSkillMappings;
        prePromptTemplate = c.prePromptTemplate;
        commitCommand = c.commitCommand;
        commitCommandEnabled = c.commitCommandEnabled;
        prCommand = c.prCommand;
        prCommandEnabled = c.prCommandEnabled;
        availableTags = d.tags;
        availableSkills = d.skills;
      } else if (msg.type === 'notInitialized') {
        notInitialized = true;
      }
    });
    postMessage('requestConfig', {});
  });
</script>

<div class="ai-config-root">
  <header class="config-header">
    <span class="config-title">AI Global Configuration</span>
  </header>

  {#if notInitialized}
    <div class="not-initialized">
      <button class="btn-init" use:directClick={() => postMessage('initProject', {})}>Initialize SDD Project</button>
      Project not initialized. Run <strong>SDD: Initialize Project</strong> first.
    </div>
  {/if}

  <div class="config-body" class:disabled={notInitialized}>
    <section class="form-section">
      <label class="field-label" for="provider-select">AI Provider</label>
      <select
        id="provider-select"
        class="form-select"
        value={provider}
        onchange={(e) => onProviderChange((e.currentTarget as HTMLSelectElement).value as AIProvider)}
      >
        {#each PROVIDER_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </section>

    <section class="form-section">
      <label class="field-label" for="permission-select">Permission Mode</label>
      <select id="permission-select" class="form-select" bind:value={permissionMode}>
        {#each permissionOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </section>

    <section class="form-section">
      <label class="field-label" for="model-select">Model</label>
      <select id="model-select" class="form-select" bind:value={model}>
        {#each modelOptions as m}
          <option value={m}>{m}</option>
        {/each}
      </select>
    </section>

    <section class="form-section">
      <div class="section-heading">Tag → Skill Mappings</div>

      {#if tagSkillMappings.length > 0}
        <table class="mapping-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Skill</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each tagSkillMappings as mapping, i}
              <tr>
                <td>
                  {#if availableTags.length > 0}
                    <select
                      class="form-select inline-select"
                      value={mapping.tag}
                      onchange={(e) => updateMappingTag(i, (e.currentTarget as HTMLSelectElement).value)}
                    >
                      {#each availableTags as tag}
                        <option value={tag}>{tag}</option>
                      {/each}
                    </select>
                  {:else}
                    <input
                      class="form-input inline-input"
                      type="text"
                      value={mapping.tag}
                      oninput={(e) => updateMappingTag(i, (e.currentTarget as HTMLInputElement).value)}
                    />
                  {/if}
                </td>
                <td>
                  {#if availableSkills.length > 0}
                    <select
                      class="form-select inline-select"
                      value={mapping.skill}
                      onchange={(e) => updateMappingSkill(i, (e.currentTarget as HTMLSelectElement).value)}
                    >
                      {#each availableSkills as skill}
                        <option value={skill}>{skill}</option>
                      {/each}
                    </select>
                  {:else}
                    <input
                      class="form-input inline-input"
                      type="text"
                      value={mapping.skill}
                      oninput={(e) => updateMappingSkill(i, (e.currentTarget as HTMLInputElement).value)}
                    />
                  {/if}
                </td>
                <td>
                  <button class="btn-remove" onclick={() => removeMapping(i)}>✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="empty-mappings">No mappings configured.</p>
      {/if}

      <div class="add-mapping-row">
        {#if availableTags.length > 0}
          <select class="form-select inline-select" bind:value={newTag}>
            <option value="">— select tag —</option>
            {#each availableTags as tag}
              <option value={tag}>{tag}</option>
            {/each}
          </select>
        {:else}
          <input class="form-input inline-input" type="text" placeholder="Tag" bind:value={newTag} />
        {/if}

        {#if availableSkills.length > 0}
          <select class="form-select inline-select" bind:value={newSkill}>
            <option value="">— select skill —</option>
            {#each availableSkills as skill}
              <option value={skill}>{skill}</option>
            {/each}
          </select>
        {:else}
          <input class="form-input inline-input" type="text" placeholder="Skill" bind:value={newSkill} />
        {/if}

        <button class="btn-add" onclick={addMapping} disabled={!newTag.trim() || !newSkill.trim()}>
          Add
        </button>
      </div>
    </section>

    <section class="form-section">
      <label class="field-label" for="preprompt-textarea">Custom Pre-prompt</label>
      <textarea
        id="preprompt-textarea"
        class="form-textarea"
        rows={4}
        bind:value={prePromptTemplate}
      ></textarea>
      <p class="field-hint">Use <code>{'{spec_file}'}</code> as a placeholder for the spec path.</p>
    </section>

    <section class="form-section">
      <div class="section-heading">Git Commands</div>
      <p class="field-hint">These commands are appended to the execution prompt so the AI agent handles git operations. Use <code>{'{spec_id}'}</code> and <code>{'{title}'}</code> as placeholders.</p>

      <div class="toggle-field">
        <label class="toggle-label">
          <input type="checkbox" bind:checked={commitCommandEnabled} />
          Commit Command
        </label>
        <textarea
          class="form-textarea"
          rows={2}
          bind:value={commitCommand}
          disabled={!commitCommandEnabled}
        ></textarea>
      </div>

      <div class="toggle-field">
        <label class="toggle-label">
          <input type="checkbox" bind:checked={prCommandEnabled} />
          PR Command
        </label>
        <textarea
          class="form-textarea"
          rows={2}
          bind:value={prCommand}
          disabled={!prCommandEnabled}
        ></textarea>
      </div>
    </section>

    <div class="save-row">
      <button class="btn-save" class:btn-save-success={saved} class:btn-save-error={saveError} use:directClick={save}>
        {saved ? 'Saved!' : saveError ? 'Error!' : 'Save'}
      </button>
    </div>
  </div>
</div>

<style>
  .ai-config-root {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
  }

  .config-header {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }

  .config-title {
    font-weight: 700;
    font-size: 1.1em;
  }

  .not-initialized {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 16px 0;
    padding: 10px 14px;
    background: var(--vscode-inputValidation-warningBackground);
    border: 1px solid var(--vscode-inputValidation-warningBorder);
    border-radius: 3px;
    font-size: 0.9em;
  }

  .btn-init {
    flex-shrink: 0;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 4px 12px;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    font-weight: 600;
    white-space: nowrap;
  }
  .btn-init:hover { background: var(--vscode-button-hoverBackground); }

  .config-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 600px;
  }

  .config-body.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-weight: 600;
    font-size: 0.9em;
  }

  .section-heading {
    font-weight: 600;
    font-size: 0.9em;
    margin-bottom: 2px;
  }

  .form-select,
  .form-input {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 4px 8px;
    font-size: inherit;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }

  .form-textarea {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 6px 8px;
    font-size: inherit;
    font-family: var(--vscode-editor-font-family, monospace);
    resize: vertical;
    width: 100%;
    box-sizing: border-box;
  }

  .field-hint {
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
    margin: 0;
  }

  .field-hint code {
    background: var(--vscode-textCodeBlock-background);
    padding: 0 3px;
    border-radius: 2px;
  }

  .mapping-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }

  .mapping-table th {
    text-align: left;
    font-weight: 600;
    padding: 4px 6px;
    border-bottom: 1px solid var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
  }

  .mapping-table td {
    padding: 4px 6px;
    vertical-align: middle;
  }

  .mapping-table tr:hover td {
    background: var(--vscode-list-hoverBackground);
  }

  .inline-select,
  .inline-input {
    width: 100%;
    min-width: 80px;
  }

  .empty-mappings {
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    margin: 4px 0;
  }

  .add-mapping-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 6px;
    flex-wrap: wrap;
  }

  .add-mapping-row .form-select,
  .add-mapping-row .form-input {
    flex: 1;
    min-width: 100px;
    width: auto;
  }

  .btn-add {
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
  .btn-add:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  .btn-add:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-remove {
    background: none;
    border: none;
    color: var(--vscode-errorForeground, var(--vscode-charts-red));
    cursor: pointer;
    font-size: 0.9em;
    padding: 2px 4px;
    border-radius: 3px;
  }
  .btn-remove:hover { background: var(--vscode-list-hoverBackground); }

  .toggle-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    font-size: 0.9em;
    cursor: pointer;
  }

  .toggle-label input[type='checkbox'] {
    accent-color: var(--vscode-button-background);
  }

  .form-textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .save-row {
    display: flex;
    justify-content: flex-end;
    padding-top: 4px;
  }

  .btn-save {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 6px 24px;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    font-weight: 600;
    min-width: 80px;
  }
  .btn-save:hover { background: var(--vscode-button-hoverBackground); }
  .btn-save-success { background: #2ea043 !important; }
  .btn-save-error { background: var(--vscode-inputValidation-errorBackground, #be1100) !important; }
</style>
