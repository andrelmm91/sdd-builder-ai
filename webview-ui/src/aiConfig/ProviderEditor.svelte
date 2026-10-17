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
        <input id="prov-id" class="form-input mono" class:invalid={at('id').length > 0} type="text" bind:value={d.id} readonly={!editingIsNew} />
        {#if !editingIsNew}<p class="field-hint">The id cannot change after the first save; specs and settings may reference it.</p>{/if}
        {@render fieldErrors('id')}
      </div>
      <div class="field">
        <label class="field-label" for="prov-label">Label</label>
        <input id="prov-label" class="form-input" class:invalid={at('label').length > 0} type="text" bind:value={d.label} />
        {@render fieldErrors('label')}
      </div>
      <div class="field">
        <label class="field-label" for="prov-binary">Binary</label>
        <input id="prov-binary" class="form-input mono" class:invalid={at('binary').length > 0} type="text" bind:value={d.binary} />
        {@render fieldErrors('binary')}
        {#if validation && !validation.binaryFound && d.binary}
          <p class="field-warning">"{d.binary}" was not found on PATH</p>
        {/if}
      </div>
      <div class="field">
        <label class="field-label" for="prov-fileref">File reference format</label>
        <input id="prov-fileref" class="form-input mono" class:invalid={at('fileRefFormat').length > 0} type="text" bind:value={d.fileRefFormat} />
        <p class="field-hint">Use <code>{'{path}'}</code> once, e.g. <code>@{'{path}'}</code> or <code>#file:{'{path}'}</code>.</p>
        {@render fieldErrors('fileRefFormat')}
      </div>

      {#each INVOCATIONS as key}
        {@const inv = d[key]}
        <div class="field">
          <label class="toggle-label">
            <input type="checkbox" checked={inv !== undefined} onchange={(e) => toggleInvocation(d, key, (e.currentTarget as HTMLInputElement).checked)} />
            {key === 'batch' ? 'Batch invocation' : 'Interactive invocation'}
          </label>
          {#if inv}
            {@render stringList(`${key}.args`, inv.args, 'both', 'argument')}
          {/if}
          {@render fieldErrors(key)}
        </div>
      {/each}

      <div class="field">
        <span class="field-label">Model arguments</span>
        <p class="field-hint">Added only when a model is set; must contain <code>{'{model}'}</code>.</p>
        {@render stringList('modelArgs', d.modelArgs!, 'model', 'e.g. --model')}
      </div>

      <div class="field">
        <span class="field-label">Permission modes</span>
        {#each d.permissionModes as pm, mi}
          <div class="mode-row">
            <div class="mode-fields">
              <input class="form-input mono" class:invalid={at(`permissionModes[${mi}].id`).length > 0} type="text" placeholder="id" aria-label="Mode id" bind:value={pm.id} />
              <input class="form-input" class:invalid={at(`permissionModes[${mi}].label`).length > 0} type="text" placeholder="label" aria-label="Mode label" bind:value={pm.label} />
              <select class="form-select" aria-label="Mode type" bind:value={pm.mode}>
                <option value="batch">Batch</option>
                <option value="interactive">Interactive</option>
              </select>
              <button class="chip-btn chip-remove" aria-label="Remove mode" disabled={d.permissionModes.length === 1} onclick={() => d.permissionModes.splice(mi, 1)}>×</button>
            </div>
            {@render fieldErrors(`permissionModes[${mi}].id`)}
            {@render fieldErrors(`permissionModes[${mi}].label`)}
            {@render fieldErrors(`permissionModes[${mi}].mode`)}
            {@render fieldErrors(`permissionModes[${mi}]`)}
            <span class="field-hint">Extra arguments</span>
            {@render stringList(`permissionModes[${mi}].extraArgs`, pm.extraArgs!, 'none', 'argument')}
          </div>
        {/each}
        <div class="arg-actions"><button class="btn-reset" onclick={() => addMode(d)}>Add permission mode</button></div>
        {@render fieldErrors('permissionModes')}
      </div>

      <div class="field">
        <span class="field-label">Suggested models</span>
        {@render stringList('models', d.models!, 'none', 'model id')}
      </div>

      {#if errors.length === 0 && validation && validation.previews.length > 0}
        <div class="field">
          <span class="field-label">Command preview</span>
          <pre class="preview">{#each validation.previews as pv}{pv.label}: {pv.command}
{/each}</pre>
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
        <button class="btn-reset" onclick={() => startAdd('blank')}>Blank</button>
        {#each builtins as b}
          <button class="btn-reset" onclick={() => startAdd(b.id)}>Copy of {b.label}</button>
        {/each}
        <button class="btn-reset" onclick={() => (choosingStart = false)}>Cancel</button>
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
  .mode-fields { display: flex; gap: 6px; align-items: center; }
  .mode-fields .form-input, .mode-fields .form-select { flex: 1; min-width: 0; width: auto; }
  .mono { font-family: var(--vscode-editor-font-family, monospace); }
  .invalid { border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); }
  .preview {
    margin: 0;
    padding: 8px;
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
  .btn-reset.danger { color: var(--vscode-errorForeground); border-color: var(--vscode-errorForeground); }
  .chip-btn { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 0 4px; font-size: inherit; border-radius: 3px; }
  .chip-btn:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); }
  .chip-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .chip-remove { color: var(--vscode-errorForeground); }
</style>
