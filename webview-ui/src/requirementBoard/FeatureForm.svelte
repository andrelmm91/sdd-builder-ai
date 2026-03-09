<script lang="ts">
  import { postMessage } from '../lib/vscode';

  export interface FeatureFormData {
    name: string;
    description: string;
    acceptanceCriteria: string;
    notes: string;
  }

  interface Props {
    oncancel: () => void;
    onsubmit: () => void;
  }

  let { oncancel, onsubmit }: Props = $props();

  let name = $state('');
  let description = $state('');
  let acceptanceCriteria = $state('');
  let notes = $state('');
  let attempted = $state(false);

  const nameInvalid = $derived(attempted && !name.trim());
  const descriptionInvalid = $derived(attempted && !description.trim());
  const criteriaInvalid = $derived(attempted && !acceptanceCriteria.trim());
  const canSubmit = $derived(
    name.trim() !== '' && description.trim() !== '' && acceptanceCriteria.trim() !== '',
  );

  function handleSubmit() {
    attempted = true;
    if (!canSubmit) return;

    postMessage('addFeature', {
      name: name.trim(),
      description: description.trim(),
      acceptanceCriteria: acceptanceCriteria.trim(),
      notes: notes.trim(),
    } satisfies FeatureFormData);

    name = '';
    description = '';
    acceptanceCriteria = '';
    notes = '';
    attempted = false;
    onsubmit();
  }

  function handleCancel() {
    name = '';
    description = '';
    acceptanceCriteria = '';
    notes = '';
    attempted = false;
    oncancel();
  }
</script>

<div class="form-container">
  <h2 class="form-title">Add New Feature</h2>

  <div class="field">
    <label for="feat-name" class="field-label">
      Feature Name <span class="required">*</span>
    </label>
    <input
      id="feat-name"
      type="text"
      class="field-input"
      class:invalid={nameInvalid}
      bind:value={name}
      placeholder="e.g. user_authentication"
    />
    {#if nameInvalid}
      <span class="error-msg">Name is required</span>
    {/if}
  </div>

  <div class="field">
    <label for="feat-description" class="field-label">
      Description <span class="required">*</span>
    </label>
    <textarea
      id="feat-description"
      class="field-textarea"
      class:invalid={descriptionInvalid}
      bind:value={description}
      rows={3}
      placeholder="Describe the feature..."
    ></textarea>
    {#if descriptionInvalid}
      <span class="error-msg">Description is required</span>
    {/if}
  </div>

  <div class="field">
    <label for="feat-criteria" class="field-label">
      Acceptance Criteria <span class="required">*</span>
    </label>
    <textarea
      id="feat-criteria"
      class="field-textarea"
      class:invalid={criteriaInvalid}
      bind:value={acceptanceCriteria}
      rows={3}
      placeholder="When... then..."
    ></textarea>
    {#if criteriaInvalid}
      <span class="error-msg">Acceptance Criteria is required</span>
    {/if}
  </div>

  <div class="field">
    <label for="feat-notes" class="field-label">Notes</label>
    <textarea
      id="feat-notes"
      class="field-textarea"
      bind:value={notes}
      rows={2}
      placeholder="Optional notes..."
    ></textarea>
  </div>

  <div class="form-actions">
    <button class="btn-cancel" onclick={handleCancel}>Cancel</button>
    <button
      class="btn-submit"
      onclick={handleSubmit}
      disabled={attempted && !canSubmit}
    >
      Add Feature
    </button>
  </div>
</div>

<style>
  .form-container {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 16px;
    margin: 8px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
  }

  .form-title {
    margin: 0;
    font-size: 1em;
    font-weight: 700;
    color: var(--vscode-foreground);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .required {
    color: var(--vscode-inputValidation-errorBorder, #f44747);
  }

  .field-input,
  .field-textarea {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 3px;
    padding: 5px 8px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    resize: vertical;
  }

  .field-input:focus,
  .field-textarea:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .field-input.invalid,
  .field-textarea.invalid {
    border-color: var(--vscode-inputValidation-errorBorder, #f44747);
  }

  .error-msg {
    font-size: 0.78em;
    color: var(--vscode-inputValidation-errorForeground, #f44747);
  }

  .form-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .btn-cancel {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    padding: 4px 14px;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
  }
  .btn-cancel:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .btn-submit {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 4px 14px;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
  }
  .btn-submit:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }
  .btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
