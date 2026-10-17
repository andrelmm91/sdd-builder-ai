<script lang="ts">
  import { onMount } from 'svelte';
  import { onMessage, postMessage } from '../lib/vscode';
  import type { ProviderDefinition, ProviderValidation } from '../lib/types';

  interface Props {
    /** Raw definitions from `ai.customProviders`. */
    saved: ProviderDefinition[];
    builtins: ProviderDefinition[];
    /** Provider ids currently selected, keyed by the setting that uses them. */
    usedBy: Record<string, string>;
  }

  let { saved, builtins, usedBy }: Props = $props();

  type ArgOwner = string[];
  const INVOCATIONS: ('batch' | 'interactive')[] = ['batch', 'interactive'];

  // Working copy of the whole custom provider list; Cancel/Save reset it from `saved`.
  let items = $state<ProviderDefinition[]>([]);
  let editing = $state<number | null>(null);
  let editingIsNew = $state(false);
  let choosingStart = $state(false);
  let confirmDelete = $state<string | null>(null);
  let blockedMessage = $state('');
  let saveMessage = $state('');
  let saving = $state(false);
  let justSaved = $state(false);

  let validation = $state<ProviderValidation | null>(null);
  let debouncing = $state(false);
  let inflight = $state(0);
  const validating = $derived(debouncing || inflight > 0);

  // Last focused argument input, used by the {prompt}/{model} insert buttons.
  let lastFocus: { owner: ArgOwner; index: number; el: HTMLInputElement } | null = null;

  $effect(() => {
    // Re-sync when the saved list changes (initial load, or after a save).
    items = clone(saved);
    editing = null;
    validation = null;
  });

  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  /** Same shape that is saved: empty optional lists are omitted. */
  function normalize(d: ProviderDefinition): ProviderDefinition {
    const out = clone(d);
    if (!out.modelArgs?.length) delete out.modelArgs;
    if (!out.models?.length) delete out.models;
    for (const pm of out.permissionModes) {
      if (!pm.extraArgs?.length) delete pm.extraArgs;
    }
    return out;
  }

  const dirty = $derived(JSON.stringify(items.map(normalize)) !== JSON.stringify(saved));
  const errors = $derived(validation?.errors ?? []);
  const canSave = $derived(dirty && !validating && !saving && errors.length === 0);
  const builtinIds = $derived(new Set(builtins.map((b) => b.id)));
  const RECOMMENDED_START = 'claude';
  // Recommended built-in first, the others in their original order.
  const startOptions = $derived([
    ...builtins.filter((b) => b.id === RECOMMENDED_START),
    ...builtins.filter((b) => b.id !== RECOMMENDED_START),
  ]);

  // Debounced validation of the provider being edited.
  $effect(() => {
    if (editing === null) {
      debouncing = false;
      return;
    }
    const index = editing;
    const all = items.map(normalize);
    const definition = all[index];
    if (!definition) return;
    debouncing = true;
    const timer = setTimeout(() => {
      debouncing = false;
      inflight++;
      postMessage('validateProvider', { definition, index, all });
    }, 300);
    return () => clearTimeout(timer);
  });

  function startAdd(source: 'blank' | string) {
    choosingStart = false;
    const ids = new Set([...builtins.map((b) => b.id), ...items.map((i) => i.id)]);
    let def: ProviderDefinition;
    const base = builtins.find((b) => b.id === source);
    if (base) {
      def = clone(base);
      let id = `${base.id}-custom`;
      for (let n = 2; ids.has(id); n++) id = `${base.id}-custom-${n}`;
      def.id = id;
      def.label = `${base.label} (custom)`;
    } else {
      def = {
        id: '',
        label: '',
        binary: '',
        fileRefFormat: '@{path}',
        batch: { args: ['{prompt}'] },
        permissionModes: [{ id: 'default', label: 'Default', mode: 'batch' }],
      };
    }
    items.push(def);
    openEditor(items.length - 1, true);
  }

  function openEditor(index: number, isNew: boolean) {
    for (const d of items) {
      d.modelArgs ??= [];
      d.models ??= [];
      for (const pm of d.permissionModes) pm.extraArgs ??= [];
    }
    validation = null;
    editingIsNew = isNew;
    editing = index;
    blockedMessage = '';
    saveMessage = '';
    lastFocus = null;
  }

  function cancel() {
    items = clone(saved);
    editing = null;
    validation = null;
    saveMessage = '';
  }

  function requestDelete(id: string) {
    blockedMessage = '';
    const setting = Object.keys(usedBy).find((key) => usedBy[key] === id);
    // Removing an override of a built-in id only reverts to the built-in definition.
    if (setting && !builtinIds.has(id)) {
      blockedMessage = `In use by ${setting}; select another provider first.`;
      confirmDelete = null;
      return;
    }
    confirmDelete = id;
  }

  function doDelete(id: string) {
    items = items.filter((d) => d.id !== id);
    confirmDelete = null;
  }

  function save() {
    saving = true;
    saveMessage = '';
    postMessage('saveProviders', { providers: items.map(normalize) });
  }

  // --- argument list helpers ---

  function insertToken(owner: ArgOwner, token: string) {
    if (lastFocus && lastFocus.owner === owner) {
      const { index, el } = lastFocus;
      const value = owner[index] ?? '';
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? start;
      owner[index] = value.slice(0, start) + token + value.slice(end);
    } else {
      owner.push(token);
    }
  }

  function move(list: string[], index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
  }

  function toggleInvocation(d: ProviderDefinition, key: 'batch' | 'interactive', on: boolean) {
    if (on) d[key] = { args: ['{prompt}'] };
    else delete d[key];
  }

  function addMode(d: ProviderDefinition) {
    d.permissionModes.push({ id: '', label: '', mode: d.batch || !d.interactive ? 'batch' : 'interactive', extraArgs: [] });
  }

  // --- error placement ---

  function at(path: string): string[] {
    return errors.filter((e) => e.path === path).map((e) => e.message);
  }

  function knownPaths(d: ProviderDefinition): Set<string> {
    const out = new Set<string>(['id', 'label', 'binary', 'fileRefFormat', 'batch', 'batch.args', 'interactive', 'interactive.args', 'modelArgs', 'permissionModes', 'models']);
    d.batch?.args.forEach((_, i) => out.add(`batch.args[${i}]`));
    d.interactive?.args.forEach((_, i) => out.add(`interactive.args[${i}]`));
    d.modelArgs?.forEach((_, i) => out.add(`modelArgs[${i}]`));
    d.models?.forEach((_, i) => out.add(`models[${i}]`));
    d.permissionModes.forEach((pm, i) => {
      for (const f of ['', '.id', '.label', '.mode', '.extraArgs']) out.add(`permissionModes[${i}]${f}`);
      pm.extraArgs?.forEach((_, j) => out.add(`permissionModes[${i}].extraArgs[${j}]`));
    });
    return out;
  }

  const current = $derived(editing !== null ? items[editing] : undefined);
  const topErrors = $derived.by(() => {
    if (!current) return [];
    const known = knownPaths(current);
    return errors.filter((e) => !known.has(e.path));
  });

  onMount(() => {
    onMessage((msg) => {
      if (msg.type === 'providerValidation') {
        const d = msg.data as ProviderValidation;
        inflight = Math.max(0, inflight - 1);
        // Only the answer to the latest request is current.
        if (inflight === 0 && d.index === editing) validation = d;
      } else if (msg.type === 'providersSaved') {
        saving = false;
        saveMessage = '';
        editing = null;
        justSaved = true;
        setTimeout(() => (justSaved = false), 2000);
      } else if (msg.type === 'providersSaveError') {
        saving = false;
        saveMessage = (msg.data as { message: string }).message;
      }
    });
  });
</script>

{#snippet fieldErrors(path: string)}
  {#each at(path) as message}
    <p class="field-error">{message}</p>
  {/each}
{/snippet}

{#snippet stringList(path: string, list: string[], tokens: 'both' | 'model' | 'none', placeholder: string)}
  <div class="arg-list">
    {#each list as _, i}
      <div class="arg-row">
        <input
          class="form-input mono"
          class:invalid={at(`${path}[${i}]`).length > 0}
          type="text"
          {placeholder}
          aria-label="{path} {i + 1}"
          value={list[i]}
          onfocus={(e) => (lastFocus = { owner: list, index: i, el: e.currentTarget as HTMLInputElement })}
          oninput={(e) => (list[i] = (e.currentTarget as HTMLInputElement).value)}
        />
        <button class="chip-btn" aria-label="Move up" disabled={i === 0} onclick={() => move(list, i, -1)}>↑</button>
        <button class="chip-btn" aria-label="Move down" disabled={i === list.length - 1} onclick={() => move(list, i, 1)}>↓</button>
        <button class="chip-btn chip-remove" aria-label="Remove" onclick={() => list.splice(i, 1)}>×</button>
      </div>
      {@render fieldErrors(`${path}[${i}]`)}
    {/each}
    <div class="arg-actions">
      <button class="btn-reset" onclick={() => list.push('')}>Add</button>
      {#if tokens === 'both'}
        <button class="btn-reset" onclick={() => insertToken(list, '{prompt}')}>Insert {'{prompt}'}</button>
      {/if}
      {#if tokens !== 'none'}
        <button class="btn-reset" onclick={() => insertToken(list, '{model}')}>Insert {'{model}'}</button>
      {/if}
    </div>
    {@render fieldErrors(path)}
  </div>
{/snippet}

<div class="provider-editor">
  {#if saveMessage}
    <p class="field-error">{saveMessage}</p>
  {/if}
  {#if blockedMessage}
    <p class="field-error">{blockedMessage}</p>
  {/if}

  {#if items.length === 0 && editing === null}
    <p class="field-hint">No custom providers. Add one to run another agent CLI, or to override Claude or Copilot with your own arguments.</p>
  {/if}

  {#each items as p, i (i)}
    {#if editing !== i}
      <section class="model-card">
        <div class="label-row">
          <span class="field-label">{p.label || '(no label)'}</span>
          {#if builtinIds.has(p.id)}<span class="mode-badge custom">overrides built-in</span>{/if}
        </div>
        <p class="field-hint"><code>{p.id || '(no id)'}</code> · binary <code>{p.binary || '(none)'}</code></p>
        <div class="arg-actions">
          <button class="btn-reset" disabled={editing !== null} onclick={() => openEditor(i, false)}>Edit</button>
          {#if confirmDelete === p.id}
            <button class="btn-reset danger" onclick={() => doDelete(p.id)}>Confirm delete</button>
            <button class="btn-reset" onclick={() => (confirmDelete = null)}>Keep</button>
          {:else}
            <button class="btn-reset" disabled={editing !== null} onclick={() => requestDelete(p.id)}>Delete</button>
          {/if}
        </div>
      </section>
    {/if}
  {/each}

  {#if current && editing !== null}
    {@const d = current}
    <section class="model-card edit-form">
      <div class="label-row">
        <span class="field-label">{editingIsNew ? 'New provider' : `Edit ${d.label || d.id}`}</span>
        {#if builtinIds.has(d.id)}<span class="mode-badge custom">overrides built-in</span>{/if}
      </div>

      {#each topErrors as e}
        <p class="field-error">{e.path ? `${e.path}: ` : ''}{e.message}</p>
      {/each}

      <div class="field">
        <label class="field-label" for="prov-id">Id</label>
        <input id="prov-id" class="form-input mono" class:invalid={at('id').length > 0} type="text" placeholder="e.g. codex" bind:value={d.id} readonly={!editingIsNew} />
        {#if editingIsNew}
          <p class="field-hint">A short internal name: lowercase letters, digits and dashes, starting with a letter. It is saved in your settings and can't be changed later. Use <code>claude</code> or <code>copilot</code> to replace a built-in provider.</p>
        {:else}
          <p class="field-hint">The id cannot change after the first save; specs and settings may reference it.</p>
        {/if}
        {@render fieldErrors('id')}
      </div>
      <div class="field">
        <label class="field-label" for="prov-label">Label</label>
        <input id="prov-label" class="form-input" class:invalid={at('label').length > 0} type="text" placeholder="e.g. OpenAI Codex CLI" bind:value={d.label} />
        <p class="field-hint">The name shown in the provider dropdowns.</p>
        {@render fieldErrors('label')}
      </div>
      <div class="field">
        <label class="field-label" for="prov-binary">Binary</label>
        <input id="prov-binary" class="form-input mono" class:invalid={at('binary').length > 0} type="text" placeholder="e.g. codex" bind:value={d.binary} />
        <p class="field-hint">The program to run: the command you type in a terminal, or its full path. Arguments go in the invocation lists below, not here.</p>
        {@render fieldErrors('binary')}
        {#if validation && !validation.binaryFound && d.binary}
          <p class="field-warning">"{d.binary}" was not found on PATH</p>
        {/if}
      </div>
      <div class="field">
        <label class="field-label" for="prov-fileref">File reference format</label>
        <input id="prov-fileref" class="form-input mono" class:invalid={at('fileRefFormat').length > 0} type="text" bind:value={d.fileRefFormat} />
        <p class="field-hint">How this CLI refers to a file in a prompt. SDD uses it to point the AI at the instructions file for each run. Include <code>{'{path}'}</code> once: Claude uses <code>@{'{path}'}</code>, Copilot uses <code>#file:{'{path}'}</code>, and CLIs that just take a plain path use <code>{'{path}'}</code>.</p>
        {@render fieldErrors('fileRefFormat')}
      </div>

      {#each INVOCATIONS as key}
        {@const inv = d[key]}
        <div class="field">
          <label class="toggle-label">
            <input type="checkbox" checked={inv !== undefined} onchange={(e) => toggleInvocation(d, key, (e.currentTarget as HTMLInputElement).checked)} />
            {key === 'batch' ? 'Batch invocation' : 'Interactive invocation'}
          </label>
          {#if key === 'batch'}
            <p class="field-hint">The arguments that make the CLI run on its own and exit when done, with no questions asked (e.g. <code>exec</code>, <code>{'{prompt}'}</code>). Turn this off if the CLI has no unattended mode.</p>
          {:else}
            <p class="field-hint">The arguments that open a chat session in the terminal, where you can watch and approve the AI's actions (often just <code>{'{prompt}'}</code>).</p>
          {/if}
          {#if inv}
            <p class="field-hint">Enter one argument per row, in order. Don't add quotes; SDD quotes each argument for you. <code>{'{prompt}'}</code> is replaced with the instruction to read the spec, and must appear exactly once.</p>
            {@render stringList(`${key}.args`, inv.args, 'both', 'argument')}
          {/if}
          {@render fieldErrors(key)}
        </div>
      {/each}

      <div class="field">
        <span class="field-label">Model arguments</span>
        <p class="field-hint">How to pass the chosen model to the CLI, e.g. <code>--model</code> then <code>{'{model}'}</code>. These are added only when a model is selected. Leave empty if the CLI has no model option.</p>
        {@render stringList('modelArgs', d.modelArgs!, 'model', 'e.g. --model')}
      </div>

      <div class="field">
        <span class="field-label">Permission modes</span>
        <p class="field-hint">The choices offered in the "Permission mode" dropdown for this provider, i.e. how much the AI may do without asking. Each mode runs either the Batch or the Interactive invocation above, plus its own extra arguments. The first mode is the default.</p>
        {#each d.permissionModes as pm, mi}
          <div class="mode-row">
            <div class="label-row">
              <span class="mode-title">Mode {mi + 1}{mi === 0 ? ' (default)' : ''}</span>
              <button class="chip-btn chip-remove" aria-label="Remove mode" title="Remove mode" disabled={d.permissionModes.length === 1} onclick={() => d.permissionModes.splice(mi, 1)}>×</button>
            </div>
            <div class="mode-fields">
              <div class="mode-field">
                <label class="sub-label" for={`pm-id-${mi}`}>Id</label>
                <input id={`pm-id-${mi}`} class="form-input mono" class:invalid={at(`permissionModes[${mi}].id`).length > 0} type="text" placeholder="e.g. auto" bind:value={pm.id} />
                <span class="field-hint">Internal name saved in settings.</span>
              </div>
              <div class="mode-field">
                <label class="sub-label" for={`pm-label-${mi}`}>Name</label>
                <input id={`pm-label-${mi}`} class="form-input" class:invalid={at(`permissionModes[${mi}].label`).length > 0} type="text" placeholder="e.g. Full auto" bind:value={pm.label} />
                <span class="field-hint">Shown in the dropdown.</span>
              </div>
              <div class="mode-field">
                <label class="sub-label" for={`pm-mode-${mi}`}>Runs as</label>
                <select id={`pm-mode-${mi}`} class="form-select" bind:value={pm.mode}>
                  <option value="batch">Batch (unattended)</option>
                  <option value="interactive">Interactive (you approve)</option>
                </select>
                <span class="field-hint">{pm.mode === 'batch' ? 'Uses the Batch invocation; required for bulk execution.' : 'Uses the Interactive invocation in a terminal session.'}</span>
              </div>
            </div>
            {@render fieldErrors(`permissionModes[${mi}].id`)}
            {@render fieldErrors(`permissionModes[${mi}].label`)}
            {@render fieldErrors(`permissionModes[${mi}].mode`)}
            {@render fieldErrors(`permissionModes[${mi}]`)}
            <span class="sub-label">Extra arguments</span>
            <span class="field-hint">Flags added only for this mode, e.g. <code>--full-auto</code> or <code>--dangerously-skip-permissions</code>. Leave empty if none.</span>
            {@render stringList(`permissionModes[${mi}].extraArgs`, pm.extraArgs!, 'none', 'e.g. --full-auto')}
          </div>
        {/each}
        <div class="arg-actions"><button class="btn-reset" onclick={() => addMode(d)}>Add permission mode</button></div>
        {@render fieldErrors('permissionModes')}
      </div>

      <div class="field">
        <span class="field-label">Suggested models</span>
        <p class="field-hint">Model names offered as suggestions in the model field, first one as the default. Users can still type any other model. Your own lists in "Model Lists" take priority.</p>
        {@render stringList('models', d.models!, 'none', 'e.g. gpt-5.5')}
      </div>

      {#if errors.length === 0 && validation && validation.previews.length > 0}
        <div class="field">
          <span class="field-label">Command preview</span>
          <p class="field-hint">The exact command SDD will run for each permission mode, using the first suggested model. Check it before saving.</p>
          <div class="preview-list">
            {#each validation.previews as pv (pv.modeId)}
              <div class="preview-item">
                <span class="preview-label">{pv.label}</span>
                <pre class="preview">{pv.command}</pre>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="arg-actions">
        {#if validating}<span class="unsaved">Validating…</span>{/if}
        <button class="btn-save" disabled={!canSave} onclick={save}>{saving ? 'Saving…' : 'Save providers'}</button>
        <button class="btn-reset" onclick={cancel}>Cancel</button>
      </div>
    </section>
  {:else}
    <div class="arg-actions">
      {#if choosingStart}
        <span class="field-hint">Start from:</span>
        {#each startOptions as b (b.id)}
          <button class={b.id === RECOMMENDED_START ? 'btn-add' : 'btn-secondary'} onclick={() => startAdd(b.id)}>
            Copy of {b.label}{b.id === RECOMMENDED_START ? ' (Recommended)' : ''}
          </button>
        {/each}
        <button class="btn-secondary" onclick={() => startAdd('blank')}>Blank</button>
        <button class="btn-reset" onclick={() => (choosingStart = false)}>Cancel</button>
        {#if builtins.some((b) => b.id === RECOMMENDED_START)}
          <p class="field-hint start-hint">Recommended: start from Claude CLI. It comes with every field already filled in and working, so you only change what's different for your CLI.</p>
        {/if}
      {:else}
        <button class="btn-add" onclick={() => (choosingStart = true)}>Add provider</button>
      {/if}
      {#if dirty}
        <button class="btn-save" disabled={!canSave} onclick={save}>{saving ? 'Saving…' : 'Save providers'}</button>
        <button class="btn-reset" onclick={cancel}>Discard changes</button>
      {:else if justSaved}
        <span class="saved">Saved!</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .provider-editor { display: flex; flex-direction: column; gap: 10px; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .arg-list { display: flex; flex-direction: column; gap: 4px; }
  .arg-row { display: flex; gap: 4px; align-items: center; }
  .arg-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .mode-row { display: flex; flex-direction: column; gap: 4px; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
  .mode-fields { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; }
  .mode-field { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 140px; }
  .mode-title { font-size: 0.85em; font-weight: 600; }
  .sub-label { font-size: 0.8em; font-weight: 600; }
  .mono { font-family: var(--vscode-editor-font-family, monospace); }
  .invalid { border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); }
  .preview-list { display: flex; flex-direction: column; gap: 8px; }
  .preview-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
  }
  .preview-label { font-size: 0.8em; font-weight: 600; color: var(--vscode-descriptionForeground); }
  .preview {
    margin: 0;
    padding: 6px 8px;
    background: var(--vscode-textCodeBlock-background);
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85em;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .saved { font-size: 0.85em; color: #2ea043; }

  .form-select, .form-input {
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
  .form-input:read-only { opacity: 0.6; }
  .field-label { font-weight: 600; font-size: 0.9em; }
  .field-hint { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin: 0; }
  .field-hint code { background: var(--vscode-textCodeBlock-background); padding: 0 3px; border-radius: 2px; }
  .field-warning { font-size: 0.8em; margin: 0; color: var(--vscode-editorWarning-foreground, var(--vscode-charts-yellow)); }
  .field-error { font-size: 0.8em; margin: 0; color: var(--vscode-errorForeground); }
  .unsaved { font-size: 0.85em; color: var(--vscode-editorWarning-foreground, var(--vscode-charts-yellow)); }
  .label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .toggle-label { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 0.9em; cursor: pointer; }
  .toggle-label input[type='checkbox'] { accent-color: var(--vscode-button-background); }

  .model-card { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
  .mode-badge { font-size: 0.75em; padding: 1px 8px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .mode-badge.custom { outline: 1px solid var(--vscode-focusBorder); }

  .btn-add, .btn-save {
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
  .btn-save { padding: 6px 24px; font-weight: 600; }
  .btn-add:hover:not(:disabled), .btn-save:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  .btn-add:disabled, .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
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
  }
  .btn-reset:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
  .btn-reset:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    padding: 4px 12px;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
  }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .start-hint { flex-basis: 100%; }
  .btn-reset.danger { color: var(--vscode-errorForeground); border-color: var(--vscode-errorForeground); }
  .chip-btn { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 0 4px; font-size: inherit; border-radius: 3px; }
  .chip-btn:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); }
  .chip-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .chip-remove { color: var(--vscode-errorForeground); }
</style>
