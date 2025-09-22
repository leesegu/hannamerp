export const idToEmail = (id, employeeNo) =>
  `${String(id).trim().toLowerCase()}+${String(employeeNo).trim()}@hannam-erp.local`;
