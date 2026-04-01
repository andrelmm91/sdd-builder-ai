<script lang="ts">
  import { onMount } from 'svelte';
  import { onMessage, postMessage } from '../lib/vscode';

  type AIProvider = 'claude' | 'copilot';
  type PermissionMode = 'default' | 'dangerously-skip-permissions' | 'plan' | 'yolo';

  interface TagSkillMapping {
    tag: string;
    skill: string;
  }

  type ClaudeEffort = 'low' | 'medium' | 'high';

  interface AIConfig {
    provider: AIProvider;
    permissionMode: PermissionMode;
    model: string;
    effort: ClaudeEffort;
    tagSkillMappings: TagSkillMapping[];
    prePromptTemplate: string;
    commitCommand: string;
    commitCommandEnabled: boolean;
    prCommand: string;
    prCommandEnabled: boolean;
  }

  interface RequirementsAIConfig {
    provider: AIProvider;
    model: string;
    permissionMode: PermissionMode;
    effort: ClaudeEffort;
    idealizePromptTemplate: string;
    createSddCardsPromptTemplate: string;
  }

  const DEFAULT_PRE_PROMPT = 'Implement {spec_file}. Update open tasks and its status to review after completion.';
  const DEFAULT_IDEALIZE_PROMPT = 'You are acting as a Senior Tech Lead and Software Architect. Follow the skill instructions in {file_prefix}.sdd/skills/idealize-requirements/SKILL.md. Analyze the feature description in {file_prefix}{feature_path} and produce a complete technical idealization. Create idealization.md in the same folder as the feature file, following the output format defined in the skill. The idealization must include: technical architecture, implementation plan with ordered phases, automated and manual acceptance criteria, technical risks with mitigations, concrete recommendations grounded in the existing codebase, and all open questions that must be resolved before implementation.';
  const DEFAULT_CREATE_SDD_PROMPT = 'Create new phases and SDDs in {file_prefix}{specs_folder}/ to fulfill the requirements in {file_prefix}{idealization_path} by using skills in {file_prefix}.sdd/skills/sdd-planner/SKILL.md. Add dependency from the other SDDs if needed.';

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
    copilot: [
      'claude-sonnet-4.6', 'claude-sonnet-4.5', 'claude-haiku-4.5',
      'claude-opus-4.6', 'claude-opus-4.6-fast', 'claude-opus-4.5', 'claude-sonnet-4',
      'gemini-3-pro-preview',
      'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2',
      'gpt-5.1-codex-max', 'gpt-5.1-codex', 'gpt-5.1', 'gpt-5.1-codex-mini',
      'gpt-5-mini', 'gpt-4.1',
    ],
  };

  let provider = $state<AIProvider>('claude');
  let permissionMode = $state<PermissionMode>('default');
  let model = $state<string>('sonnet');
  let effort = $state<ClaudeEffort>('medium');
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

  // Requirements AI config state
  let reqProvider = $state<AIProvider>('claude');
  let reqPermissionMode = $state<PermissionMode>('default');
  let reqModel = $state<string>('sonnet');
  let reqEffort = $state<ClaudeEffort>('medium');
  let reqIdealizePromptTemplate = $state<string>('');
  let reqCreateSddCardsPromptTemplate = $state<string>('');
  let reqSaved = $state(false);
  let reqSaveError = $state(false);

  const permissionOptions = $derived(PERMISSION_MODES[provider]);
  const modelOptions = $derived(MODELS[provider]);
  const reqPermissionOptions = $derived(PERMISSION_MODES[reqProvider]);
  const reqModelOptions = $derived(MODELS[reqProvider]);

  function onProviderChange(newProvider: AIProvider) {
    provider = newProvider;
    permissionMode = PERMISSION_MODES[newProvider][1].value;
    model = MODELS[newProvider][0];
  }

  function onReqProviderChange(newProvider: AIProvider) {
    reqProvider = newProvider;
    reqPermissionMode = PERMISSION_MODES[newProvider][1].value;
    reqModel = MODELS[newProvider][0];
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
      provider, permissionMode, model, effort, tagSkillMappings,
      prePromptTemplate, commitCommand, commitCommandEnabled,
      prCommand, prCommandEnabled,
    }));
    postMessage('saveConfig', config);
  }

  function saveRequirementsConfig() {
    const config: RequirementsAIConfig = JSON.parse(JSON.stringify({
      provider: reqProvider,
      model: reqModel,
      permissionMode: reqPermissionMode,
      effort: reqEffort,
      idealizePromptTemplate: reqIdealizePromptTemplate,
      createSddCardsPromptTemplate: reqCreateSddCardsPromptTemplate,
    }));
    postMessage('saveRequirementsConfig', config);
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
        effort = c.effort ?? 'medium';
        tagSkillMappings = c.tagSkillMappings;
        prePromptTemplate = c.prePromptTemplate;
        commitCommand = c.commitCommand;
        commitCommandEnabled = c.commitCommandEnabled;
        prCommand = c.prCommand;
        prCommandEnabled = c.prCommandEnabled;
        availableTags = d.tags;
        availableSkills = d.skills;
      } else if (msg.type === 'requirementsConfigData') {
        const d = msg.data as { config: RequirementsAIConfig };
        const c = d.config;
        reqProvider = c.provider;
        reqModel = c.model;
        reqPermissionMode = c.permissionMode;
        reqEffort = c.effort ?? 'medium';
        reqIdealizePromptTemplate = c.idealizePromptTemplate;
        reqCreateSddCardsPromptTemplate = c.createSddCardsPromptTemplate;
      } else if (msg.type === 'requirementsSaveConfirmed') {
        reqSaved = true;
        reqSaveError = false;
        setTimeout(() => (reqSaved = false), 2000);
      } else if (msg.type === 'requirementsSaveError') {
        reqSaveError = true;
        setTimeout(() => (reqSaveError = false), 3000);
      } else if (msg.type === 'notInitialized') {
        notInitialized = true;
      }
    });
    postMessage('requestConfig', {});
    postMessage('requestRequirementsConfig', {});
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
    <div class="section-group-heading">SDD Execution</div>

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

    {#if provider === 'claude'}
    <section class="form-section">
      <label class="field-label" for="effort-select">Effort</label>
      <select id="effort-select" class="form-select" bind:value={effort}>
        <option value="low">low</option>
        <option value="medium">medium</option>
        <option value="high">high</option>
      </select>
      <p class="field-hint">Passed as <code>--effort</code> to the Claude CLI.</p>
    </section>
    {/if}

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
      <div class="label-row">
        <label class="field-label" for="preprompt-textarea">Custom Pre-prompt</label>
        <button class="btn-reset" onclick={() => (prePromptTemplate = DEFAULT_PRE_PROMPT)}>Reset to default</button>
      </div>
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

    <hr class="section-divider" />
    <div class="section-group-heading">Requirements AI Config</div>
    <p class="field-hint">Used by <strong>Idealize Requirements</strong> and <strong>Create SDD Cards</strong> commands.</p>

    <section class="form-section">
      <label class="field-label" for="req-provider-select">AI Provider</label>
      <select
        id="req-provider-select"
        class="form-select"
        value={reqProvider}
        onchange={(e) => onReqProviderChange((e.currentTarget as HTMLSelectElement).value as AIProvider)}
      >
        {#each PROVIDER_OPTIONS as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </section>

    <section class="form-section">
      <label class="field-label" for="req-permission-select">Permission Mode</label>
      <select id="req-permission-select" class="form-select" bind:value={reqPermissionMode}>
        {#each reqPermissionOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </section>

    <section class="form-section">
      <label class="field-label" for="req-model-select">Model</label>
      <select id="req-model-select" class="form-select" bind:value={reqModel}>
        {#each reqModelOptions as m}
          <option value={m}>{m}</option>
        {/each}
      </select>
    </section>

    {#if reqProvider === 'claude'}
    <section class="form-section">
      <label class="field-label" for="req-effort-select">Effort</label>
      <select id="req-effort-select" class="form-select" bind:value={reqEffort}>
        <option value="low">low</option>
        <option value="medium">medium</option>
        <option value="high">high</option>
      </select>
      <p class="field-hint">Passed as <code>--effort</code> to the Claude CLI.</p>
    </section>
    {/if}

    <section class="form-section">
      <div class="label-row">
        <label class="field-label" for="req-idealize-textarea">Idealize Prompt Template</label>
        <button class="btn-reset" onclick={() => (reqIdealizePromptTemplate = DEFAULT_IDEALIZE_PROMPT)}>Reset to default</button>
      </div>
      <textarea
        id="req-idealize-textarea"
        class="form-textarea"
        rows={5}
        bind:value={reqIdealizePromptTemplate}
      ></textarea>
      <p class="field-hint">Use <code>{'{feature_path}'}</code> as a placeholder for the feature file path.</p>
      <p class="field-hint">Use <code>{'{file_prefix}'}</code> as a file reference prefix — resolves to <code>@</code> for Claude and <code>#file:</code> for Copilot.</p>
      <p class="field-hint">The default prompt uses the <strong>idealize-requirements</strong> skill at <code>.sdd/skills/idealize-requirements/SKILL.md</code> — customize that file to adjust idealization behavior for your project.</p>
    </section>

    <section class="form-section">
      <div class="label-row">
        <label class="field-label" for="req-create-sdd-textarea">Create SDD Cards Prompt Template</label>
        <button class="btn-reset" onclick={() => (reqCreateSddCardsPromptTemplate = DEFAULT_CREATE_SDD_PROMPT)}>Reset to default</button>
      </div>
      <textarea
        id="req-create-sdd-textarea"
        class="form-textarea"
        rows={5}
        bind:value={reqCreateSddCardsPromptTemplate}
      ></textarea>
      <p class="field-hint">Use <code>{'{idealization_path}'}</code> and <code>{'{specs_folder}'}</code> as placeholders.</p>
      <p class="field-hint">Use <code>{'{file_prefix}'}</code> as a file reference prefix — resolves to <code>@</code> for Claude and <code>#file:</code> for Copilot.</p>
    </section>

    <div class="save-row">
      <button class="btn-save" class:btn-save-success={reqSaved} class:btn-save-error={reqSaveError} use:directClick={saveRequirementsConfig}>
        {reqSaved ? 'Saved!' : reqSaveError ? 'Error!' : 'Save Requirements Config'}
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

  .section-divider {
    border: none;
    border-top: 1px solid var(--vscode-panel-border);
    margin: 8px 0;
  }

  .section-group-heading {
    font-weight: 700;
    font-size: 1em;
    color: var(--vscode-foreground);
    margin-bottom: 4px;
  }

  .label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .btn-reset {
    background: none;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    font-size: 0.78em;
    font-family: inherit;
    padding: 2px 8px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .btn-reset:hover {
    background: var(--vscode-list-hoverBackground);
    color: var(--vscode-foreground);
  }
</style>
