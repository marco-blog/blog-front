/** 시스템 관리자 역할(006 data-model `users.role`). 콘솔은 이 역할만 연다. */
export const ADMIN_ROLES: readonly string[] = ["ADMIN", "SUPER_ADMIN"];

/** 콘솔을 쓸 수 있는 역할인지(세션 힌트. backend가 요청마다 DB 권한을 다시 확인한다) */
export function isAdmin(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && ADMIN_ROLES.includes(role);
}

/** 관리자 권한을 바꿀 수 있는 최고 관리자인지(006 FR-105) */
export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}
