import * as vscode from 'vscode';
import { parseSpec } from './parser';
import { validateSpec, type ValidationError } from './validator';

const SDD_FILE_PATTERN = /\.sdd\.md$/;
const DEBOUNCE_MS = 300;

// Maps ValidationError field names to markdown section headings to search for
const SECTION_HEADING_MAP: Record<string, string> = {
  context: '## Context',
  functionalRequirements: '### Functional',
  nonFunctionalRequirements: '### Non-Functional',
  automatedCriteria: '### Automated',
  manualCriteria: '### Manual',
  constraints: '## Constraints',
  examples: '## Examples',
};

/**
 * Finds the 0-based line number where a frontmatter field key appears.
 * Searches only within the frontmatter block (between the two `---` delimiters).
 * Returns 0 if not found.
 */
function findFrontmatterFieldLine(lines: string[], field: string): number {
  // The frontmatter starts at line 0 with `---` and ends at the next `---`
  let inFrontmatter = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (i === 0 && trimmed === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && trimmed === '---') {
      break;
    }
    if (inFrontmatter && trimmed.startsWith(`${field}:`)) {
      return i;
    }
  }
  return 0;
}

/**
 * Finds the 0-based line number where a section heading appears.
 * Returns the last line of the frontmatter (closing `---`) if not found.
 */
function findSectionHeadingLine(lines: string[], heading: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === heading) {
      return i;
    }
  }
  return 0;
}

/**
 * Resolves the best-effort line number for a ValidationError.
 * Frontmatter fields are mapped to their key line; section fields to their heading.
 */
function resolveErrorLine(lines: string[], error: ValidationError): number {
  const sectionHeading = SECTION_HEADING_MAP[error.field];
  if (sectionHeading) {
    return findSectionHeadingLine(lines, sectionHeading);
  }
  // Treat as a frontmatter field
  return findFrontmatterFieldLine(lines, error.field);
}

/**
 * Converts a ValidationError to a vscode.Diagnostic.
 */
function toDiagnostic(lines: string[], error: ValidationError): vscode.Diagnostic {
  const lineIndex = resolveErrorLine(lines, error);
  const lineText = lines[lineIndex] ?? '';
  const range = new vscode.Range(
    lineIndex,
    0,
    lineIndex,
    lineText.length || 1,
  );
  const severity =
    error.severity === 'warning'
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Error;
  const diagnostic = new vscode.Diagnostic(range, error.message, severity);
  diagnostic.source = 'sdd';
  return diagnostic;
}

export class SpecDiagnosticsProvider {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('sdd');
  }

  register(context: vscode.ExtensionContext): void {
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(doc => {
        if (SDD_FILE_PATTERN.test(doc.fileName)) {
          this.validate(doc);
        }
      }),
      vscode.workspace.onDidSaveTextDocument(doc => {
        if (SDD_FILE_PATTERN.test(doc.fileName)) {
          this.validate(doc);
        }
      }),
      vscode.workspace.onDidChangeTextDocument(event => {
        const doc = event.document;
        if (!SDD_FILE_PATTERN.test(doc.fileName)) {
          return;
        }
        const key = doc.uri.toString();
        const existing = this.debounceTimers.get(key);
        if (existing !== undefined) {
          clearTimeout(existing);
        }
        const timer = setTimeout(() => {
          this.debounceTimers.delete(key);
          this.validate(doc);
        }, DEBOUNCE_MS);
        this.debounceTimers.set(key, timer);
      }),
      vscode.workspace.onDidCloseTextDocument(doc => {
        if (SDD_FILE_PATTERN.test(doc.fileName)) {
          this.collection.delete(doc.uri);
          const key = doc.uri.toString();
          const timer = this.debounceTimers.get(key);
          if (timer !== undefined) {
            clearTimeout(timer);
            this.debounceTimers.delete(key);
          }
        }
      }),
    );

    // Validate all already-open .sdd.md documents
    for (const doc of vscode.workspace.textDocuments) {
      if (SDD_FILE_PATTERN.test(doc.fileName)) {
        this.validate(doc);
      }
    }

    context.subscriptions.push(this);
  }

  private validate(doc: vscode.TextDocument): void {
    const content = doc.getText();
    const lines = content.split('\n');

    const parseResult = parseSpec(content);
    if (!parseResult.success) {
      // Map parse errors to line 0 (or find the relevant frontmatter line)
      const diagnostics = parseResult.errors.map(err => {
        const lineIndex = err.line !== undefined ? err.line : 0;
        const lineText = lines[lineIndex] ?? '';
        const range = new vscode.Range(lineIndex, 0, lineIndex, lineText.length || 1);
        return new vscode.Diagnostic(range, err.message, vscode.DiagnosticSeverity.Error);
      });
      diagnostics.forEach(d => { d.source = 'sdd'; });
      this.collection.set(doc.uri, diagnostics);
      return;
    }

    const validationResult = validateSpec(parseResult.data);
    if (validationResult.errors.length === 0) {
      this.collection.set(doc.uri, []);
      return;
    }

    const diagnostics = validationResult.errors.map(err => toDiagnostic(lines, err));
    this.collection.set(doc.uri, diagnostics);
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    for (const sub of this.subscriptions) {
      sub.dispose();
    }
    this.collection.dispose();
  }
}

/**
 * Convenience function — creates the provider, registers it, and returns it.
 */
export function activate(context: vscode.ExtensionContext): SpecDiagnosticsProvider {
  const provider = new SpecDiagnosticsProvider();
  provider.register(context);
  return provider;
}
