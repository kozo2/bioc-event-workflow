// CONFIGURATION - <<< YOU MUST EDIT THESE VALUES >>>
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId(); // This gets the ID of the current spreadsheet.
const SHEET_NAME = "Form Responses 1"; // The name of the sheet that receives form responses.
const CALENDAR_ID = "YOUR_BIOCONDUCTOR_CALENDAR_ID@group.calendar.google.com"; // <<< REPLACE THIS
const GITHUB_REPO_OWNER = "your-github-org-or-username"; // <<< REPLACE THIS (e.g., "Bioconductor")
const GITHUB_REPO_NAME = "your-website-repository-name"; // <<< REPLACE THIS (e.g., "bioconductor.org")
const GITHUB_PAT = "YOUR_GITHUB_PERSONAL_ACCESS_TOKEN"; // <<< REPLACE THIS - Store Securely!
const GITHUB_ACTION_EVENT_TYPE = "new-event-for-website"; // This is a custom name you choose for the dispatch event.

// Column Names (Ensure these exactly match your Google Sheet column headers)
const HEADER_EVENT_TITLE = "Event Title";
const HEADER_EVENT_DATE = "Event Date";
const HEADER_START_TIME = "Event Start Time";
const HEADER_END_TIME = "Event End Time";
const HEADER_DESCRIPTION = "Event Description";
const HEADER_LOCATION_URL = "Location/URL";
const HEADER_SUBMITTER_EMAIL = "Submitter Email"; // Example, if you collect it
const HEADER_EVENT_RELEVANCE = "How is this event relevant to Bioconductor?";
const HEADER_TIMEZONE = "What timezone are the times above in";

const HEADER_APPROVAL_STATUS = "Approval Status"; // Manually added column
const HEADER_CALENDAR_EVENT_ID = "Calendar Event ID"; // Manually added column
const HEADER_GITHUB_TRIGGERED = "GitHub Action Triggered"; // Manually added column
const HEADER_PROCESSED_TIMESTAMP = "Processed Timestamp"; // Manually added column

const APPROVED_VALUE = "Approved";
const PENDING_VALUE = "Pending";
const REJECTED_VALUE = "Rejected";
const GITHUB_TRIGGERED_YES = "Yes";
// --- END OF CONFIGURATION ---

/**
 * Adds a custom menu to the spreadsheet UI.
 */
function onOpen() {
SpreadsheetApp.getUi()
  .createMenu('Bioconductor Event Workflow')
  .addItem('1. Process Approved Events', 'processApprovedEvents')
  .addSeparator()
  .addItem('Test GitHub Dispatch', 'testGitHubDispatch') // For testing GitHub connection
  .addToUi();
}

/**
 * Main function to iterate through the sheet, find "Approved" events,
 * create calendar entries, and trigger GitHub actions.
 */
function processApprovedEvents() {
const ui = SpreadsheetApp.getUi();
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

if (!sheet) {
  ui.alert(`Sheet "${SHEET_NAME}" not found. Please check configuration.`);
  Logger.log(`Sheet "${SHEET_NAME}" not found.`);
  return;
}

const dataRange = sheet.getDataRange();
const values = dataRange.getValues();
const headers = values[0];
const headerMap = getHeaderMap(headers);

// Validate required columns
const requiredManualHeaders = [HEADER_APPROVAL_STATUS, HEADER_CALENDAR_EVENT_ID, HEADER_GITHUB_TRIGGERED, HEADER_PROCESSED_TIMESTAMP, HEADER_EVENT_RELEVANCE, HEADER_TIMEZONE];
for (const header of requiredManualHeaders) {
  if (headerMap[header] === undefined) {
    ui.alert(`Error: Critical column "${header}" not found in sheet. Please add it and re-run.`);
    Logger.log(`Error: Critical column "${header}" not found in sheet.`);
    return;
  }
}
  const requiredFormHeaders = [HEADER_EVENT_TITLE, HEADER_EVENT_DATE, HEADER_START_TIME, HEADER_END_TIME, HEADER_DESCRIPTION, ];
  for (const header of requiredFormHeaders) {
  if (headerMap[header] === undefined) {
    ui.alert(`Error: Expected form column "${header}" not found in sheet. Please check form and sheet column names.`);
    Logger.log(`Error: Expected form column "${header}" not found in sheet.`);
    return;
  }
}


const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
if (!calendar) {
  ui.alert(`Google Calendar with ID "${CALENDAR_ID}" not found or inaccessible. Check CALENDAR_ID and permissions.`);
  Logger.log(`Google Calendar with ID "${CALENDAR_ID}" not found.`);
  return;
}

let eventsProcessedCount = 0;
let errorsEncountered = 0;

// Iterate over rows, skipping header row (index 0)
for (let i = 1; i < values.length; i++) {
  const row = values[i];
  const approvalStatus = row[headerMap[HEADER_APPROVAL_STATUS]];
  const calendarEventId = row[headerMap[HEADER_CALENDAR_EVENT_ID]];
  const githubTriggered = row[headerMap[HEADER_GITHUB_TRIGGERED]];
  const processedTimestamp = row[headerMap[HEADER_PROCESSED_TIMESTAMP]];

  // Check if event is approved and not fully processed yet
  if (approvalStatus === APPROVED_VALUE && !processedTimestamp) {
    
    Logger.log(row);
    
    const eventRelevance = row[headerMap[HEADER_EVENT_RELEVANCE]];
    const eventTitle = row[headerMap[HEADER_EVENT_TITLE]];
    Logger.log(`Processing approved event: "${eventTitle}" (Row ${i + 1})`);

    let startTimeValue = row[headerMap[HEADER_START_TIME]]; // Get the value
    let endTimeValue = row[headerMap[HEADER_END_TIME]];      // Get the value
    const timeZone = row[headerMap[HEADER_TIMEZONE]];

    try {
      // --- 1. Add to Google Calendar (if not already added) ---
      let currentCalendarEventId = calendarEventId;
      if (!calendarEventId) {
        const eventDate = new Date(row[headerMap[HEADER_EVENT_DATE]]);        
        const description = row[headerMap[HEADER_DESCRIPTION]] || ""; // Handle empty description
        const location = row[headerMap[HEADER_LOCATION_URL]] || ""; // Handle empty location

        if (isNaN(eventDate.getTime())) {
          throw new Error(`Invalid Event Date for "${eventTitle}"`);
        }

        let startDateTime, endDateTime;

        // Construct startDateTime
        if (startTimeValue instanceof Date) { // If Google Sheets automatically converted to full Date object with time
          startDateTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(),
                                    startTimeValue.getHours(), startTimeValue.getMinutes(), startTimeValue.getSeconds());
        } else if (typeof startTimeValue === 'string' && startTimeValue.match(/\d{1,2}:\d{2}/)) { // HH:mm format
          const [hours, minutes] = startTimeValue.split(':').map(Number);
          startDateTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), hours, minutes);
        } else { // Assume all-day or handle error if time is mandatory and invalid
            Logger.log(`Warning: Start time for "${eventTitle}" is invalid or missing. Creating as all-day event for the specified date.`);
            startDateTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
            // For all-day, endDateTime is the beginning of the next day. CalendarApp handles this.
            endDateTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate() + 1);
        }

        // Construct endDateTime (only if not an all-day event from above)
        if (endDateTime === undefined) { // i.e. not set as all day above
          if (endTimeValue instanceof Date) {
              endDateTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(),
                                    endTimeValue.getHours(), endTimeValue.getMinutes(), endTimeValue.getSeconds());
          } else if (typeof endTimeValue === 'string' && endTimeValue.match(/\d{1,2}:\d{2}/)) {
              const [hours, minutes] = endTimeValue.split(':').map(Number);
              endDateTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), hours, minutes);
          }  else {
                Logger.log(`Warning: End time for "${eventTitle}" is invalid or missing. Defaulting to 1 hour duration from start time.`);
                endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hour later
            }
          }


          if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime()) || endDateTime <= startDateTime) {
            throw new Error(`Invalid start/end time for "${eventTitle}". Start: ${startDateTime}, End: ${endDateTime}`);
          }

          const newCalEvent = calendar.createEvent(eventTitle, startDateTime, endDateTime, {
            description: description,
            location: location
          });
          currentCalendarEventId = newCalEvent.getId();
          sheet.getRange(i + 1, headerMap[HEADER_CALENDAR_EVENT_ID] + 1).setValue(currentCalendarEventId);
          Logger.log(`Event "${eventTitle}" added to calendar. ID: ${currentCalendarEventId}`);
        } else {
          Logger.log(`Event "${eventTitle}" already has a Calendar ID: ${calendarEventId}. Skipping calendar creation.`);
        }

        // --- 2. Trigger GitHub Action (if not already triggered) ---
        if (githubTriggered !== GITHUB_TRIGGERED_YES) {
          const eventDataForGitHub = {
            title: eventTitle,
            date: Utilities.formatDate(new Date(row[headerMap[HEADER_EVENT_DATE]]), Session.getScriptTimeZone(), "yyyy-MM-dd"),
            startTime: startTimeValue instanceof Date ? Utilities.formatDate(startTimeValue, Session.getScriptTimeZone(), "HH:mm:ss") : (typeof startTimeValue === 'string' ? startTimeValue : ""),
            endTime: endTimeValue instanceof Date ? Utilities.formatDate(endTimeValue, Session.getScriptTimeZone(), "HH:mm:ss") : (typeof endTimeValue === 'string' ? endTimeValue : ""),
            description: row[headerMap[HEADER_DESCRIPTION]] || "",
            location: row[headerMap[HEADER_LOCATION_URL]] || "",
            submitterEmail: row[headerMap[HEADER_SUBMITTER_EMAIL]] || "", // Example of another field
            googleSheetRow: i + 1 // For traceability in GitHub Action
            // Add any other relevant data your GitHub action might need
          };

          const ghResponse = triggerRepositoryDispatch(eventDataForGitHub);
          if (ghResponse.getResponseCode() === 204) { // 204 No Content is success for dispatch
            sheet.getRange(i + 1, headerMap[HEADER_GITHUB_TRIGGERED] + 1).setValue(GITHUB_TRIGGERED_YES);
            Logger.log(`GitHub Action triggered successfully for "${eventTitle}".`);
          } else {
            throw new Error(`GitHub Action trigger failed for "${eventTitle}". Code: ${ghResponse.getResponseCode()}. Response: ${ghResponse.getContentText()}`);
          }
        } else {
           Logger.log(`GitHub Action already triggered for "${eventTitle}". Skipping trigger.`);
        }

        // --- 3. Mark as fully processed ---
        sheet.getRange(i + 1, headerMap[HEADER_PROCESSED_TIMESTAMP] + 1).setValue(new Date());
        eventsProcessedCount++;

      } catch (e) {
        errorsEncountered++;
        Logger.log(`ERROR processing row ${i + 1} ("${eventTitle}"): ${e.message} \nStack: ${e.stack || 'No stack'}`);
        // Optionally, mark the row with an error status in a new "Error Message" column
        // sheet.getRange(i + 1, headerMap["Error Message"] + 1).setValue(e.message);
      }
    }
  }

  let summaryMessage = `${eventsProcessedCount} event(s) processed successfully.`;
  if (errorsEncountered > 0) {
    summaryMessage += `\n${errorsEncountered} error(s) occurred. Check logs for details.`;
  }
  if (eventsProcessedCount === 0 && errorsEncountered === 0) {
    summaryMessage = "No new 'Approved' events found to process.";
  }
  ui.alert(summaryMessage);
  Logger.log(summaryMessage);
}

/**
 * Helper function to create a map of header names to zero-based column indices.
 * @param {Array<String>} headers The first row of the sheet.
 * @return {Object} A map like { "Header Name": 0, "Another Header": 1, ... }
 */
function getHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    map[header.trim()] = index; // Trim whitespace from headers
  });
  return map;
}

/**
 * Triggers a GitHub repository_dispatch event.
 * @param {Object} clientPayload The data to send to the GitHub Action.
 * @return {GoogleAppsScript.URL_Fetch.HTTPResponse} The HTTP response object.
 */
function triggerRepositoryDispatch(clientPayload) {
  if (!GITHUB_PAT || GITHUB_PAT === "YOUR_GITHUB_PERSONAL_ACCESS_TOKEN") {
    throw new Error("GitHub PAT is not configured in the script. Please replace 'YOUR_GITHUB_PERSONAL_ACCESS_TOKEN'.");
  }
   if (!GITHUB_REPO_OWNER || GITHUB_REPO_OWNER === "your-github-org-or-username" || !GITHUB_REPO_NAME || GITHUB_REPO_NAME === "your-website-repository-name") {
    throw new Error("GitHub repository owner or name is not configured correctly.");
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`;
  const payload = {
    event_type: GITHUB_ACTION_EVENT_TYPE,
    client_payload: clientPayload
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "token " + GITHUB_PAT,
      "Accept": "application/vnd.github.v3+json" // Recommended by GitHub API docs
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // Allows us to get the response code and content even on errors
  };

  Logger.log(`Triggering GitHub dispatch to ${url} with payload: ${JSON.stringify(payload)}`);
  const response = UrlFetchApp.fetch(url, options);
  Logger.log(`GitHub dispatch response code: ${response.getResponseCode()}, body: ${response.getContentText()}`);
  return response;
}

/**
 * A test function to directly trigger a GitHub dispatch with sample data.
 * Useful for verifying PAT and GitHub Action setup.
 */
function testGitHubDispatch() {
  const ui = SpreadsheetApp.getUi();
  if (GITHUB_PAT === "YOUR_GITHUB_PERSONAL_ACCESS_TOKEN" || !GITHUB_PAT) {
     ui.alert("Test Aborted: GitHub PAT is not configured in the script. Please set the GITHUB_PAT variable.");
     return;
  }
   if (!GITHUB_REPO_OWNER || GITHUB_REPO_OWNER === "your-github-org-or-username" || !GITHUB_REPO_NAME || GITHUB_REPO_NAME === "your-website-repository-name") {
    ui.alert("Test Aborted: GitHub repository owner or name is not configured correctly.");
    return;
  }


  const testPayload = {
    title: "Test Event from Apps Script",
    date: "2025-12-31",
    startTime: "10:00:00",
    endTime: "11:00:00",
    description: "This is a test event triggered manually to check GitHub dispatch.",
    location: "Virtual Test",
    message: "Testing repository_dispatch from Google Apps Script " + new Date().toISOString()
  };

  try {
    const response = triggerRepositoryDispatch(testPayload);
    if (response.getResponseCode() === 204) {
      ui.alert("Test GitHub Dispatch Successful!", "Response Code: 204 (No Content). This means GitHub accepted the event. Check your repository's Actions tab.", ui.ButtonSet.OK);
    } else {
      ui.alert("Test GitHub Dispatch Failed", `Response Code: ${response.getResponseCode()}\nResponse Body: ${response.getContentText()}`, ui.ButtonSet.OK);
    }
  } catch (e) {
    Logger.log(`Error during testGitHubDispatch: ${e.toString()}`);
    ui.alert("Test GitHub Dispatch Error", `An error occurred: ${e.message}`, ui.ButtonSet.OK);
  }
}

function getTimeCellData() {
  // Open the active spreadsheet and select the sheet by name.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Form Responses 1'); // ← Change to your sheet name

  // Specify the cell containing the time value.
  var timeRange = sheet.getRange('D5');    // ← Change to your target cell

  // Get the cell value. If formatted as Time, this returns a Date object.
  var timeValue = timeRange.getValue();

  // Log the raw Date object.
  Logger.log('Raw time value (Date object): ' + timeValue.getMinutes());

}
