# url-tracker
Web crawler to track HTTP responses and URL changes on a website

## Intro
This app is meant for use by digital marketers who need to keep track of changes and errors on client websites that could potentially break their ads or conversion tracking.

## Setup:
1. Initialize your own version of this Git repo.
2. Copy the [Google Sheets template](https://docs.google.com/spreadsheets/d/1aeca_gGQUFudhYY-h1zOgNhu-ku8BycCEjmyxLw9bbo/edit?usp=sharing).
3. Use example.env.json to safely import the necessary secrets, IDs, and keys.
4. Get Google API credentials.
..1. Go to the [Google API Console](https://console.developers.google.com/apis/library).
..2. Create a new project.
..3. Enable the Google Drive API
..4. Go to Credentials, select 'Create Credentials', then select 'Service account key'.
..5. Select 'App Engine default service account'.
..6. You will receive a JSON file with credentials for accessing Google Apps.
5. Get Postmark credentials
..1. Create an account on [Postmark](https://postmarkapp.com/).
..2. Create a server for this app.
..3. Under 'Credentials', copy the 'Server API Token'.
6. Push the app to your hosting service (I just use [Heroku](https://www.heroku.com/)).
7. Create production environment variables that correspond with the env.json variables.
..* If using Heroku, how-to is [here](https://devcenter.heroku.com/articles/config-vars).

## Running the App:

### Note:
* The text input must have the exact ID of the Google Sheet that you are using.
* If the 'id' parameter is in the app's URL, the text input will be filled in automatically.

### Process:
1. The app starts by collecting all URLs in the 'Current URLs' sheet.
..* These URLs can be from multiple domains.
2. The app crawls all pages on all domains included in the URLs, saving the following:
..* All URLs that don't already exist in 'Current URLs'.
..* All URLs that return a status in the 400s.
..* URLs of all pages that contain links to pages with statuses in the 400s (along with the href of those links).
3. The app writes new/changed URLs and broken links info to the corresponding sheets.
4. If there is new info, the app sends a notification e-mail to all addresses under 'email_recipients' on the 'Instructions' page.

** Known Issues
* The app uses 40x URLs on the 'Current URLs' sheet to identify broken links when it comes across them in crawling the pages.
..* This means that any new 40x URLs (ones that have changed since the last time the app was run) will not be included in the list of broken links, resulting in a one-use delay in tracking those links (these URLs will, however, appear in 'New/Changed URLs' with their current status).
..* This was done to cut down on processing time, as keeping track of all links on all pages, checking for an error status code for each one, would extend an already long process.

