# Privacy Policy — Punishment Mode - Site Blocker and Tracker

**Last updated: October 2, 2026**

## Overview

Punishment Mode is a Chrome extension that blocks distracting websites and records attempts, time totals, and optional webcam photos locally. The extension does not transmit or share this data.

## Data Storage

Settings, attempt history, and tracking totals are stored locally on your device using Chrome's `chrome.storage.local` API. Photos use local IndexedDB; active tracking state uses session storage. This includes:

- Your list of blocked and tracked websites
- Attempt counts and timestamps
- Webcam photos captured on the block page or during deliberate site removal
- Time tracking statistics

None of this data ever leaves your browser. There is no server, no cloud storage, no sync service, and no external database.

## Webcam Usage

The extension uses your device's camera to capture a photo when you visit a blocked site or complete the site removal process. These photos are stored locally in IndexedDB. They are never uploaded, transmitted, or shared with any external service or third party. Blocking and attempt recording continue if camera access is denied.

Camera access requires your explicit permission and can be revoked at any time through Chrome's site settings.

## Permissions

The extension requests the following permissions:

- **declarativeNetRequest / declarativeNetRequestWithHostAccess**: Required to redirect blocked sites to the extension's block page. Broad host access is necessary because users can block any website of their choice.
- **storage**: Required to save your settings, blocked site list, attempt history, and captured photos locally.
- **offscreen**: Required to access the camera for photo capture in the background.
- **webNavigation**: Required as a backup mechanism to detect navigation to blocked sites.
- **alarms**: Required for periodic time tracking updates.

## Data Collection

The extension records the local data described above. It has no remote data collection:

- No browsing history is transmitted
- No analytics or tracking scripts are included
- No data is sent to any server or third party
- No cookies are set or read by the extension
- No user accounts are created or required

## Third-Party Services

This extension does not use any third-party services, APIs, or SDKs. Fonts used by extension pages are bundled with the extension.

## Incognito

Incognito protection requires you to enable “Allow in Incognito” in Chrome settings. When enabled, attempts and tracking totals are included in the local report. Incognito photos use temporary local storage and are deleted when all Incognito windows close. Chrome lets you disable or uninstall the extension.

## Data Deletion

All extension data can be deleted at any time by uninstalling the extension or clearing the extension's storage through Chrome's settings. Since no data is stored externally, uninstalling the extension permanently removes all associated data.

## Changes to This Policy

Any changes to this privacy policy will be reflected in the extension's update notes and this document.

## Contact

For questions about this privacy policy, contact nikitavoitik2006@gmail.com.
