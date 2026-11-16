import { UserRole } from '@prisma/client';
import { Request } from 'express';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
