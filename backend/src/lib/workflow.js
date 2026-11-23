/**
 * Application status state machine — the single source of truth for which
 * role may move an application from which status to which status.
 *
 *   DRAFT ──submit──▶ SUBMITTED ──start_review──▶ UNDER_REVIEW
 *                         ▲                          │
 *                         │ respond          request_info / recommend_*
 *                         │                          ▼
 *                  MORE_INFO_NEEDED ◀──── RECOMMENDED_APPROVAL / RECOMMENDED_REJECTION
 *                                                    │ approve / reject (admin)
 *                                                    ▼
 *                                          APPROVED / REJECTED (terminal)
 */
export const ACTIONS = {
  SUBMIT: {
    from: ['DRAFT'],
    to: 'SUBMITTED',
    roles: ['APPLICANT'],
    noteRequired: false,
  },
  RESPOND: {
    from: ['MORE_INFO_NEEDED'],
    to: 'SUBMITTED',
    roles: ['APPLICANT'],
    noteRequired: true,
  },
  START_REVIEW: {
    from: ['SUBMITTED'],
    to: 'UNDER_REVIEW',
    roles: ['OFFICER', 'ADMIN'],
    noteRequired: false,
  },
  REQUEST_INFO: {
    from: ['UNDER_REVIEW'],
    to: 'MORE_INFO_NEEDED',
    roles: ['OFFICER', 'ADMIN'],
    noteRequired: true,
  },
  RECOMMEND_APPROVAL: {
    from: ['UNDER_REVIEW'],
    to: 'RECOMMENDED_APPROVAL',
    roles: ['OFFICER'],
    noteRequired: true,
    requiresEligibility: true,
  },
  RECOMMEND_REJECTION: {
    from: ['UNDER_REVIEW'],
    to: 'RECOMMENDED_REJECTION',
    roles: ['OFFICER'],
    noteRequired: true,
    requiresEligibility: true,
  },
  APPROVE: {
    from: ['RECOMMENDED_APPROVAL', 'RECOMMENDED_REJECTION'],
    to: 'APPROVED',
    roles: ['ADMIN'],
    noteRequired: true,
  },
  REJECT: {
    from: ['RECOMMENDED_APPROVAL', 'RECOMMENDED_REJECTION'],
    to: 'REJECTED',
    roles: ['ADMIN'],
    noteRequired: true,
  },
  RETURN_TO_OFFICER: {
    from: ['RECOMMENDED_APPROVAL', 'RECOMMENDED_REJECTION'],
    to: 'UNDER_REVIEW',
    roles: ['ADMIN'],
    noteRequired: true,
  },
};

export const ACTION_NAMES = Object.keys(ACTIONS);

/** Statuses in which the applicant may still edit their application / documents. */
export const APPLICANT_EDITABLE = ['DRAFT', 'MORE_INFO_NEEDED'];

export const TERMINAL = ['APPROVED', 'REJECTED'];

/**
 * @returns {{ ok: true, to: string } | { ok: false, reason: string }}
 */
export function checkTransition(action, currentStatus, role) {
  const def = ACTIONS[action];
  if (!def) return { ok: false, reason: `Unknown action ${action}` };
  if (!def.roles.includes(role)) {
    return { ok: false, reason: `Role ${role} cannot perform ${action}`, forbidden: true };
  }
  if (!def.from.includes(currentStatus)) {
    return { ok: false, reason: `Cannot ${action} an application that is ${currentStatus}` };
  }
  return { ok: true, to: def.to };
}

/** Actions a given role can take on an application in `status` (drives UI buttons). */
export function availableActions(status, role) {
  return ACTION_NAMES.filter((a) => ACTIONS[a].from.includes(status) && ACTIONS[a].roles.includes(role));
}
