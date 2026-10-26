# Arm rules with the panel

Status: ready-for-agent
Blocked by: 02

## What
The panel sends rules and armed state. The hook holds possibly-matching requests until delivery (500 ms timeout + warning) and disarms when the panel closes. Rules are stored per origin.

## Acceptance
e2e: a rule applies to a bootstrap request; closing the panel disarms it.

## Comments
