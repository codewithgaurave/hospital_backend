import RolePermission from "../models/RolePermission.js";

export const ALL_PERMISSIONS = [
  // Patients
  "patients.view",
  "patients.create",
  "patients.update",
  "patients.archive",
  "patients.search",
  // Visits
  "visits.view",
  "visits.create",
  "visits.update",
  "visits.archive",
  // History
  "history.view",
  "history.create",
  "history.update",
  // Documents
  "documents.view",
  "documents.upload",
  "documents.delete",
  // OPD / IPD
  "opd.view",
  "opd.create",
  "opd.update",
  "ipd.view",
  "ipd.create",
  "ipd.update",
  "ipd.discharge",
  // Reports
  "reports.view",
  "reports.print",
  "reports.export",
  // Follow-up
  "followups.view",
  "followups.create",
  "followups.update",
  // Histopathology
  "histopathology.view",
  "histopathology.create",
  "histopathology.update",
  // Users & Admin
  "users.view",
  "users.create",
  "users.update",
  "users.activate",
  "users.deactivate",
  "users.reset_password",
  "audit.view",
  "settings.view",
  "settings.update",
  // Profile & Password
  "profile.view",
  "profile.update",
  "password.change",
];

export const DEFAULT_ROLE_PERMISSIONS = {
  admin: ALL_PERMISSIONS,
  doctor: [
    "patients.view", "patients.create", "patients.update", "patients.search",
    "visits.view", "visits.create", "visits.update",
    "history.view", "history.create", "history.update",
    "documents.view", "documents.upload",
    "opd.view", "opd.create", "opd.update",
    "ipd.view", "ipd.create", "ipd.update", "ipd.discharge",
    "reports.view", "reports.print",
    "followups.view", "followups.create", "followups.update",
    "histopathology.view", "histopathology.create", "histopathology.update",
    "profile.view", "profile.update", "password.change"
  ],
  staff: [
    "patients.view", "patients.create", "patients.update", "patients.search",
    "visits.view", "visits.create",
    "history.view",
    "documents.view", "documents.upload",
    "opd.view", "opd.create",
    "ipd.view",
    "reports.view", "reports.print",
    "followups.view", "followups.create",
    "profile.view", "profile.update", "password.change"
  ]
};

// Check if a given role has a specific permission
export const checkRolePermission = async (role, permission) => {
  if (role === "admin") return true; // Admin has superuser override

  try {
    const roleDoc = await RolePermission.findOne({ role: role.toLowerCase() });
    if (roleDoc && Array.isArray(roleDoc.permissions)) {
      return roleDoc.permissions.includes(permission);
    }
  } catch (err) {
    console.error("Permission check error:", err.message);
  }

  const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role.toLowerCase()] || [];
  return defaultPerms.includes(permission);
};
