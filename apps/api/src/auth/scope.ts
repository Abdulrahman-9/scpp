import type { AuthUser } from './auth.types.js';

/** Operator-scoped roles may only touch their own company (10.x). One definition, reused. */
export const isOperatorScoped = (user: AuthUser): boolean => user.role === 'OPERATOR_ADMIN' || user.role === 'OPERATOR_USER';

/** Prisma `where` fragment that limits a query to the caller's company when scoped. */
export const operatorScopeWhere = (user: AuthUser): { operatorId?: string } => (isOperatorScoped(user) ? { operatorId: user.operatorId } : {});
