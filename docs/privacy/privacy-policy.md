# Privacy Policy — CoralClock: Screen Time & Website Blocker

TL;DR: CoralClock stores your browsing activity on your own device to provide screen-time tracking and blocking. Nothing is sent to any server.

**Effective date:** 2026-07-08

## What data CoralClock collects

CoralClock collects the following information about your browsing activity, solely to provide its screen-time tracking and website-blocking features:

- **Domain names and URLs** of pages you visit
- **Time spent** on each site, broken down into active (keyboard/mouse input), audio-playing, and idle sessions
- **Rules you create** (site targets, time limits, periods)
- **Settings** (idle threshold, clock format, week start day)

No personal account information, credentials, or payment data is ever collected.

## How your data is stored

All data is stored **locally on your device only**, using the browser's built-in storage APIs (`chrome.storage.local` and IndexedDB). It is never transmitted to any external server, cloud service, or third party.

## Data sharing

CoralClock does not share, sell, rent, or transmit your data to anyone. There are no analytics services, advertising networks, or third-party SDKs included in the extension.

## Permissions used

CoralClock requests the following browser permissions:

| Permission | Reason |
|---|---|
| `storage` | Save browsing intervals, rules, and settings locally |
| `tabs` | Detect which tab is active to measure time accurately |
| `webNavigation` | Detect page navigations to start and stop time tracking |
| `declarativeNetRequestWithHostAccess` | Block sites when a time limit is reached |
| `alarms` | Flush tracking data periodically and check limits on a schedule |
| `idle` | Detect when you step away from the computer to pause active-time tracking |
| `favicon` | Display site icons in the dashboard |
| `notifications` | Alert you when a time limit is reached or being approached |
| `<all_urls>` (optional host permission) | Requested only for the specific site(s) you set a rule on, so CoralClock can redirect that site once its limit is reached; a rule for a keyword or regex pattern requests it for all sites since no single site can be named in advance. Not held for sites you haven't set a rule for. |

## Your control over your data

You can view, prune, and permanently delete your browsing data at any time using the **Manage Storage** page within CoralClock. Uninstalling the extension removes all data.

## Data export

CoralClock allows you to export your data as a JSON file for backup or personal analysis. This file stays on your device and is never uploaded anywhere by the extension.

## Changes to this policy

If this policy changes materially, the updated version will be published at this URL with a new effective date.
