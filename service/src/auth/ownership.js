// service/src/auth/ownership.js

function isService(principal) {
  return principal && principal.kind === 'service';
}

function isOwner(principal, ownerId) {
  if (!principal || !ownerId) return false;
  return principal.subject === ownerId;
}

/**
 * Can this caller READ this event?
 * EO: only their own events.
 * Service account: any event (within granted scope).
 */
function mayReadEvent(principal, event) {
  if (!principal || !event) return false;
  if (isService(principal)) return true;
  return isOwner(principal, event.organizer_id);
}

/**
 * Can this caller WRITE into this event (create sites, rosters, etc.)?
 */
function mayWriteEvent(principal, event) {
  if (!principal || !event) return false;
  if (isService(principal)) return true;
  return isOwner(principal, event.organizer_id);
}

/**
 * Can this caller APPROVE sites for this event?
 * Per ADR 0003: EO only.
 */
function mayApproveSites(principal, event) {
  if (!principal || !event) return false;
  if (isService(principal)) return true;
  return isOwner(principal, event.organizer_id);
}

/**
 * Can this caller SUBMIT collections for this roster?
 * Crew: only their own rosters (roster.crew_id === principal.subject).
 */
function mayWriteCollection(principal, roster) {
  if (!principal || !roster) return false;
  if (isService(principal)) return true;
  return isOwner(principal, roster.crew_id);
}

/**
 * Can this caller CONFIRM this event?
 * Admin-only (scope-gated). Trust any valid event.
 */
function mayConfirmEvent(principal, event) {
  if (!principal || !event) return false;
  if (isService(principal)) return true;
  return isOwner(principal, event.organizer_id);
}

module.exports = {
  isService,
  isOwner,
  mayReadEvent,
  mayWriteEvent,
  mayApproveSites,
  mayWriteCollection,
  mayConfirmEvent,
};
