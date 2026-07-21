import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Request } from 'express';
import { Role } from 'src/generated/prisma/enums';

/**
 * Must be used AFTER JwtAuthGuard (or any guard that populates
 * request.user), since this guard only reads req.user.role and does
 * not perform authentication itself.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Extract allowed roles from the @Roles decorator metadata
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles are specified, allow public access to the route
    if (!requiredRoles) return true;

    // Get the request object with strict TypeScript typing for the user role
    const request = context.switchToHttp().getRequest<Request & { user?: { role?: Role } }>();
    const user = request.user;

    // Deny access if the user object is missing (not authenticated)
    if (!user) return false;

    // Deny access if the user has no role defined
    if (!user?.role) return false;
    
    // Grant access only if the user's role matches the required roles
    return requiredRoles.includes(user.role);
  }
}