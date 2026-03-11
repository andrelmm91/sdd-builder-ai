Execution:
- execution for SDD and requirements cli should be the same. Requirements cli is not working for copilot (error: too many arguments. Expected 0 arguments but got 1.) and claude (doesnt show anything on the terminal after executing the command.)
- If the execution fails, the card is stuck on "processing" state.

Global config:
- add a AI config for the requirements the same way is done for SDD and save them separately in config.json
- remove hardcoded prompts for requirements and use the config file instead. This will allow us to update the prompts without changing the code.

Git diff issue:
- remove the git diff from the SDD dashboard. It is not working properly and is not providing any useful information. It is also causing confusion for users who are not familiar with git diff.

New spec creation:
- new spec manually:
    - only draft state
    - tags are not passing to the spec file
    - tags are parsing as bullet points (-) instead of coucelled list ([])
    - agent skills 

Cost summary:
- cost summary is not working
    - cost summary is not showing in the SDD dashboard
    - Remove "total cost" in dollar and only show "total tokens"
    - Change "Avg cost / spec"  to "Avg tokens / execution"
    - fix token consumption retrieval for copilot and claude. 
    - In recent activity, remove cost summary and only show token consumption

Manual SDD addition:
- when I add a SDD manually, it is not showing in the SDD dashboard directly. This is not hot-reloading the SDD dashboard. I have to refresh the page to see the new SDD.

Bulky execution:
- bulk execution should run SDD in their numerical (such as SDD-001 should run first than SDD-002) order in the list. currently, it is running randomly.
- After the bulky execution is done, the frame is back on ready and not removed even though the SDDs are in the "review" state.