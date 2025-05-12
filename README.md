# bioc-event-workflow

**How to Use This Script:**

1.  **Open Your Google Sheet:** The one linked to your Google Form.
2.  **Open Apps Script Editor:** Go to "Extensions" > "Apps Script".
3.  **Paste the Code:** Delete any default `Code.gs` content and paste the [event_manager.gs](https://github.com/kozo2/bioc-event-workflow/blob/main/event_manager.gs) script code.
4.  **IMPORTANT: Configure Constants:**
    * Carefully edit the values in the `CONFIGURATION` section at the top of the script:
        * `SHEET_NAME` (if it's not `"Form Responses 1"`)
        * `CALENDAR_ID` (replace with your Bioconductor Google Calendar ID)
        * `GITHUB_REPO_OWNER`
        * `GITHUB_REPO_NAME`
        * `GITHUB_PAT` (paste your GitHub Personal Access Token here)
        * `GITHUB_ACTION_EVENT_TYPE` (you can keep the default or change it, but make sure it matches your GitHub Action workflow file).
5.  **Save the Script:** Click the floppy disk icon (Save project). Give your project a name (e.g., "Bioconductor Event Automation").
6.  **Authorize the Script:**
    * The first time you run a function (e.g., by refreshing the sheet to trigger `onOpen`, or by manually running `processApprovedEvents` from the script editor), Google will prompt for authorization.
    * You'll need to grant permissions for:
        * Managing your spreadsheets.
        * Managing your calendars.
        * Connecting to external services (for `UrlFetchApp` to call GitHub).
    * Review the permissions carefully and click "Allow". You might see a warning screen saying "Google hasn't verified this app"; click "Advanced" and then "Go to (your project name) (unsafe)". This is normal for scripts you write yourself.
7.  **Add Columns to Your Sheet:** Manually add the following columns to your "Form Responses 1" sheet if they don't exist:
    * `Approval Status`
    * `Calendar Event ID`
    * `GitHub Action Triggered`
    * `Processed Timestamp`
8.  **Test:**
    * Add a sample event row in your sheet.
    * Manually type `"Approved"` into the `Approval Status` column for that row.
    * Refresh your Google Sheet. You should see a new menu: "Bioconductor Event Workflow".
    * Click "Bioconductor Event Workflow" > "1. Process Approved Events".
    * Check your Google Calendar and the columns in your sheet (`Calendar Event ID`, `GitHub Action Triggered`, `Processed Timestamp`) to see if they were populated.
    * Check your GitHub repository's "Actions" tab to see if the workflow was triggered.
    * You can also use "Bioconductor Event Workflow" > "Test GitHub Dispatch" to *only* test the GitHub connection part.
9.  **Set Up Triggers (Optional but Recommended for Automation):**
    * In the Apps Script editor, click the "Triggers" icon (alarm clock) on the left sidebar.
    * Click "+ Add Trigger".
    * Choose function to run: `processApprovedEvents`.
    * Choose deployment: `Head`.
    * Select event source: `Time-driven`.
    * Select type of time-based trigger: e.g., "Hour timer", "Every 1 hour" (or less frequent, like "Day timer" at a specific time, depending on how often you want to check for new approved events).
    * Click "Save".
    * This will automatically run the `processApprovedEvents` function periodically.
