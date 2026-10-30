#!/usr/bin/env bash
# Sets the GitHub repository topics required by the HACS "topics" check.
# Requires GitHub CLI (https://cli.github.com) authenticated: gh auth login
set -e
REPO="Gaudi111/status-timeline-card"
gh repo edit "$REPO" \
  --add-topic hacs \
  --add-topic home-assistant \
  --add-topic homeassistant \
  --add-topic lovelace \
  --add-topic lovelace-custom-card \
  --add-topic custom-card \
  --add-topic dashboard \
  --add-topic timeline
gh repo edit "$REPO" --description "Lovelace card: daily on/off timeline for up to 3 entities, configurable day start/end, total on-time per day."
gh repo view "$REPO" --json repositoryTopics,licenseInfo
