// service/src/auth/ownership.js

function isService(principal) {
  return principal && principal.kind === 'service';
}

function isOwner(principal, ownerId) {
  if (!principal || !ownerId) return false;
  return principal.subject === ownerId;
}

/**
 * Is this caller assigned as admin to this event?
 * Reads `_assigned_admin_ids` injected by store.
 */
function isAssignedAdmin(principal, event) {
  if (!principal || !event) return false;
  const assigned = event._assigned_admin_ids;
  if (!Array.isArray(assigned)) return false;
  return assigned.includes(principal.subject);
}

/**
 * Can this caller READ this event?
 * - Service account: yes (scope gated)
 * - Owner (EO): yes
 * - Assigned admin: yes
 */
function mayReadEvent(principal, event) {
  if (!principal || !event) return false;
  if (isService(principal)) return true;
  if (isOwner(principal, event.organizer_id)) return true;
  if (isAssignedAdmin(principal, event)) return true;   // ← BARU
  return false;
}

/**
 * Can this caller WRITE into this event (create sites, rosters)?
 * EO owner only. Admin tidak modif body event.
 */
function mayWriteEvent(principal, event) {
  if (!principal || !event) return false;
  if (isService(principal)) return true;
  return isOwner(principal, event.organizer_id);
}

/**
 * Can this caller APPROVE sites?
 * EO only (ADR 0003). Admin tidak diizinkan.
 */
function mayApproveSites(principal, event) {
  if (!principal || !event) return false;
  if (isService(principal)) return true;
  return isOwner(principal, event.organizer_id);
}

/**
 * Can this caller SUBMIT collections?
 * Crew only (roster.crew_id === principal.subject).
 */
function mayWriteCollection(principal, roster) {
  if (!principal || !roster) return false;
  if (isService(principal)) return true;
  return isOwner(principal, roster.crew_id);
}

/**
 * Can this caller CONFIRM this event?
 * - Service account: yes
 * - EO owner: yes
 * - Assigned admin: yes  ← inilah yang mengizinkan admin-a confirm evt_001
 */
function mayConfirmEvent(principal, event) {
  if (!principal || !event) return false;
  if (isService(principal)) return true;
  if (isOwner(principal, event.organizer_id)) return true;
  if (isAssignedAdmin(principal, event)) return true;   // ← BARU
  return false;
}

module.exports = {
  isService,
  isOwner,
  isAssignedAdmin,
  mayReadEvent,
  mayWriteEvent,
  mayApproveSites,
  mayWriteCollection,
  mayConfirmEvent,
};
