export const LOAN_TYPES = {
  PERSONAL: 'Personal',
  HOME: 'Home',
  VEHICLE: 'Vehicle',
  BUSINESS: 'Business',
};

export const EMPLOYMENT_TYPES = {
  SALARIED: 'Salaried',
  SELF_EMPLOYED: 'Self-employed',
  BUSINESS_OWNER: 'Business owner',
  UNEMPLOYED: 'Unemployed',
};

export const DOCUMENT_TYPES = {
  ID_PROOF: 'ID proof',
  INCOME_PROOF: 'Income proof',
  OTHER: 'Other / additional',
};

export const STATUS_META = {
  DRAFT: { label: 'Draft', tone: 'slate' },
  SUBMITTED: { label: 'Submitted', tone: 'blue' },
  UNDER_REVIEW: { label: 'Under review', tone: 'indigo' },
  MORE_INFO_NEEDED: { label: 'More info needed', tone: 'amber' },
  RECOMMENDED_APPROVAL: { label: 'Recommended: approve', tone: 'teal' },
  RECOMMENDED_REJECTION: { label: 'Recommended: reject', tone: 'orange' },
  APPROVED: { label: 'Approved', tone: 'green' },
  REJECTED: { label: 'Rejected', tone: 'red' },
};

export const ACTION_META = {
  CREATE: 'Created draft',
  SUBMIT: 'Submitted application',
  RESPOND: 'Responded to info request',
  START_REVIEW: 'Started review',
  REQUEST_INFO: 'Requested more information',
  RECOMMEND_APPROVAL: 'Recommended for approval',
  RECOMMEND_REJECTION: 'Recommended for rejection',
  APPROVE: 'Approved loan',
  REJECT: 'Rejected loan',
  RETURN_TO_OFFICER: 'Returned to officer',
};

export const ROLE_LABEL = { APPLICANT: 'Applicant', OFFICER: 'Loan Officer', ADMIN: 'Admin' };
