I want to propose a refactoring on the review column in the kanban and the pipeline process behind

1. I want to remove all github actions for PR and commit in the pipeline.
2. I want to add in the "AI config"  section to enable a command to parse together with the prompt to submit a commit and another to make a PR. Make the dafult as the recommended but the builder can adapt it (specially for bulky execution). These two commands will be parse together in the prompt during execution. We can enable or disable them by a button.
3. The executed SDD will be moved automatically to review when it is finished.
4. I want to add at the bottom of the SDD in the review, a frame below each card to show all files changed in that execution. The approve button will simply move the card to done and update the file status.
5. The "request changes" will prompt a modal to send it to the AI CLI for a change. I need a bit more idea on how to improve the UX here. 


  │                  Idea                  │                                    Current State                                     │
  ├────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤                                                                                                                                      │ 1. Remove GitHub actions from pipeline │ Currently hardcoded in reviewCommands.ts approval flow (branch→stage→commit→push→PR) │
  ├────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
  │ 2. Commit/PR commands in AI Config     │ Not implemented — only prePromptTemplate exists                                      │
  ├────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
  │ 3. Auto-move to review on finish       │ Already implemented in executeSpec.ts line 176                                       │
  ├────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
  │ 4. Show changed files in review cards  │ Data exists in execution records but not shown in kanban                             │
  ├────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤
  │ 5. Request changes modal               │ Basic flow exists (text input → re-execute offer), UX needs work  