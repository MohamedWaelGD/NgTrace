# Failure badges, filter, tree counts and summary

Status: resolved
Blocked by: 01

## What
Store computes failures and retry chains. Row badges, "Failed only" chip (table and Timeline), failure count on tree nodes, and a Failures summary from the toolbar next to the Waste summary. The drawer shows the retry chain with links to each attempt.

## Acceptance
e2e: the demo error scenario shows the Failed badge, the filter narrows the table, and the summary lists the owner.

## Comments
2026-10-26: Implemented (store retryChains/failureSummary/failedOnly; Failed/Attempt/Recovered row badges; Failed only chip shared by table and Timeline; failed count on tree nodes; Failures summary; retry chain links in the drawer). e2e name helpers now read td.name .url since badges sit in the Name cell.
