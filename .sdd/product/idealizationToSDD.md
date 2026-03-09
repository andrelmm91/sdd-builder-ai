## Idealization process to SDD

1. Add a new button in the SDD dashboard called "Open Requirement board" next to "Open Kanban Board". 
2. By clicking the button, it will a new kanban board with only three columns "Feature Backlog", "Idealization In Review" and "SDD created".
3. The user can add new features to the "Feature Backlog" column by clicking on "Add new feature".
4. By clicking "Add new feature", a form will open where the user can input the feature name, description, acceptance criteria and notes.
5. The extension parse them into a markdown format and place them in a folder inside .sdd/product/{feature_name} with the name of the feature as "feature name".
6. Parse a field in the file for status and set it to "Feature Backlog".
7. The new feature will appear in the "Feature Backlog" column in that kanban board.
8. The kanban must parse all features inside .sdd/product/ and place them in the right column based on the status field in each file.

9. Inside the card for each feature, there will be a button called "Idealize requirements".
10. The extension will send to the AI CLI the following prompt: "Based on the following feature description, acceptance criteria and notes in @{.sdd/product/feature_name/feature_name.md}, create a new markdown file (named idealization.md) in the same folder with a concise idealization of this feature. Make sure to include all the important information and recommendations. The idealization should be clear and easy to understand for the development team.". The AI CLI will return the idealization in markdown format.
11. The extension must check whether the new file is named as idealization.md, if not it must be renamed to idealization.md. The extension must check whether it has a status field, if not it will add it and set it to "Idealization In Review" at the top f the file. If it already exists, it will update the status to "Idealization In Review". Add a date field with the current date below it.
11a. The title shown in the kanban board for the idealization.md must come from the its folder name feature_name.
12. The file {feature name}.md must also be updated with "Idealization In Review" in the status field and the date of the last update. However, it should NOT be shown in the kanban board anymore afterwards since its counterpart file has been created and placed in the column "Idealization In Review".

13. The files in the "Idealization In Review" column will be reviewed by the team. Once the idealization is approved, the builder will click on a button called "create SDD cards".
14. The extension will send to the AI CLI the following prompt: "create new phases and SDDs in @.specs\ to fulfill the requirements in @{.sdd/product/feature_name/idealization.md} by using skills in @.claude/skills/sdd-planner/SKILL.md. Add dependency from the other SDDs if needed." The AI CLI will return a list of SDDs with their content in markdown format.
15. After the completion, the extension will move the idealization.md file to the "SDD created" column and update its status to "SDD Created". The original {feature name}.md file will also be updated with the same status and date of last update, but still not shown anymore in the kanban board. The new SDD files will be created in the @.specs\ folder with the appropriate names and content as returned by the AI CLI.

16. {feature name}.md file is only shown in the kanban board only if its status is "Feature Backlog".