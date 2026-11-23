export const ADMIN_ROLES: readonly string[];
export const CLINICIAN_ROLES: readonly string[];
export const STAFF_ROLES: readonly string[];
export function rolesFor(action: string): string[];
export function canPerform(role: string, action: string): boolean;
export function modulesFor(role: string): string[];
export function canAccessModule(role: string, key: string): boolean;
export function careDepartmentsFor(role: string): string[];
export function visitTransitionsFor(role: string, from: string): string[];
